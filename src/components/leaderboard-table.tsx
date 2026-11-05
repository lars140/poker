import { PlayerName } from "@/components/ui";
import type { Group } from "@/lib/domain";
import type { LeaderboardEntry } from "@/lib/stats";

export function LeaderboardTable({ entries, group }: { entries: LeaderboardEntry[]; group: Group }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <caption className="sr-only">Group leaderboard</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col" className="text-right">Points</th>
            <th scope="col" className="text-right">1st</th>
            <th scope="col" className="text-right">2nd</th>
            <th scope="col" className="text-right">3rd</th>
            <th scope="col" className="text-right">Played</th>
            <th scope="col" className="text-right">Avg. pos.</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {entries.map((entry) => {
            return (
              <tr key={entry.userId}>
                <td className={`font-bold ${entry.rank === 1 ? "text-accent" : "text-muted"}`}>{entry.rank}</td>
                <td><PlayerName group={group} userId={entry.userId} /></td>
                <td className="text-right text-base font-bold text-accent">{entry.totalPoints}</td>
                <td className="text-right">{entry.wins}</td>
                <td className="text-right">{entry.seconds}</td>
                <td className="text-right">{entry.thirds}</td>
                <td className="text-right">{entry.played}</td>
                <td className="text-right text-muted">{entry.averagePosition.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
