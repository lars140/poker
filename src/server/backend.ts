import { z } from "zod";
import { UserError } from "../lib/errors";
import {
  addMember, cancelEvent, correctTournament, createEvent, createGroup, deleteGroup, emptyLeague, finalizeTournament,
  inviteToEvent, registerUser, removeMember, respondToEvent, setRole, updateEvent, updateGroup, updateProfile, viewFor,
  type League,
} from "../lib/domain";
import { displayNameSchema, parseOrThrow, passwordSchema, usernameSchema } from "../lib/validation";

// Framework-free backend. The Cloudflare Durable Object feeds it requests one at a time and
// persists the single JSON document it works on. Everything security relevant happens here.

export type Doc = {
  league: League;
  /** Salted PBKDF2 hashes. Never sent to clients. */
  credentials: Record<string, { salt: string; hash: string; iterations: number }>;
  /** Only SHA-256 hashes of session tokens are stored. */
  sessions: { tokenHash: string; userId: string; expiresAt: number }[];
  failures: Record<string, { count: number; lockedUntil: number }>;
};

export interface DocStore {
  load(): Promise<Doc | undefined>;
  save(doc: Doc): Promise<void>;
}

export type ApiRequest = { method: string; path: string; token?: string; body?: unknown };
export type ApiResponse = { status: number; body: unknown };

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 10;
const MAX_FAILURES = 8;
const LOCKOUT_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
const randomHex = (bytes: number) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

async function sha256Hex(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

async function pbkdf2(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- actions ----------------------------------------------------------------

type ActionOutcome = League | { league: League; id: string };
type Action = { schema: z.ZodType; run: (league: League, actor: string, args: never) => ActionOutcome };

function action<S extends z.ZodType>(schema: S, run: (league: League, actor: string, args: z.output<S>) => ActionOutcome): Action {
  return { schema, run: run as Action["run"] };
}

const id = z.string().min(1).max(100);
const text = z.string().max(2000);
const eventInput = z.object({
  title: text, description: text.optional(), location: text.optional(), startsAt: z.string().max(40),
  registrationDeadline: z.string().max(40).optional(), maxParticipants: z.union([z.string().max(10), z.number()]).optional(),
});
const placements = z.array(z.object({ userId: id, position: z.number() })).max(20);

const ACTIONS: Record<string, Action> = {
  updateProfile: action(z.object({ displayName: z.string().max(100).optional() }), (l, a, p) => updateProfile(l, a, p)),
  createGroup: action(z.object({ name: text, description: text.optional() }), (l, a, p) => createGroup(l, a, p)),
  updateGroup: action(z.object({ groupId: id, name: text, description: text.optional() }), (l, a, p) => updateGroup(l, a, p.groupId, p)),
  deleteGroup: action(z.object({ groupId: id }), (l, a, p) => deleteGroup(l, a, p.groupId)),
  addMember: action(z.object({ groupId: id, username: z.string().max(100) }), (l, a, p) => addMember(l, a, p.groupId, p.username)),
  setRole: action(z.object({ groupId: id, userId: id, role: z.enum(["admin", "member"]) }), (l, a, p) => setRole(l, a, p.groupId, p.userId, p.role)),
  removeMember: action(z.object({ groupId: id, userId: id }), (l, a, p) => removeMember(l, a, p.groupId, p.userId)),
  createEvent: action(z.object({ groupId: id, event: eventInput }), (l, a, p) => createEvent(l, a, p.groupId, p.event)),
  updateEvent: action(z.object({ groupId: id, eventId: id, event: eventInput }), (l, a, p) => updateEvent(l, a, p.groupId, p.eventId, p.event)),
  cancelEvent: action(z.object({ groupId: id, eventId: id }), (l, a, p) => cancelEvent(l, a, p.groupId, p.eventId)),
  inviteToEvent: action(z.object({ groupId: id, eventId: id, userIds: z.array(id).max(100) }), (l, a, p) => inviteToEvent(l, a, p.groupId, p.eventId, p.userIds)),
  respondToEvent: action(z.object({ groupId: id, eventId: id, response: z.string().max(20) }), (l, a, p) => respondToEvent(l, a, p.groupId, p.eventId, p.response)),
  finalizeTournament: action(z.object({ groupId: id, eventId: id, placements }), (l, a, p) => finalizeTournament(l, a, p.groupId, p.eventId, p.placements)),
  correctTournament: action(z.object({ groupId: id, tournamentId: id, placements }), (l, a, p) => correctTournament(l, a, p.groupId, p.tournamentId, p.placements)),
};

// --- backend ----------------------------------------------------------------

export class Backend {
  private queue: Promise<unknown> = Promise.resolve();
  private now: () => number;
  private iterations: number;

  /** `iterations` is 100000 in production (the Workers maximum for PBKDF2); tests use fewer. */
  constructor(private store: DocStore, options: { now?: () => number; iterations?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.iterations = options.iterations ?? 100_000;
  }

  /** Requests are processed one at a time so concurrent writes can never overwrite each other. */
  handle(request: ApiRequest): Promise<ApiResponse> {
    const result = this.queue.then(() => this.process(request));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async process(request: ApiRequest): Promise<ApiResponse> {
    try {
      const doc = (await this.store.load()) ?? { league: emptyLeague(), credentials: {}, sessions: [], failures: {} };
      const route = `${request.method} ${request.path}`;
      let response: ApiResponse;
      switch (route) {
        case "POST /api/register": response = await this.register(doc, request.body); break;
        case "POST /api/login": response = await this.login(doc, request.body); break;
        case "POST /api/logout": response = await this.logout(doc, request.token); break;
        case "GET /api/state": response = await this.state(doc, request.token); break;
        case "POST /api/action": response = await this.runAction(doc, request.token, request.body); break;
        default: throw new HttpError(404, "Not found.");
      }
      await this.store.save(doc);
      return response;
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: { error: error.message } };
      // Domain and validation errors carry user-facing messages; everything else stays hidden.
      if (error instanceof UserError) return { status: 400, body: { error: error.message } };
      console.error("Unexpected error", error);
      return { status: 500, body: { error: "Something went wrong. Please try again." } };
    }
  }

  private async startSession(doc: Doc, userId: string) {
    const token = randomHex(32);
    const now = this.now();
    doc.sessions = doc.sessions.filter((s) => s.expiresAt > now);
    const own = doc.sessions.filter((s) => s.userId === userId);
    if (own.length >= MAX_SESSIONS_PER_USER) {
      const drop = new Set(own.slice(0, own.length - MAX_SESSIONS_PER_USER + 1).map((s) => s.tokenHash));
      doc.sessions = doc.sessions.filter((s) => !drop.has(s.tokenHash));
    }
    doc.sessions.push({ tokenHash: await sha256Hex(token), userId, expiresAt: now + SESSION_MS });
    return token;
  }

  private async authenticate(doc: Doc, token: string | undefined) {
    if (!token) throw new HttpError(401, "Please log in.");
    const hash = await sha256Hex(token);
    const session = doc.sessions.find((s) => s.tokenHash === hash && s.expiresAt > this.now());
    const user = session && doc.league.users.find((u) => u.id === session.userId);
    if (!user) throw new HttpError(401, "Your session expired. Please log in again.");
    return user;
  }

  private session(doc: Doc, token: string, userId: string): ApiResponse {
    const league = viewFor(doc.league, userId);
    return { status: 200, body: { token, me: league.users.find((u) => u.id === userId), league } };
  }

  private async register(doc: Doc, body: unknown): Promise<ApiResponse> {
    const input = z.object({ username: z.string().max(100), password: z.string().max(200), displayName: z.string().max(100).optional() }).safeParse(body);
    if (!input.success) throw new HttpError(400, "Invalid request.");
    const username = parseOrThrow(usernameSchema, input.data.username);
    const password = parseOrThrow(passwordSchema, input.data.password);
    const displayName = parseOrThrow(displayNameSchema, input.data.displayName);

    const created = registerUser(doc.league, { username, displayName });
    const salt = randomHex(16);
    doc.league = created.league;
    doc.credentials[created.id] = { salt, hash: await pbkdf2(password, salt, this.iterations), iterations: this.iterations };
    return this.session(doc, await this.startSession(doc, created.id), created.id);
  }

  private async login(doc: Doc, body: unknown): Promise<ApiResponse> {
    const input = z.object({ username: z.string().max(100), password: z.string().max(200) }).safeParse(body);
    if (!input.success) throw new HttpError(400, "Invalid request.");
    const key = input.data.username.trim().toLowerCase();
    const now = this.now();
    const failure = doc.failures[key];
    if (failure && failure.lockedUntil > now) throw new HttpError(429, "Too many failed attempts. Try again in a few minutes.");

    const user = doc.league.users.find((u) => u.username.toLowerCase() === key);
    const credential = user && doc.credentials[user.id];
    // Hash even for unknown users so response time does not reveal which usernames exist.
    const candidate = await pbkdf2(input.data.password, credential?.salt ?? "00".repeat(16), credential?.iterations ?? this.iterations);
    if (!user || !credential || !safeEqual(candidate, credential.hash)) {
      const count = (failure && failure.lockedUntil <= now && failure.count < MAX_FAILURES ? failure.count : 0) + 1;
      doc.failures[key] = { count, lockedUntil: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0 };
      await this.store.save(doc);
      throw new HttpError(401, "Incorrect username or password.");
    }
    delete doc.failures[key];
    return this.session(doc, await this.startSession(doc, user.id), user.id);
  }

  private async logout(doc: Doc, token: string | undefined): Promise<ApiResponse> {
    if (token) {
      const hash = await sha256Hex(token);
      doc.sessions = doc.sessions.filter((s) => s.tokenHash !== hash);
    }
    return { status: 200, body: { ok: true } };
  }

  private async state(doc: Doc, token: string | undefined): Promise<ApiResponse> {
    const user = await this.authenticate(doc, token);
    return this.session(doc, token!, user.id);
  }

  private async runAction(doc: Doc, token: string | undefined, body: unknown): Promise<ApiResponse> {
    const user = await this.authenticate(doc, token);
    const envelope = z.object({ type: z.string().max(50), args: z.unknown() }).safeParse(body);
    const handler = envelope.success && Object.hasOwn(ACTIONS, envelope.data.type) ? ACTIONS[envelope.data.type] : undefined;
    if (!envelope.success || !handler) throw new HttpError(400, "Unknown action.");
    const args = handler.schema.safeParse(envelope.data.args);
    if (!args.success) throw new HttpError(400, "Invalid request.");

    const outcome = handler.run(doc.league, user.id, args.data as never);
    const next = "league" in outcome ? outcome.league : outcome;
    doc.league = next;
    const view = viewFor(next, user.id);
    return {
      status: 200,
      body: { token, me: view.users.find((u) => u.id === user.id), league: view, id: "id" in outcome ? outcome.id : undefined },
    };
  }
}
