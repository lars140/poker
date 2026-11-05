import { describe, expect, it } from "vitest";
import { Backend, type ApiResponse, type Doc, type DocStore } from "./backend";
import type { League } from "../lib/domain";

class MemoryStore implements DocStore {
  doc: Doc | undefined;
  async load() { return this.doc ? structuredClone(this.doc) : undefined; }
  async save(doc: Doc) { this.doc = structuredClone(doc); }
}

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function create() {
  const store = new MemoryStore();
  let clock = 1_000_000;
  const backend = new Backend(store, { iterations: 1000, now: () => clock });
  const call = (method: string, path: string, body?: unknown, token?: string) => backend.handle({ method, path, body, token });
  const register = async (username: string, password = "pokerface1") => {
    const res = await call("POST", "/api/register", { username, password });
    return { res, token: (res.body as Body).token as string, id: (res.body as Body).me?.id as string };
  };
  const act = (token: string, type: string, args: unknown) => call("POST", "/api/action", { type, args }, token);
  return { store, backend, call, register, act, advance: (ms: number) => { clock += ms; } };
}

const league = (res: ApiResponse) => (res.body as Body).league as League;
const error = (res: ApiResponse) => (res.body as Body).error as string;
const EVENT = { title: "Friday", startsAt: "2099-01-01T18:00:00.000Z" };

describe("accounts and login", () => {
  it("registers, logs in and returns only what the user may see", async () => {
    const t = create();
    const anna = await t.register("anna");
    expect(anna.res.status).toBe(200);
    expect(JSON.stringify(anna.res.body)).not.toMatch(/hash|salt|password/i);

    const login = await t.call("POST", "/api/login", { username: "ANNA", password: "pokerface1" });
    expect(login.status).toBe(200);
    const state = await t.call("GET", "/api/state", undefined, (login.body as Body).token);
    expect((state.body as Body).me.username).toBe("anna");
  });

  it("stores passwords only as salted hashes", async () => {
    const t = create();
    await t.register("anna");
    await t.register("ben");
    const text = JSON.stringify(t.store.doc);
    expect(text).not.toContain("pokerface1");
    const [a, b] = Object.values(t.store.doc!.credentials);
    expect(a.hash).not.toBe(b.hash); // same password, different salt
    expect(t.store.doc!.sessions[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("validates registration and rejects duplicates", async () => {
    const t = create();
    expect((await t.register("anna")).res.status).toBe(200);
    expect(error((await t.register("Anna")).res)).toMatch(/taken/);
    expect(error((await t.register("bob", "short")).res)).toMatch(/8 characters/);
    expect(error((await t.register("bob", "nodigitshere")).res)).toMatch(/number/);
    expect(error((await t.register("x")).res)).toMatch(/3-24/);
  });

  it("rejects wrong passwords and unknown users with the same message", async () => {
    const t = create();
    await t.register("anna");
    const wrong = await t.call("POST", "/api/login", { username: "anna", password: "wrongpass1" });
    const unknown = await t.call("POST", "/api/login", { username: "nobody", password: "wrongpass1" });
    expect(wrong.status).toBe(401);
    expect(error(wrong)).toBe(error(unknown));
  });

  it("locks an account after repeated failures, then recovers", async () => {
    const t = create();
    await t.register("anna");
    for (let i = 0; i < 8; i++) await t.call("POST", "/api/login", { username: "anna", password: "wrongpass1" });
    const locked = await t.call("POST", "/api/login", { username: "anna", password: "pokerface1" });
    expect(locked.status).toBe(429);
    t.advance(11 * 60 * 1000);
    expect((await t.call("POST", "/api/login", { username: "anna", password: "pokerface1" })).status).toBe(200);
  });

  it("protects every data route and ends sessions on logout or expiry", async () => {
    const t = create();
    const anna = await t.register("anna");
    expect((await t.call("GET", "/api/state")).status).toBe(401);
    expect((await t.call("GET", "/api/state", undefined, "forged")).status).toBe(401);
    expect((await t.act("forged", "createGroup", { name: "Mine" })).status).toBe(401);

    await t.call("POST", "/api/logout", undefined, anna.token);
    expect((await t.call("GET", "/api/state", undefined, anna.token)).status).toBe(401);

    const again = await t.call("POST", "/api/login", { username: "anna", password: "pokerface1" });
    t.advance(31 * 24 * 60 * 60 * 1000);
    expect((await t.call("GET", "/api/state", undefined, (again.body as Body).token)).status).toBe(401);
  });

  it("answers unknown routes and actions safely", async () => {
    const t = create();
    const anna = await t.register("anna");
    expect((await t.call("GET", "/api/nope")).status).toBe(404);
    expect((await t.act(anna.token, "constructor", {})).status).toBe(400);
    expect((await t.act(anna.token, "createGroup", { name: 5 })).status).toBe(400);
  });
});

describe("groups, accounts and admin rights over the API", () => {
  it("lets an admin add accounts and promote them for one group only", async () => {
    const t = create();
    const anna = await t.register("anna");
    const ben = await t.register("ben");
    const created = await t.act(anna.token, "createGroup", { name: "Friday" });
    const groupId = (created.body as Body).id as string;
    const other = await t.act(ben.token, "createGroup", { name: "Ben's group" });
    const otherId = (other.body as Body).id as string;

    // ben cannot see or touch anna's group before being added
    expect(league(await t.call("GET", "/api/state", undefined, ben.token)).groups.map((g) => g.name)).toEqual(["Ben's group"]);
    expect(error(await t.act(ben.token, "setRole", { groupId, userId: ben.id, role: "admin" }))).toMatch(/does not exist/);

    expect((await t.act(anna.token, "addMember", { groupId, username: "ben" })).status).toBe(200);
    expect(error(await t.act(ben.token, "setRole", { groupId, userId: ben.id, role: "admin" }))).toMatch(/Only group admins/);
    expect(error(await t.act(ben.token, "addMember", { groupId, username: "anna" }))).toMatch(/Only group admins|already/);

    expect((await t.act(anna.token, "setRole", { groupId, userId: ben.id, role: "admin" })).status).toBe(200);
    // admin in one group says nothing about another
    expect(error(await t.act(anna.token, "updateGroup", { groupId: otherId, name: "Hijack" }))).toMatch(/does not exist/);
    expect((await t.act(ben.token, "updateGroup", { groupId, name: "Renamed" })).status).toBe(200);
  });

  it("runs a game night end to end and keeps data between requests", async () => {
    const t = create();
    const users = [];
    for (const name of ["anna", "ben", "cleo", "dan"]) users.push(await t.register(name));
    const [anna, ben] = users;
    const groupId = ((await t.act(anna.token, "createGroup", { name: "Friday" })).body as Body).id as string;
    for (const name of ["ben", "cleo", "dan"]) await t.act(anna.token, "addMember", { groupId, username: name });

    const eventId = ((await t.act(anna.token, "createEvent", { groupId, event: { ...EVENT, maxParticipants: 4 } })).body as Body).id as string;
    expect(error(await t.act(ben.token, "createEvent", { groupId, event: EVENT }))).toMatch(/Only group admins/);
    expect((await t.act(ben.token, "respondToEvent", { groupId, eventId, response: "going" })).status).toBe(200);

    const placements = users.map((u, i) => ({ userId: u.id, position: i + 1 }));
    expect(error(await t.act(ben.token, "finalizeTournament", { groupId, eventId, placements }))).toMatch(/Only group admins/);
    expect((await t.act(anna.token, "finalizeTournament", { groupId, eventId, placements })).status).toBe(200);
    expect(error(await t.act(anna.token, "finalizeTournament", { groupId, eventId, placements }))).toMatch(/already finalized/);

    const state = league(await t.call("GET", "/api/state", undefined, ben.token));
    expect(state.groups[0].tournaments[0].results.map((r) => r.points)).toEqual([10, 6, 3, 1]);
    expect(JSON.stringify(state)).not.toMatch(/hash|salt/);
  });

  it("serializes simultaneous requests without losing updates", async () => {
    const t = create();
    const anna = await t.register("anna");
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => t.act(anna.token, "createGroup", { name: `Group ${i}` })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(t.store.doc!.league.groups).toHaveLength(10);
  });
});
