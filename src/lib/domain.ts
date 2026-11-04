import { scorePlacements } from "@/lib/scoring";
import type { ResultRow } from "@/lib/stats";
import { eventResponseSchema, eventSchema, groupSchema, memberNameSchema, parseOrThrow, placementsSchema } from "@/lib/validation";

// Everything lives in the browser (GitHub Pages has no server), so this module is pure:
// every function takes the current League and returns a new one, or throws an Error with a
// message that is safe to show to the user.

export type Member = { id: string; name: string; archived: boolean };
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
  /** memberId -> invitation state / response. One entry per member, so attendance cannot be duplicated. */
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
  members: Member[];
  events: PokerEvent[];
  tournaments: Tournament[];
};

export type League = { version: 1; groups: Group[] };

export const emptyLeague = (): League => ({ version: 1, groups: [] });

const newId = () => crypto.randomUUID();
const clone = (league: League) => structuredClone(league);

function groupOf(league: League, groupId: string) {
  const group = league.groups.find((g) => g.id === groupId);
  if (!group) throw new Error("This group does not exist.");
  return group;
}

function eventOf(group: Group, eventId: string) {
  const event = group.events.find((e) => e.id === eventId);
  if (!event) throw new Error("This event does not exist.");
  return event;
}

export const activeMembers = (group: Group) => group.members.filter((m) => !m.archived);
export const goingCount = (event: PokerEvent) => Object.values(event.invitations).filter((r) => r === "going").length;
export const isFull = (event: PokerEvent) => event.maxParticipants !== undefined && goingCount(event) >= event.maxParticipants;

// --- groups and members -----------------------------------------------------

export function createGroup(league: League, input: { name: string; description?: string }) {
  const parsed = parseOrThrow(groupSchema, input);
  const next = clone(league);
  const id = newId();
  next.groups.push({
    id, name: parsed.name, description: parsed.description, createdAt: new Date().toISOString(),
    members: [], events: [], tournaments: [],
  });
  return { league: next, id };
}

export function updateGroup(league: League, groupId: string, input: { name: string; description?: string }) {
  const parsed = parseOrThrow(groupSchema, input);
  const next = clone(league);
  Object.assign(groupOf(next, groupId), { name: parsed.name, description: parsed.description });
  return next;
}

export function deleteGroup(league: League, groupId: string) {
  groupOf(league, groupId);
  return { ...league, groups: league.groups.filter((g) => g.id !== groupId) };
}

export function addMember(league: League, groupId: string, name: string) {
  const clean = parseOrThrow(memberNameSchema, name);
  const next = clone(league);
  const group = groupOf(next, groupId);
  const existing = group.members.find((m) => m.name.toLowerCase() === clean.toLowerCase());
  if (existing && !existing.archived) throw new Error(`${existing.name} is already in this group.`);
  if (existing) {
    existing.archived = false; // returning player keeps their history
  } else {
    group.members.push({ id: newId(), name: clean, archived: false });
  }
  return next;
}

/** Archived players disappear from new events but stay visible in past results. */
export function setMemberArchived(league: League, groupId: string, memberId: string, archived: boolean) {
  const next = clone(league);
  const group = groupOf(next, groupId);
  const member = group.members.find((m) => m.id === memberId);
  if (!member) throw new Error("This player does not exist.");
  member.archived = archived;
  if (archived) {
    for (const event of group.events) {
      if (event.status === "scheduled" && event.invitations[memberId]) event.invitations[memberId] = "declined";
    }
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

export function createEvent(league: League, groupId: string, input: EventInput) {
  const parsed = parseOrThrow(eventSchema, input);
  const next = clone(league);
  const group = groupOf(next, groupId);
  const id = newId();
  group.events.push({
    id, ...parsed, status: "scheduled",
    invitations: Object.fromEntries(activeMembers(group).map((m) => [m.id, "invited" as const])),
  });
  return { league: next, id };
}

export function updateEvent(league: League, groupId: string, eventId: string, input: EventInput) {
  const parsed = parseOrThrow(eventSchema, input);
  const next = clone(league);
  const event = eventOf(groupOf(next, groupId), eventId);
  if (event.status !== "scheduled") throw new Error("Only scheduled events can be edited.");
  if (parsed.maxParticipants !== undefined && parsed.maxParticipants < goingCount(event)) {
    throw new Error("The limit cannot be lower than the number of confirmed players.");
  }
  Object.assign(event, parsed);
  return next;
}

export function cancelEvent(league: League, groupId: string, eventId: string) {
  const next = clone(league);
  const event = eventOf(groupOf(next, groupId), eventId);
  if (event.status !== "scheduled") throw new Error("Only scheduled events can be cancelled.");
  event.status = "cancelled";
  return next;
}

export function inviteToEvent(league: League, groupId: string, eventId: string, memberIds: string[]) {
  const next = clone(league);
  const group = groupOf(next, groupId);
  const event = eventOf(group, eventId);
  if (event.status !== "scheduled") throw new Error("Only scheduled events accept invitations.");
  for (const memberId of memberIds) {
    const member = group.members.find((m) => m.id === memberId);
    if (!member || member.archived) throw new Error("Only active group members can be invited.");
    event.invitations[memberId] ??= "invited";
  }
  return next;
}

export function respondToEvent(league: League, groupId: string, eventId: string, memberId: string, response: string, now = new Date()) {
  const answer = parseOrThrow(eventResponseSchema, response);
  const next = clone(league);
  const group = groupOf(next, groupId);
  const event = eventOf(group, eventId);
  const current = event.invitations[memberId];
  if (!current) throw new Error("This player has not been invited to the event.");
  if (group.members.find((m) => m.id === memberId)?.archived) throw new Error("Archived players cannot respond to events.");
  if (event.status !== "scheduled") throw new Error("This event is no longer open for responses.");
  if (answer !== "declined" && event.registrationDeadline && now > new Date(event.registrationDeadline)) {
    throw new Error("The registration deadline has passed.");
  }
  if (answer === "going" && current !== "going" && isFull(event)) throw new Error("This event is full.");
  event.invitations[memberId] = answer;
  return next;
}

// --- tournaments, results and leaderboards ----------------------------------

export type PlacementInput = { userId: string; position: number }[];

function checkParticipants(group: Group, placements: PlacementInput, requireActive: boolean) {
  for (const { userId } of placements) {
    const member = group.members.find((m) => m.id === userId);
    if (!member || (requireActive && member.archived)) throw new Error("Every participant must belong to this group.");
  }
}

/** Records final standings once per event; points come from the central scoring function. */
export function finalizeTournament(league: League, groupId: string, eventId: string, placements: PlacementInput) {
  const checked = parseOrThrow(placementsSchema, placements);
  const next = clone(league);
  const group = groupOf(next, groupId);
  const event = eventOf(group, eventId);
  if (group.tournaments.some((t) => t.eventId === eventId)) {
    throw new Error("Results for this event were already finalized. Use a correction instead.");
  }
  if (event.status === "cancelled") throw new Error("A cancelled event cannot have results.");
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
export function correctTournament(league: League, groupId: string, tournamentId: string, placements: PlacementInput) {
  const checked = parseOrThrow(placementsSchema, placements);
  const next = clone(league);
  const group = groupOf(next, groupId);
  const tournament = group.tournaments.find((t) => t.id === tournamentId);
  if (!tournament) throw new Error("This tournament does not exist.");
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

export const memberName = (group: Group, memberId: string) => group.members.find((m) => m.id === memberId)?.name ?? "Unknown";
