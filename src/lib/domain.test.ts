import { describe, expect, it } from "vitest";
import {
  addMember, cancelEvent, correctTournament, createEvent, createGroup, deleteGroup, emptyLeague, finalizeTournament,
  goingCount, inviteToEvent, registerUser, removeMember, respondToEvent, resultRows, setRole, updateEvent, updateGroup,
  viewFor, type EventInput, type Group, type League,
} from "./domain";
import { pointsForPlacement } from "./scoring";
import { computeLeaderboard } from "./stats";

const FUTURE = "2099-01-01T18:00:00.000Z";
const NAMES = ["anna", "ben", "cleo", "dan", "eve", "finn", "gia", "hugo"];
const order = (ids: string[]) => ids.map((userId, i) => ({ userId, position: i + 1 }));

/** `size` accounts (the first one is the group admin), all in one group, plus one open event. */
function setup(size = 7, eventInput: Partial<EventInput> = {}) {
  let league: League = emptyLeague();
  const ids: string[] = [];
  for (const name of NAMES) {
    const r = registerUser(league, { username: name });
    league = r.league;
    ids.push(r.id);
  }
  const admin = ids[0];
  const g = createGroup(league, admin, { name: "Friday Night" });
  league = g.league;
  for (const name of NAMES.slice(1, size)) league = addMember(league, admin, g.id, name);
  const e = createEvent(league, admin, g.id, { title: "Game night", startsAt: FUTURE, ...eventInput });
  league = e.league;
  const state = {
    league, groupId: g.id, eventId: e.id, admin, ids, players: ids.slice(0, size), outsider: ids[7],
    group: (): Group => state.league.groups.find((x) => x.id === g.id)!,
  };
  return state;
}

describe("accounts", () => {
  it("registers unique usernames case-insensitively and validates them", () => {
    let league = registerUser(emptyLeague(), { username: "Anna" }).league;
    expect(() => registerUser(league, { username: "anna" })).toThrow(/taken/);
    expect(() => registerUser(league, { username: "a b" })).toThrow(/3-24/);
    league = registerUser(league, { username: "ben", displayName: "  " }).league;
    expect(league.users[1].displayName).toBeUndefined();
  });
});

describe("groups, members and admin rights", () => {
  it("makes the creator admin and everyone else a plain member", () => {
    const s = setup(3);
    expect(s.group().members.map((m) => m.role)).toEqual(["admin", "member", "member"]);
  });

  it("only admins add accounts, and only existing ones", () => {
    const s = setup(3);
    expect(() => addMember(s.league, s.players[1], s.groupId, "hugo")).toThrow(/Only group admins/);
    expect(() => addMember(s.league, s.admin, s.groupId, "nobody")).toThrow(/No account/);
    expect(() => addMember(s.league, s.admin, s.groupId, "BEN")).toThrow(/already in this group/);
    s.league = addMember(s.league, s.admin, s.groupId, "hugo");
    expect(s.group().members.find((m) => m.userId === s.outsider)?.role).toBe("member"); // never admin by default
  });

  it("promotes per group and keeps at least one admin", () => {
    const s = setup(3);
    const [admin, ben] = s.players;
    expect(() => setRole(s.league, ben, s.groupId, ben, "admin")).toThrow(/Only group admins/); // no self-promotion
    s.league = setRole(s.league, admin, s.groupId, ben, "admin");
    expect(() => setRole(s.league, ben, s.groupId, "ghost", "admin")).toThrow(/not an active member/);
    s.league = setRole(s.league, ben, s.groupId, admin, "member");
    expect(() => setRole(s.league, ben, s.groupId, ben, "member")).toThrow(/at least one admin/);
    expect(() => removeMember(s.league, ben, s.groupId, ben)).toThrow(/at least one admin/);
  });

  it("admin rights are per group", () => {
    const s = setup(3);
    const other = createGroup(s.league, s.players[1], { name: "Other" });
    s.league = addMember(other.league, s.players[1], other.id, "anna");
    // anna admins group one but is only a member of the other group
    expect(() => updateGroup(s.league, s.admin, other.id, { name: "Hijacked" })).toThrow(/Only group admins/);
    expect(updateGroup(s.league, s.admin, s.groupId, { name: "Renamed" }).groups[0].name).toBe("Renamed");
  });

  it("hides private groups from outsiders", () => {
    const s = setup(3);
    expect(() => updateGroup(s.league, s.outsider, s.groupId, { name: "Mine now" })).toThrow(/does not exist/);
    expect(() => respondToEvent(s.league, s.outsider, s.groupId, s.eventId, "going")).toThrow(/does not exist/);
    expect(viewFor(s.league, s.outsider).groups).toEqual([]);
    const view = viewFor(s.league, s.players[1]);
    expect(view.groups).toHaveLength(1);
    expect(view.users.map((u) => u.username).sort()).toEqual(["anna", "ben", "cleo"]); // only group mates
  });

  it("lets members leave; admins remove others; history is kept", () => {
    const s = setup(4);
    s.league = finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players)).league;
    expect(() => removeMember(s.league, s.players[1], s.groupId, s.players[2])).toThrow(/Only group admins/);
    s.league = removeMember(s.league, s.players[1], s.groupId, s.players[1]);
    s.league = removeMember(s.league, s.admin, s.groupId, s.players[3]);
    expect(resultRows(s.group())).toHaveLength(4);
    expect(viewFor(s.league, s.players[1]).groups).toEqual([]);
    s.league = addMember(s.league, s.admin, s.groupId, "ben"); // returning player, same record
    expect(s.group().members.filter((m) => m.userId === s.players[1])).toHaveLength(1);
  });

  it("only admins delete groups", () => {
    const s = setup(3);
    expect(() => deleteGroup(s.league, s.players[1], s.groupId)).toThrow(/Only group admins/);
    expect(deleteGroup(s.league, s.admin, s.groupId).groups).toEqual([]);
  });
});

describe("events and attendance", () => {
  it("only admins manage events; members respond for themselves only", () => {
    const s = setup(4);
    const [, ben] = s.players;
    expect(() => createEvent(s.league, ben, s.groupId, { title: "Nope", startsAt: FUTURE })).toThrow(/Only group admins/);
    expect(() => cancelEvent(s.league, ben, s.groupId, s.eventId)).toThrow(/Only group admins/);
    expect(() => inviteToEvent(s.league, ben, s.groupId, s.eventId, [ben])).toThrow(/Only group admins/);
    s.league = respondToEvent(s.league, ben, s.groupId, s.eventId, "going");
    expect(s.group().events[0].invitations[ben]).toBe("going");
    expect(s.group().events[0].invitations[s.admin]).toBe("invited");
  });

  it("counts each response once and rejects invalid ones", () => {
    const s = setup(4);
    s.league = respondToEvent(s.league, s.players[0], s.groupId, s.eventId, "going");
    s.league = respondToEvent(s.league, s.players[0], s.groupId, s.eventId, "going");
    expect(goingCount(s.group().events[0])).toBe(1);
    expect(() => respondToEvent(s.league, s.players[0], s.groupId, s.eventId, "attending")).toThrow();
  });

  it("enforces the participant limit and frees seats", () => {
    const s = setup(4, { maxParticipants: 2 });
    const [a, b, c] = s.players;
    s.league = respondToEvent(s.league, a, s.groupId, s.eventId, "going");
    s.league = respondToEvent(s.league, b, s.groupId, s.eventId, "going");
    expect(() => respondToEvent(s.league, c, s.groupId, s.eventId, "going")).toThrow(/full/);
    s.league = respondToEvent(s.league, c, s.groupId, s.eventId, "maybe");
    s.league = respondToEvent(s.league, a, s.groupId, s.eventId, "declined");
    s.league = respondToEvent(s.league, c, s.groupId, s.eventId, "going");
    expect(goingCount(s.group().events[0])).toBe(2);
  });

  it("will not lower the limit below the confirmed players", () => {
    const s = setup(4, { maxParticipants: 3 });
    for (const id of s.players.slice(0, 3)) s.league = respondToEvent(s.league, id, s.groupId, s.eventId, "going");
    expect(() => updateEvent(s.league, s.admin, s.groupId, s.eventId, { title: "Game night", startsAt: FUTURE, maxParticipants: 2 })).toThrow(/lower than/);
  });

  it("respects the registration deadline but always allows declining", () => {
    const s = setup(4, { registrationDeadline: "2099-01-01T10:00:00.000Z" });
    const late = new Date("2099-01-01T12:00:00.000Z");
    expect(() => respondToEvent(s.league, s.players[0], s.groupId, s.eventId, "going", late)).toThrow(/deadline/);
    expect(respondToEvent(s.league, s.players[0], s.groupId, s.eventId, "declined", late)).toBeTruthy();
  });

  it("closes cancelled events and frees seats of removed members", () => {
    const s = setup(4, { maxParticipants: 2 });
    s.league = respondToEvent(s.league, s.players[1], s.groupId, s.eventId, "going");
    s.league = removeMember(s.league, s.admin, s.groupId, s.players[1]);
    expect(goingCount(s.group().events[0])).toBe(0);
    s.league = cancelEvent(s.league, s.admin, s.groupId, s.eventId);
    expect(() => respondToEvent(s.league, s.players[0], s.groupId, s.eventId, "going")).toThrow(/no longer open/);
    expect(() => cancelEvent(s.league, s.admin, s.groupId, s.eventId)).toThrow(/Only scheduled/);
  });
});

describe("tournament results", () => {
  it.each([4, 5, 6, 7])("awards the %i-player points table", (size) => {
    const s = setup(size);
    s.league = finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players)).league;
    expect(s.group().tournaments[0].results.map((r) => r.points)).toEqual(s.players.map((_, i) => pointsForPlacement(size, i + 1)));
    expect(s.group().events[0].status).toBe("completed");
  });

  it("only admins finalize or correct", () => {
    const s = setup(4);
    expect(() => finalizeTournament(s.league, s.players[1], s.groupId, s.eventId, order(s.players))).toThrow(/Only group admins/);
    s.league = finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players)).league;
    const tid = s.group().tournaments[0].id;
    expect(() => correctTournament(s.league, s.players[1], s.groupId, tid, order(s.players))).toThrow(/Only group admins/);
  });

  it("does not award points for attendance alone", () => {
    const s = setup(4);
    s.league = respondToEvent(s.league, s.players[0], s.groupId, s.eventId, "going");
    expect(resultRows(s.group())).toEqual([]);
  });

  it("rejects invalid fields, duplicate positions and foreign players", () => {
    const s = setup(5);
    const finalize = (p: { userId: string; position: number }[]) => finalizeTournament(s.league, s.admin, s.groupId, s.eventId, p);
    expect(() => finalize(order(s.players.slice(0, 3)))).toThrow(/4, 5, 6, or 7/);
    expect(() => finalize(order([...s.players, "x", "y", "z"]))).toThrow(/4, 5, 6, or 7/);
    expect(() => finalize(order([...s.players.slice(0, 3), s.outsider]))).toThrow(/belong to this group/);
    expect(() => finalize(order(s.players.slice(0, 4)).map((p, i) => (i === 3 ? { ...p, position: 3 } : p)))).toThrow(/unique position/i);
    expect(() => finalize(order([s.players[0], s.players[0], s.players[1], s.players[2]]))).toThrow(/exactly once/);
    expect(s.group().tournaments).toEqual([]);
  });

  it("refuses removed players for new results and cancelled events", () => {
    const s = setup(5);
    s.league = removeMember(s.league, s.admin, s.groupId, s.players[4]);
    expect(() => finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players))).toThrow(/belong to this group/);
    s.league = cancelEvent(s.league, s.admin, s.groupId, s.eventId);
    expect(() => finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players.slice(0, 4)))).toThrow(/cancelled/);
  });

  it("cannot be finalized twice", () => {
    const s = setup(4);
    s.league = finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players)).league;
    expect(() => finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players))).toThrow(/already finalized/);
    expect(s.group().tournaments).toHaveLength(1);
  });

  it("corrections recalculate points without duplicating them", () => {
    const s = setup(4);
    s.league = finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players)).league;
    const tid = s.group().tournaments[0].id;
    const swapped = [s.players[1], s.players[0], s.players[2], s.players[3]];
    s.league = correctTournament(s.league, s.admin, s.groupId, tid, order(swapped));
    s.league = correctTournament(s.league, s.admin, s.groupId, tid, order(swapped));
    const board = computeLeaderboard(resultRows(s.group()));
    expect(board.find((e) => e.userId === s.players[1])?.totalPoints).toBe(10);
    expect(board.find((e) => e.userId === s.players[0])?.totalPoints).toBe(6);
    expect(board.reduce((sum, e) => sum + e.totalPoints, 0)).toBe(20);
    expect(s.group().tournaments[0].correctionCount).toBe(2);
    expect(() => correctTournament(s.league, s.admin, s.groupId, tid, order([...s.players.slice(0, 3), s.outsider]))).toThrow(/belong to this group/);
  });

  it("keeps leaderboards of different groups independent", () => {
    const s = setup(4);
    s.league = finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players)).league;
    const second = createGroup(s.league, s.admin, { name: "Other" });
    const [g1, g2] = second.league.groups;
    expect(computeLeaderboard(resultRows(g1))[0].totalPoints).toBe(10);
    expect(computeLeaderboard(resultRows(g2))).toEqual([]);
  });

  it("does not mutate the previous league", () => {
    const s = setup(4);
    const before = JSON.stringify(s.league);
    finalizeTournament(s.league, s.admin, s.groupId, s.eventId, order(s.players));
    expect(JSON.stringify(s.league)).toBe(before);
  });
});
