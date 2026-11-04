import { describe, expect, it } from "vitest";
import { computeLeaderboard, highlights, personalStats, pointsOverTime, type ResultRow } from "./stats";

const row = (tournamentId: string, userId: string, position: number, points: number, playedAt = "2026-01-01T19:00:00Z"): ResultRow => ({
  tournamentId, userId, position, points, playedAt,
});

describe("computeLeaderboard", () => {
  it("sorts by points, then wins, then seconds, then thirds", () => {
    const board = computeLeaderboard([
      // d: 1+10 = 11, a: 10+0 = 10, b: 6+3 = 9, c: 3+1 = 4
      row("t1", "a", 1, 10), row("t1", "b", 2, 6), row("t1", "c", 3, 3), row("t1", "d", 4, 1),
      row("t2", "b", 3, 3), row("t2", "a", 5, 0), row("t2", "c", 4, 1), row("t2", "d", 1, 10),
    ]);
    expect(board.map((e) => e.userId)).toEqual(["d", "a", "b", "c"]);
    expect(board[0]).toMatchObject({ rank: 1, totalPoints: 11, wins: 1, played: 2, averagePosition: 2.5 });
  });

  it("breaks point ties by wins, then second places, then third places", () => {
    const board = computeLeaderboard([
      row("t1", "wins", 1, 6), row("t1", "seconds", 2, 6), row("t1", "thirds", 3, 6),
      row("t1", "z", 4, 0), row("t1", "y", 5, 0),
    ]);
    expect(board.map((e) => e.userId).slice(0, 3)).toEqual(["wins", "seconds", "thirds"]);
  });

  it("shares a rank only when all four criteria are equal", () => {
    const board = computeLeaderboard([row("t1", "a", 2, 6), row("t2", "b", 2, 6), row("t3", "c", 3, 3)]);
    expect(board.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  it("keeps groups independent because it only sees the rows it is given", () => {
    const groupOne = [row("t1", "a", 1, 10)];
    const groupTwo = [row("t9", "a", 4, 1)];
    expect(computeLeaderboard(groupOne)[0].totalPoints).toBe(10);
    expect(computeLeaderboard(groupTwo)[0].totalPoints).toBe(1);
  });

  it("returns an empty board without results", () => {
    expect(computeLeaderboard([])).toEqual([]);
  });

  it("does not double count when a correction replaces rows", () => {
    const before = computeLeaderboard([row("t1", "a", 1, 10), row("t1", "b", 2, 6)]);
    const after = computeLeaderboard([row("t1", "a", 2, 6), row("t1", "b", 1, 10)]);
    expect(before.find((e) => e.userId === "a")?.totalPoints).toBe(10);
    expect(after.find((e) => e.userId === "a")?.totalPoints).toBe(6);
    expect(after.reduce((sum, e) => sum + e.totalPoints, 0)).toBe(16);
  });
});

describe("pointsOverTime", () => {
  it("accumulates points per tournament and carries totals over missed ones", () => {
    const { tournaments, series } = pointsOverTime([
      row("t1", "a", 1, 10, "2026-01-01T00:00:00Z"), row("t1", "b", 2, 6, "2026-01-01T00:00:00Z"),
      row("t2", "a", 2, 6, "2026-02-01T00:00:00Z"),
    ]);
    expect(tournaments.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(series.get("a")).toEqual([10, 16]);
    expect(series.get("b")).toEqual([6, 6]);
  });
});

describe("personalStats and highlights", () => {
  it("summarizes a player's results", () => {
    expect(personalStats([row("t1", "a", 1, 10), row("t2", "a", 3, 3)])).toEqual({ played: 2, wins: 1, totalPoints: 13, averagePosition: 2 });
    expect(personalStats([]).averagePosition).toBeNull();
  });

  it("finds the leaders per category and ignores empty categories", () => {
    const board = computeLeaderboard([row("t1", "a", 1, 10), row("t1", "b", 3, 3), row("t1", "c", 4, 1), row("t1", "d", 5, 0)]);
    const top = highlights(board);
    expect(top.mostWins).toEqual({ userId: "a", value: 1 });
    expect(top.mostSeconds).toBeNull();
  });
});
