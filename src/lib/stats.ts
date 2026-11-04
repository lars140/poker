/** One player's finish in one finalized tournament. */
export type ResultRow = {
  tournamentId: string;
  userId: string;
  position: number;
  points: number;
  playedAt: string;
};

export type LeaderboardEntry = {
  userId: string;
  rank: number;
  totalPoints: number;
  wins: number;
  seconds: number;
  thirds: number;
  played: number;
  averagePosition: number;
};

/**
 * Builds a group leaderboard from finalized results only. Sorted by points, wins,
 * second places, then third places; entries equal on all four share a rank.
 * Callers pass one group's results, so groups can never mix.
 */
export function computeLeaderboard(results: ResultRow[]): LeaderboardEntry[] {
  const byUser = new Map<string, ResultRow[]>();
  for (const row of results) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

  const entries = [...byUser].map(([userId, rows]) => ({
    userId,
    totalPoints: rows.reduce((sum, r) => sum + r.points, 0),
    wins: rows.filter((r) => r.position === 1).length,
    seconds: rows.filter((r) => r.position === 2).length,
    thirds: rows.filter((r) => r.position === 3).length,
    played: rows.length,
    averagePosition: rows.reduce((sum, r) => sum + r.position, 0) / rows.length,
  }));

  const key = (e: (typeof entries)[number]) => [e.totalPoints, e.wins, e.seconds, e.thirds];
  const compare = (a: (typeof entries)[number], b: (typeof entries)[number]) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };

  entries.sort((a, b) => compare(a, b) || a.averagePosition - b.averagePosition || a.userId.localeCompare(b.userId));
  const ranked: LeaderboardEntry[] = [];
  entries.forEach((entry, index) => {
    const tied = index > 0 && compare(entries[index - 1], entry) === 0;
    ranked.push({ ...entry, rank: tied ? ranked[index - 1].rank : index + 1 });
  });
  return ranked;
}

export type PointsSeries = {
  /** Tournaments in chronological order; every series has one value per entry. */
  tournaments: { id: string; playedAt: string }[];
  /** Cumulative points of each player after each tournament (carried forward when they skipped one). */
  series: Map<string, number[]>;
};

export function pointsOverTime(results: ResultRow[]): PointsSeries {
  const sorted = [...results].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.tournamentId.localeCompare(b.tournamentId));
  const tournaments: PointsSeries["tournaments"] = [];
  for (const row of sorted) {
    if (!tournaments.some((t) => t.id === row.tournamentId)) tournaments.push({ id: row.tournamentId, playedAt: row.playedAt });
  }
  const pointsBy = new Map<string, Map<string, number>>(); // userId -> tournamentId -> points
  for (const row of sorted) pointsBy.set(row.userId, (pointsBy.get(row.userId) ?? new Map()).set(row.tournamentId, row.points));

  const series = new Map<string, number[]>();
  for (const [userId, perTournament] of pointsBy) {
    let total = 0;
    series.set(userId, tournaments.map((t) => (total += perTournament.get(t.id) ?? 0)));
  }
  return { tournaments, series };
}

export type PersonalStats = {
  played: number;
  wins: number;
  totalPoints: number;
  averagePosition: number | null;
};

export function personalStats(results: ResultRow[]): PersonalStats {
  const played = results.length;
  return {
    played,
    wins: results.filter((r) => r.position === 1).length,
    totalPoints: results.reduce((sum, r) => sum + r.points, 0),
    averagePosition: played ? results.reduce((sum, r) => sum + r.position, 0) / played : null,
  };
}

/** Which leaderboard entry leads each headline category (ties go to the leaderboard order). */
export function highlights(board: LeaderboardEntry[]) {
  const best = (pick: (e: LeaderboardEntry) => number) =>
    board.reduce<LeaderboardEntry | null>((top, e) => (!top || pick(e) > pick(top) ? e : top), null);
  const leader = (entry: LeaderboardEntry | null, value: (e: LeaderboardEntry) => number) =>
    entry && value(entry) > 0 ? { userId: entry.userId, value: value(entry) } : null;
  return {
    mostWins: leader(best((e) => e.wins), (e) => e.wins),
    highestPoints: leader(best((e) => e.totalPoints), (e) => e.totalPoints),
    mostSeconds: leader(best((e) => e.seconds), (e) => e.seconds),
    mostPlayed: leader(best((e) => e.played), (e) => e.played),
  };
}
