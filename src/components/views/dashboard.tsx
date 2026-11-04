"use client";

import { useState } from "react";
import { EmptyState, formatDate, formatDateTime, PageHeader, PlayerName, Stat } from "@/components/ui";
import { goingCount, type League } from "@/lib/domain";
import { Link } from "@/lib/router";

export function Dashboard({ league }: { league: League }) {
  const [now] = useState(() => Date.now());
  const upcoming = league.groups
    .flatMap((g) => g.events.filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now).map((event) => ({ group: g, event })))
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt))
    .slice(0, 5);
  const recent = league.groups
    .flatMap((g) => g.tournaments.map((tournament) => ({ group: g, tournament })))
    .sort((a, b) => b.tournament.playedAt.localeCompare(a.tournament.playedAt))
    .slice(0, 5);
  const tournamentCount = league.groups.reduce((n, g) => n + g.tournaments.length, 0);
  const playerCount = new Set(league.groups.flatMap((g) => g.members.filter((m) => !m.archived).map((m) => m.name.toLowerCase()))).size;

  return (
    <div className="rise grid gap-6">
      <PageHeader
        title="Your poker leagues"
        subtitle="Groups, game nights, results and leaderboards for your in-person games."
        actions={
          <>
            <Link to="/groups/new" className="btn btn-primary">Create group</Link>
            {league.groups.length > 0 && <Link to={`/g/${league.groups[0].id}/events/new`} className="btn">Create event</Link>}
          </>
        }
      />

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Groups" value={league.groups.length} />
        <Stat label="Players" value={playerCount} />
        <Stat label="Upcoming events" value={upcoming.length} />
        <Stat label="Tournaments played" value={tournamentCount} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">Groups</h2>
          {league.groups.length === 0 ? (
            <EmptyState title="Start your first league" action={{ to: "/groups/new", label: "Create a group" }}>
              Create a group, add your regular players and schedule the first game night. Already have a backup? Restore it on the Data page.
            </EmptyState>
          ) : (
            <ul className="grid gap-2">
              {league.groups.map((g) => (
                <li key={g.id}>
                  <Link to={`/g/${g.id}`} className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-3 transition hover:border-accent/50">
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-xs text-muted">{g.members.filter((m) => !m.archived).length} players</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Upcoming events</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming events">Create an event inside a group to plan the next game night.</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {upcoming.map(({ group, event }) => (
                <li key={event.id}>
                  <Link to={`/g/${group.id}/events/${event.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 transition hover:border-accent/50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{event.title}</span>
                      <span className="block text-xs text-muted">{group.name} · {formatDateTime(event.startsAt)}</span>
                    </span>
                    <span className="text-xs text-muted">{goingCount(event)}{event.maxParticipants ? `/${event.maxParticipants}` : ""} going</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Recent tournament results</h2>
        {recent.length === 0 ? (
          <EmptyState title="No results yet">Finalized tournaments from your groups show up here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Tournament</th><th>Group</th><th>Date</th><th>Winner</th></tr></thead>
              <tbody>
                {recent.map(({ group, tournament }) => {
                  const winner = tournament.results.find((r) => r.position === 1);
                  return (
                    <tr key={tournament.id}>
                      <td><Link className="font-semibold hover:text-accent" to={`/g/${group.id}/history/${tournament.id}`}>{tournament.title}</Link></td>
                      <td className="text-muted">{group.name}</td>
                      <td className="whitespace-nowrap text-muted">{formatDate(tournament.playedAt)}</td>
                      <td>{winner ? <PlayerName group={group} memberId={winner.memberId} /> : "–"}</td>
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
