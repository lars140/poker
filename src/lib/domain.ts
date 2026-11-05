import { UserError } from "./errors";
import { scorePlacements } from "./scoring";
import type { ResultRow } from "./stats";
import {
  displayNameSchema, eventResponseSchema, eventSchema, groupSchema, parseOrThrow, placementsSchema, usernameSchema,
} from "./validation";

// Shared by the browser and the Cloudflare Worker. The Worker is the authority: it runs these
// functions with the authenticated user as `actor`, so permissions are enforced on the server.
// Every function is pure: it takes the current League and returns a new one, or throws an Error
// whose message is safe to show to users.

export type User = { id: string; username: string; displayName?: string; createdAt: string };
export type Role = "admin" | "member";
/** Removed members are archived (not deleted) so past results stay attributable. */
export type Member = { userId: string; role: Role; archived: boolean };
export type Invitation = "invited" | "going" | "maybe" | "declined";
export type EventStatus = "scheduled" | "completed" | "cancelled";

export type PokerEvent = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  registrationDeadline?: string;
  maxParticipants?: number;
  status: EventStatus;
  organizerId: string;
  /** userId -> invitation state / response. One entry per member, so attendance cannot be duplicated. */
  invitations: Record<string, Invitation>;
};

export type Result = { memberId: string; position: number; points: number };

export type Tournament = {
  id: string;
  eventId: string;
  title: string;
  playedAt: string;
  /** Points are stored at finalization so historical results survive scoring changes. */
  results: Result[];
  finalizedAt: string;
  correctedAt?: string;
  correctionCount: number;
};

export type Group = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  members: Member[];
  events: PokerEvent[];
  tournaments: Tournament[];
};

export type League = { version: 2; users: User[]; groups: Group[] };

export const emptyLeague = (): League => ({ version: 2, users: [], groups: [] });

const newId = () => crypto.randomUUID();
const clone = (league: League) => structuredClone(league);

function groupOf(league: League, groupId: string) {
  const group = league.groups.find((g) => g.id === groupId);
  if (!group) throw new UserError("This group does not exist.");
  return group;
}

function eventOf(group: Group, eventId: string) {
  const event = group.events.find((e) => e.id === eventId);
  if (!event) throw new UserError("This event does not exist.");
  return event;
}

export const memberOf = (group: Group, userId: string) => group.members.find((m) => m.userId === userId);
export const activeMembers = (group: Group) => group.members.filter((m) => !m.archived);
export const isAdminOf = (group: Group, userId: string) => {
  const member = memberOf(group, userId);
  return !!member && !member.archived && member.role === "admin";
};
export const isMemberOf = (group: Group, userId: string) => !!memberOf(group, userId) && !memberOf(group, userId)!.archived;

/** Groups answer "does not exist" to outsiders so private groups cannot be probed. */
function memberGroup(league: League, actor: string, groupId: string) {
  const group = groupOf(league, groupId);
  if (!isMemberOf(group, actor)) throw new UserError("This group does not exist.");
  return group;
}

function adminGroup(league: League, actor: string, groupId: string) {
  const group = memberGroup(league, actor, groupId);
  if (!isAdminOf(group, actor)) throw new UserError("Only group admins can do this.");
  return group;
}

const activeAdminCount = (group: Group) => group.members.filter((m) => !m.archived && m.role === "admin").length;

export const goingCount = (event: PokerEvent) => Object.values(event.invitations).filter((r) => r === "going").length;
export const isFull = (event: PokerEvent) => event.maxParticipants !== undefined && goingCount(event) >= event.maxParticipants;

export const userName = (league: League, userId: string) => {
  const user = league.users.find((u) => u.id === userId);
  return user ? user.displayName || user.username : "Unknown";
};

// --- accounts ---------------------------------------------------------------

export function registerUser(league: League, input: { username: string; displayName?: string }) {
  const username = parseOrThrow(usernameSchema, input.username);
  const displayName = parseOrThrow(displayNameSchema, input.displayName);
  if (league.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new UserError("That username is taken.");
  const next = clone(league);
  const id = newId();
  next.users.push({ id, username, displayName, createdAt: new Date().toISOString() });
  return { league: next, id };
}

export function updateProfile(league: League, actor: string, input: { displayName?: string }) {
  const displayName = parseOrThrow(displayNameSchema, input.displayName);
  const next = clone(league);
  const user = next.users.find((u) => u.id === actor);
  if (!user) throw new UserError("This account does not exist.");
  user.displayName = displayName;
  return next;
}

// --- groups and members -----------------------------------------------------

export function createGroup(league: League, actor: string, input: { name: string; description?: string }) {
  const parsed = parseOrThrow(groupSchema, input);
  const next = clone(league);
  const id = newId();
  next.groups.push({
    id, name: parsed.name, description: parsed.description, createdAt: new Date().toISOString(), createdBy: actor,
    members: [{ userId: actor, role: "admin", archived: false }], events: [], tournaments: [],
  });
  return { league: next, id };
}

export function updateGroup(league: League, actor: string, groupId: string, input: { name: string; description?: string }) {
  const parsed = parseOrThrow(groupSchema, input);
  const next = clone(league);
  Object.assign(adminGroup(next, actor, groupId), { name: parsed.name, description: parsed.description });
  return next;
}

export function deleteGroup(league: League, actor: string, groupId: string) {
  adminGroup(league, actor, groupId);
  return { ...league, groups: league.groups.filter((g) => g.id !== groupId) };
}

/** Adds an existing account by username. Never grants admin rights; that is a separate step. */
export function addMember(league: League, actor: string, groupId: string, username: string) {
  const next = clone(league);
  const group = adminGroup(next, actor, groupId);
  const target = next.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target) throw new UserError("No account with that username exists. Ask them to create one first.");
  const existing = memberOf(group, target.id);
  if (existing && !existing.archived) throw new UserError(`${target.username} is already in this group.`);
  if (existing) {
    existing.archived = false;
    existing.role = "member";
  } else {
    group.members.push({ userId: target.id, role: "member", archived: false });
  }
  return next;
}

export function setRole(league: League, actor: string, groupId: string, userId: string, role: Role) {
  if (role !== "admin" && role !== "member") throw new UserError("Invalid role.");
  const next = clone(league);
  const group = adminGroup(next, actor, groupId);
  const member = memberOf(group, userId);
  if (!member || member.archived) throw new UserError("That account is not an active member of this group.");
  if (member.role === "admin" && role === "member" && activeAdminCount(group) === 1) {
    throw new UserError("A group must keep at least one admin.");
  }
  member.role = role;
  return next;
}

/** Admins remove others; anyone may leave. The member is archived so history stays intact. */
export function removeMember(league: League, actor: string, groupId: string, userId: string) {
  const next = clone(league);
  const group = memberGroup(next, actor, groupId);
  if (userId !== actor && !isAdminOf(group, actor)) throw new UserError("Only group admins can do this.");
  const member = memberOf(group, userId);
  if (!member || member.archived) throw new UserError("That account is not an active member of this group.");
  if (member.role === "admin" && activeAdminCount(group) === 1) throw new UserError("A group must keep at least one admin.");
  member.archived = true;
  for (const event of group.events) {
    if (event.status === "scheduled" && event.invitations[userId]) event.invitations[userId] = "declined";
  }
  return next;
}

// --- events and attendance --------------------------------------------------

export type EventInput = {
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  registrationDeadline?: string;
  maxParticipants?: string | number;
};

export function createEvent(league: League, actor: string, groupId: string, input: EventInput) {
  const parsed = parseOrThrow(eventSchema, input);
  const next = clone(league);
  const group = adminGroup(next, actor, groupId);
  const id = newId();
  group.events.push({
    id, ...parsed, status: "scheduled", organizerId: actor,
    invitations: Object.fromEntries(activeMembers(group).map((m) => [m.userId, "invited" as const])),
  });
  return { league: next, id };
}

export function updateEvent(league: League, actor: string, groupId: string, eventId: string, input: EventInput) {
  const parsed = parseOrThrow(eventSchema, input);
  const next = clone(league);
  const event = eventOf(adminGroup(next, actor, groupId), eventId);
  if (event.status !== "scheduled") throw new UserError("Only scheduled events can be edited.");
  if (parsed.maxParticipants !== undefined && parsed.maxParticipants < goingCount(event)) {
    throw new UserError("The limit cannot be lower than the number of confirmed players.");
  }
  Object.assign(event, parsed);
  return next;
}

export function cancelEvent(league: League, actor: string, groupId: string, eventId: string) {
  const next = clone(league);
  const event = eventOf(adminGroup(next, actor, groupId), eventId);
  if (event.status !== "scheduled") throw new UserError("Only scheduled events can be cancelled.");
  event.status = "cancelled";
  return next;
}

export function inviteToEvent(league: League, actor: string, groupId: string, eventId: string, userIds: string[]) {
  const next = clone(league);
  const group = adminGroup(next, actor, groupId);
  const event = eventOf(group, eventId);
  if (event.status !== "scheduled") throw new UserError("Only scheduled events accept invitations.");
  for (const userId of userIds) {
    if (!isMemberOf(group, userId)) throw new UserError("Only active group members can be invited.");
    event.invitations[userId] ??= "invited";
  }
  return next;
}

/** Players answer for themselves only. */
export function respondToEvent(league: League, actor: string, groupId: string, eventId: string, response: string, now = new Date()) {
  const answer = parseOrThrow(eventResponseSchema, response);
  const next = clone(league);
  const event = eventOf(memberGroup(next, actor, groupId), eventId);
  const current = event.invitations[actor];
  if (!current) throw new UserError("You have not been invited to this event.");
  if (event.status !== "scheduled") throw new UserError("This event is no longer open for responses.");
  if (answer !== "declined" && event.registrationDeadline && now > new Date(event.registrationDeadline)) {
    throw new UserError("The registration deadline has passed.");
  }
  if (answer === "going" && current !== "going" && isFull(event)) throw new UserError("This event is full.");
  event.invitations[actor] = answer;
  return next;
}

// --- tournaments, results and leaderboards ----------------------------------

export type PlacementInput = { userId: string; position: number }[];

function checkParticipants(group: Group, placements: PlacementInput, requireActive: boolean) {
  for (const { userId } of placements) {
    const member = memberOf(group, userId);
    if (!member || (requireActive && member.archived)) throw new UserError("Every participant must belong to this group.");
  }
}

/** Records final standings once per event; points come from the central scoring function. */
export function finalizeTournament(league: League, actor: string, groupId: string, eventId: string, placements: PlacementInput) {
  const checked = parseOrThrow(placementsSchema, placements);
  const next = clone(league);
  const group = adminGroup(next, actor, groupId);
  const event = eventOf(group, eventId);
  if (group.tournaments.some((t) => t.eventId === eventId)) {
    throw new UserError("Results for this event were already finalized. Use a correction instead.");
  }
  if (event.status === "cancelled") throw new UserError("A cancelled event cannot have results.");
  checkParticipants(group, checked, true);

  const id = newId();
  group.tournaments.push({
    id, eventId, title: event.title, playedAt: event.startsAt, finalizedAt: new Date().toISOString(), correctionCount: 0,
    results: scorePlacements(checked).map(({ userId, position, points }) => ({ memberId: userId, position, points })),
  });
  event.status = "completed";
  return { league: next, id };
}

/** Replaces all placements; leaderboards are derived from results, so nothing is counted twice. */
export function correctTournament(league: League, actor: string, groupId: string, tournamentId: string, placements: PlacementInput) {
  const checked = parseOrThrow(placementsSchema, placements);
  const next = clone(league);
  const group = adminGroup(next, actor, groupId);
  const tournament = group.tournaments.find((t) => t.id === tournamentId);
  if (!tournament) throw new UserError("This tournament does not exist.");
  checkParticipants(group, checked, false);
  tournament.results = scorePlacements(checked).map(({ userId, position, points }) => ({ memberId: userId, position, points }));
  tournament.correctionCount += 1;
  tournament.correctedAt = new Date().toISOString();
  return next;
}

/** Result rows of one group only: groups never share rankings. */
export function resultRows(group: Group): ResultRow[] {
  return group.tournaments.flatMap((t) =>
    t.results.map((r) => ({ tournamentId: t.id, userId: r.memberId, position: r.position, points: r.points, playedAt: t.playedAt })),
  );
}

/** What one user may see: their groups, and the accounts that appear in those groups. */
export function viewFor(league: League, userId: string): League {
  const groups = league.groups.filter((g) => isMemberOf(g, userId));
  const visible = new Set<string>([userId]);
  for (const g of groups) {
    for (const m of g.members) visible.add(m.userId);
    for (const e of g.events) visible.add(e.organizerId);
  }
  return { version: 2, users: league.users.filter((u) => visible.has(u.id)), groups };
}
