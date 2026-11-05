"use client";

import { useState } from "react";
import { CalendarDays, Clock, Spade, Trophy, UserRound, Users } from "lucide-react";
import { EmptyState, formatDate, PlayerName, Stat } from "@/components/ui";
import { goingCount, isAdminOf, type Group, type League, type PokerEvent } from "@/lib/domain";
import { Link } from "@/lib/router";
import { useSession } from "@/lib/session";

/** Calendar-style event line used on the dashboard and the events page. */
export function EventRow({ group, event, badge }: { group: Group; event: PokerEvent; badge?: React.ReactNode }) {
  const start = new Date(event.startsAt);
  const going = goingCount(event);
  return (
    <Link to={`/g/${group.id}/events/${event.id}`} className="row hover:bg-accent/5">
      <span className="flex min-w-0 items-center gap-4">
        <span className="grid w-14 shrink-0 place-items-center rounded-xl border border-line bg-black/50 py-1.5 text-center leading-tight">
          <span className="text-[11px] font-semibold uppercase text-muted">{start.toLocaleString("en", { month: "short" })}</span>
          <span className="text-xl font-extrabold">{start.getDate()}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{event.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <Clock size={13} aria-hidden />
            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {event.location ? ` · ${event.location}` : ""} · {group.name}
          </span>
        </span>
      </span>
      {badge ?? (
        <span className="pill shrink-0 whitespace-nowrap">
          <UserRound size={15} aria-hidden />{going}{event.maxParticipants ? `/${event.maxParticipants}` : ""} going
        </span>
      )}
    </Link>
  );
}

export function Dashboard({ league }: { league: League }) {
  const { me } = useSession();
  const adminGroup = league.groups.find((g) => me && isAdminOf(g, me.id));
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
  const playerCount = new Set(league.groups.flatMap((g) => g.members.filter((m) => !m.archived).map((m) => m.userId))).size;

  return (
    <div className="rise grid gap-6">
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <Spade aria-hidden className="pointer-events-none absolute left-[46%] top-0 hidden size-28 fill-white/[0.03] text-white/[0.06] md:block" strokeWidth={1} />
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Welcome back, <span className="text-accent">{me?.displayName || me?.username || "player"}!</span>
          </h1>
          <p className="mt-2 text-sm text-muted sm:text-base">Groups, game nights, results and leaderboards for your in-person games.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/groups/new" className="btn btn-primary min-h-12 px-6 text-base">+ Create group</Link>
          {adminGroup && <Link to={`/g/${adminGroup.id}/events/new`} className="btn min-h-12 px-6 text-base"><CalendarDays size={18} aria-hidden />Create event</Link>}
        </div>
      </div>

      <section aria-label="Overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label="Groups" value={league.groups.length} />
        <Stat icon={Users} label="Players in your groups" value={playerCount} />
        <Stat icon={CalendarDays} label="Upcoming events" value={upcoming.length} />
        <Stat icon={Trophy} label="Tournaments played" value={tournamentCount} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title"><Users size={18} aria-hidden />Groups</h2>
          {league.groups.length === 0 ? (
            <EmptyState title="Start your first league" action={{ to: "/groups/new", label: "Create a group" }}>
              Create a group and add your friends by username, or ask a group admin to add yours.
            </EmptyState>
          ) : (
            <ul className="grid gap-1">
              {league.groups.map((g) => (
                <li key={g.id} className="row">
                  <span className="flex min-w-0 items-center gap-4">
                    <span className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-accent/70 text-accent"><Spade size={24} className="fill-accent" aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-bold">{g.name}</span>
                      <span className="block text-sm text-muted">{g.members.filter((m) => !m.archived).length} members</span>
                    </span>
                  </span>
                  <Link to={`/g/${g.id}`} className="pill shrink-0 whitespace-nowrap">View group →</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="card-title"><CalendarDays size={18} aria-hidden />Upcoming events</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming events">Create an event inside a group to plan the next game night.</EmptyState>
          ) : (
            <ul className="grid gap-1">{upcoming.map(({ group, event }) => <li key={event.id}><EventRow group={group} event={event} /></li>)}</ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="card-title"><Trophy size={18} aria-hidden />Recent tournament results</h2>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
            <Trophy size={36} className="mx-auto mb-2 text-accent" aria-hidden />
            <p className="text-lg font-bold">No results yet</p>
            <p className="mt-1 text-sm text-muted">Finalized tournaments from your groups show up here.</p>
          </div>
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
