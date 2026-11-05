"use client";

import { useState } from "react";
import { EventRow } from "@/components/views/dashboard";
import { EmptyState, formatDate, PageHeader, PlayerName, StatusBadge } from "@/components/ui";
import { resultRows, type Group, type League, type PokerEvent } from "@/lib/domain";
import { Link } from "@/lib/router";
import { computeLeaderboard } from "@/lib/stats";

type Entry = { group: Group; event: PokerEvent };

/** All events of all of the user's groups, upcoming first. */
export function EventsOverview({ league }: { league: League }) {
  const [now] = useState(() => Date.now());
  const all: Entry[] = league.groups.flatMap((group) => group.events.map((event) => ({ group, event })));
  const isUpcoming = ({ event }: Entry) => event.status === "scheduled" && new Date(event.startsAt).getTime() >= now;
  const upcoming = all.filter(isUpcoming).sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  const earlier = all.filter((e) => !isUpcoming(e)).sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));

  return (
    <div className="rise grid gap-6">
      <PageHeader title="Events" subtitle="Game nights across all of your groups." />
      <section className="card">
        <h2 className="card-title">Upcoming events</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming events">Group admins create events inside their group.</EmptyState>
        ) : (
          <ul className="grid gap-1">{upcoming.map((e) => <li key={e.event.id}><EventRow group={e.group} event={e.event} /></li>)}</ul>
        )}
      </section>
      {earlier.length > 0 && (
        <section className="card">
          <h2 className="card-title">Earlier and cancelled</h2>
          <ul className="grid gap-1">
            {earlier.map((e) => (
              <li key={e.event.id}><EventRow group={e.group} event={e.event} badge={<StatusBadge status={e.event.status} />} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Every finalized tournament of all of the user's groups. */
export function TournamentsOverview({ league }: { league: League }) {
  const rows = league.groups
    .flatMap((group) => group.tournaments.map((tournament) => ({ group, tournament })))
    .sort((a, b) => b.tournament.playedAt.localeCompare(a.tournament.playedAt));

  return (
    <div className="rise">
      <PageHeader title="Tournaments" subtitle="Finalized results from all of your groups." />
      <section className="card">
        {rows.length === 0 ? (
          <EmptyState title="No results yet">Finalized tournaments from your groups show up here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Tournament</th><th>Group</th><th>Date</th><th>Players</th><th>Winner</th></tr></thead>
              <tbody>
                {rows.map(({ group, tournament }) => {
                  const winner = tournament.results.find((r) => r.position === 1);
                  return (
                    <tr key={tournament.id}>
                      <td><Link className="font-semibold hover:text-accent" to={`/g/${group.id}/history/${tournament.id}`}>{tournament.title}</Link></td>
                      <td className="text-muted">{group.name}</td>
                      <td className="whitespace-nowrap text-muted">{formatDate(tournament.playedAt)}</td>
                      <td className="text-muted">{tournament.results.length}</td>
                      <td>{winner ? <PlayerName group={group} userId={winner.memberId} /> : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** One summary card per group; the full statistics live inside each group. */
export function StatisticsOverview({ league }: { league: League }) {
  return (
    <div className="rise">
      <PageHeader title="Statistics" subtitle="Who leads each of your groups." />
      {league.groups.length === 0 ? (
        <EmptyState title="No groups yet" action={{ to: "/groups/new", label: "Create a group" }}>Statistics appear once a group has played.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {league.groups.map((group) => {
            const board = computeLeaderboard(resultRows(group));
            const leader = board[0];
            return (
              <section key={group.id} className="card">
                <h2 className="card-title">{group.name}</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs uppercase tracking-wide text-muted">Tournaments</dt><dd className="text-2xl font-bold tabular-nums">{group.tournaments.length}</dd></div>
                  <div><dt className="text-xs uppercase tracking-wide text-muted">Players ranked</dt><dd className="text-2xl font-bold tabular-nums">{board.length}</dd></div>
                </dl>
                <p className="mt-4 text-sm">
                  {leader ? <><span className="text-muted">Leader: </span><PlayerName group={group} userId={leader.userId} /><span className="ml-2 font-bold text-accent">{leader.totalPoints} pts</span></> : <span className="text-muted">No results yet.</span>}
                </p>
                <Link to={`/g/${group.id}/stats`} className="pill mt-4">Open statistics</Link>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
