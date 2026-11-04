import { describe, expect, it } from "vitest";
import {
  addMember, cancelEvent, correctTournament, createEvent, createGroup, emptyLeague, finalizeTournament, goingCount,
  inviteToEvent, respondToEvent, resultRows, setMemberArchived, updateEvent, type Group, type League,
} from "./domain";
import { pointsForPlacement } from "./scoring";
import { computeLeaderboard } from "./stats";

const FUTURE = "2099-01-01T18:00:00.000Z";
const NAMES = ["Anna", "Ben", "Cleo", "Dan", "Eve", "Finn", "Gia", "Hugo"];

/** A league with one group of `size` players and one open event. */
function setup(size = 7, eventInput: Partial<Parameters<typeof createEvent>[2]> = {}) {
  let league: League = emptyLeague();
  const created = createGroup(league, { name: "Friday Night" });
  league = created.league;
  for (const name of NAMES.slice(0, size)) league = addMember(league, created.id, name);
  const event = createEvent(league, created.id, { title: "Game night", startsAt: FUTURE, ...eventInput });
  league = event.league;
  const group = () => league.groups.find((g) => g.id === created.id)!;
  return {
    groupId: created.id, eventId: event.id,
    get league() { return league; }, set league(value: League) { league = value; },
    group, ids: group().members.map((m) => m.id),
  };
}

const order = (ids: string[]) => ids.map((userId, i) => ({ userId, position: i + 1 }));

describe("groups and members", () => {
  it("creates groups, rejects bad names and duplicate players", () => {
    expect(() => createGroup(emptyLeague(), { name: "x" })).toThrow(/at least 2/);
    const s = setup(2);
    expect(() => addMember(s.league, s.groupId, "anna")).toThrow(/already in this group/);
  });

  it("archives players without losing their history, and lets them return", () => {
    const s = setup(4);
    s.league = finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids)).league;
    s.league = setMemberArchived(s.league, s.groupId, s.ids[3], true);
    expect(resultRows(s.group())).toHaveLength(4); // still in the results
    expect(s.group().members[3].archived).toBe(true);
    s.league = addMember(s.league, s.groupId, "Dan");
    expect(s.group().members[3].archived).toBe(false);
    expect(s.group().members).toHaveLength(4); // same player, not a duplicate
  });
});

describe("events and attendance", () => {
  it("invites every active member and counts each response once", () => {
    const s = setup(4);
    const event = () => s.group().events[0];
    expect(Object.keys(event().invitations)).toHaveLength(4);
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "going");
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "going");
    expect(goingCount(event())).toBe(1);
    expect(() => respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "attending")).toThrow();
  });

  it("enforces the participant limit and frees seats", () => {
    const s = setup(4, { maxParticipants: 2 });
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "going");
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[1], "going");
    expect(() => respondToEvent(s.league, s.groupId, s.eventId, s.ids[2], "going")).toThrow(/full/);
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[2], "maybe");
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "declined");
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[2], "going");
    expect(goingCount(s.group().events[0])).toBe(2);
  });

  it("will not lower the limit below the confirmed players", () => {
    const s = setup(4, { maxParticipants: 3 });
    for (const id of s.ids.slice(0, 3)) s.league = respondToEvent(s.league, s.groupId, s.eventId, id, "going");
    expect(() => updateEvent(s.league, s.groupId, s.eventId, { title: "Game night", startsAt: FUTURE, maxParticipants: 2 })).toThrow(/lower than/);
  });

  it("respects the registration deadline but always allows declining", () => {
    const s = setup(4, { registrationDeadline: "2099-01-01T10:00:00.000Z" });
    const late = new Date("2099-01-01T12:00:00.000Z");
    expect(() => respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "going", late)).toThrow(/deadline/);
    expect(respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "declined", late)).toBeTruthy();
  });

  it("only invited active members respond; cancelled events are closed", () => {
    const s = setup(4);
    expect(() => respondToEvent(s.league, s.groupId, s.eventId, "stranger", "going")).toThrow(/not been invited/);
    expect(() => inviteToEvent(s.league, s.groupId, s.eventId, ["stranger"])).toThrow(/active group members/);
    s.league = cancelEvent(s.league, s.groupId, s.eventId);
    expect(() => respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "going")).toThrow(/no longer open/);
    expect(() => cancelEvent(s.league, s.groupId, s.eventId)).toThrow(/Only scheduled/);
  });

  it("frees the seat of an archived player", () => {
    const s = setup(4, { maxParticipants: 2 });
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "going");
    s.league = setMemberArchived(s.league, s.groupId, s.ids[0], true);
    expect(goingCount(s.group().events[0])).toBe(0);
  });
});

describe("tournament results", () => {
  it.each([4, 5, 6, 7])("awards the %i-player points table", (size) => {
    const s = setup(size);
    s.league = finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids)).league;
    const points = s.group().tournaments[0].results.map((r) => r.points);
    expect(points).toEqual(s.ids.map((_, i) => pointsForPlacement(size, i + 1)));
    expect(s.group().events[0].status).toBe("completed");
  });

  it("does not award points for attendance alone", () => {
    const s = setup(4);
    s.league = respondToEvent(s.league, s.groupId, s.eventId, s.ids[0], "going");
    expect(resultRows(s.group())).toEqual([]);
  });

  it("rejects invalid fields, duplicate positions and foreign players", () => {
    const s = setup(5);
    const finalize = (placements: { userId: string; position: number }[]) => finalizeTournament(s.league, s.groupId, s.eventId, placements);
    expect(() => finalize(order(s.ids.slice(0, 3)))).toThrow(/4, 5, 6, or 7/);
    expect(() => finalize(order([...s.ids, "x", "y", "z"]))).toThrow(/4, 5, 6, or 7/);
    expect(() => finalize(order([s.ids[0], s.ids[1], s.ids[2], "stranger"]))).toThrow(/belong to this group/);
    expect(() => finalize(order(s.ids.slice(0, 4)).map((p, i) => (i === 3 ? { ...p, position: 3 } : p)))).toThrow(/unique position/i);
    expect(() => finalize(order([s.ids[0], s.ids[0], s.ids[1], s.ids[2]]))).toThrow(/exactly once/);
    expect(s.group().tournaments).toEqual([]);
  });

  it("refuses archived players for new results and cancelled events", () => {
    const s = setup(5);
    s.league = setMemberArchived(s.league, s.groupId, s.ids[4], true);
    expect(() => finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids))).toThrow(/belong to this group/);
    s.league = cancelEvent(s.league, s.groupId, s.eventId);
    expect(() => finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids.slice(0, 4)))).toThrow(/cancelled/);
  });

  it("cannot be finalized twice", () => {
    const s = setup(4);
    s.league = finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids)).league;
    expect(() => finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids))).toThrow(/already finalized/);
    expect(s.group().tournaments).toHaveLength(1);
  });

  it("corrections recalculate points without duplicating them", () => {
    const s = setup(4);
    s.league = finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids)).league;
    const tid = s.group().tournaments[0].id;
    const swapped = [s.ids[1], s.ids[0], s.ids[2], s.ids[3]];
    s.league = correctTournament(s.league, s.groupId, tid, order(swapped));
    s.league = correctTournament(s.league, s.groupId, tid, order(swapped)); // repeating is harmless
    const board = computeLeaderboard(resultRows(s.group()));
    expect(board.find((e) => e.userId === s.ids[1])?.totalPoints).toBe(10);
    expect(board.find((e) => e.userId === s.ids[0])?.totalPoints).toBe(6);
    expect(board.reduce((sum, e) => sum + e.totalPoints, 0)).toBe(20);
    expect(s.group().tournaments[0].correctionCount).toBe(2);
    expect(() => correctTournament(s.league, s.groupId, tid, order([s.ids[0], s.ids[1], s.ids[2], "stranger"]))).toThrow(/belong to this group/);
  });

  it("keeps leaderboards of different groups independent", () => {
    const one = setup(4);
    let league = one.league;
    league = finalizeTournament(league, one.groupId, one.eventId, order(one.ids)).league;
    const second = createGroup(league, { name: "Other" });
    league = addMember(second.league, second.id, "Anna");
    const [g1, g2]: Group[] = league.groups;
    expect(computeLeaderboard(resultRows(g1))[0].totalPoints).toBe(10);
    expect(computeLeaderboard(resultRows(g2))).toEqual([]);
  });

  it("does not mutate the previous league (undo-safe state)", () => {
    const s = setup(4);
    const before = JSON.stringify(s.league);
    finalizeTournament(s.league, s.groupId, s.eventId, order(s.ids));
    expect(JSON.stringify(s.league)).toBe(before);
  });
});
