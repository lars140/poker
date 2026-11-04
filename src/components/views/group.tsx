"use client";

import { useState } from "react";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { PointsChart } from "@/components/points-chart";
import { Alert, EmptyState, Field, formatDate, formatDateTime, PageHeader, PlayerName, Stat, useAction } from "@/components/ui";
import { addMember, createGroup, deleteGroup, resultRows, setMemberArchived, updateGroup, type Group, type League } from "@/lib/domain";
import { ordinal } from "@/lib/format";
import { Link, navigate, usePath } from "@/lib/router";
import { commit } from "@/lib/storage";
import { computeLeaderboard, highlights, pointsOverTime } from "@/lib/stats";

const TABS = [
  { to: "", label: "Leaderboard" },
  { to: "/events", label: "Events" },
  { to: "/history", label: "History" },
  { to: "/stats", label: "Statistics" },
  { to: "/members", label: "Players" },
];

export function GroupShell({ group, children }: { group: Group; children: React.ReactNode }) {
  const path = usePath().split("?")[0];
  const base = `/g/${group.id}`;
  return (
    <div className="rise">
      <PageHeader title={group.name} subtitle={group.description ?? "Private poker group"} />
      <nav aria-label="Group" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((tab) => {
          const href = base + tab.to;
          const active = tab.to === "" ? path === base : path === href || path.startsWith(`${href}/`);
          return (
            <Link key={tab.label} to={href} aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

export function GroupsList({ league }: { league: League }) {
  return (
    <div className="rise">
      <PageHeader title="Groups" subtitle="Every group has its own players, events and leaderboard."
        actions={<Link to="/groups/new" className="btn btn-primary">Create group</Link>} />
      {league.groups.length === 0 ? (
        <EmptyState title="No groups yet" action={{ to: "/groups/new", label: "Create your first group" }}>Create a group for your poker night.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {league.groups.map((g) => (
            <li key={g.id}>
              <Link to={`/g/${g.id}`} className="card block h-full transition hover:border-accent/50">
                <h2 className="font-bold">{g.name}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{g.description ?? "No description"}</p>
                <p className="mt-3 text-xs text-muted">{g.members.filter((m) => !m.archived).length} players · {g.tournaments.length} tournaments</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewGroup({ league }: { league: League }) {
  const { run, feedback } = useAction();
  return (
    <div className="rise mx-auto max-w-xl">
      <PageHeader title="Create a group" subtitle="Then add the players who take part in your games." />
      <form className="card grid gap-4" onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() => {
          const created = createGroup(league, { name: String(data.get("name") ?? ""), description: String(data.get("description") ?? "") });
          commit(created.league);
          navigate(`/g/${created.id}/members`);
        });
      }}>
        <Field label="Group name"><input name="name" className="input" required placeholder="Friday Night Hold'em" /></Field>
        <Field label="Description (optional)"><textarea name="description" className="input" rows={3} /></Field>
        {feedback}
        <button className="btn btn-primary" type="submit">Create group</button>
      </form>
    </div>
  );
}

export function Leaderboard({ group }: { group: Group }) {
  const board = computeLeaderboard(resultRows(group));
  const next = group.events.filter((e) => e.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 3);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="card">
        <h2 className="card-title">Leaderboard</h2>
        {board.length === 0 ? (
          <EmptyState title="No finalized tournaments yet">Points are awarded once the results of a game night are finalized.</EmptyState>
        ) : (
          <LeaderboardTable entries={board} group={group} />
        )}
      </section>
      <aside className="card content-start">
        <h2 className="card-title">Next game nights</h2>
        {next.length === 0 ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
          <ul className="grid gap-2">
            {next.map((event) => (
              <li key={event.id}>
                <Link to={`/g/${group.id}/events/${event.id}`} className="block rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition hover:border-accent/50">
                  <span className="block font-semibold">{event.title}</span>
                  <span className="text-xs text-muted">{formatDateTime(event.startsAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to={`/g/${group.id}/events/new`} className="btn btn-sm mt-4 w-full">Create event</Link>
      </aside>
    </div>
  );
}

export function Players({ league, group }: { league: League; group: Group }) {
  const { run, feedback } = useAction();
  const active = group.members.filter((m) => !m.archived);
  const archived = group.members.filter((m) => m.archived);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="card-title">Players ({active.length})</h2>
        {active.length === 0 && <p className="mb-3 text-sm text-muted">Add the people who play in this group. You need at least 4 for a tournament.</p>}
        <ul className="divide-y divide-line">
          {active.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <PlayerName group={group} memberId={m.id} />
              <button className="btn btn-sm btn-danger" type="button" onClick={() => {
                if (window.confirm(`Archive ${m.name}? Their past results stay in the history.`)) run(() => commit(setMemberArchived(league, group.id, m.id, true)));
              }}>Archive</button>
            </li>
          ))}
        </ul>
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = String(new FormData(form).get("name") ?? "");
          run(() => { commit(addMember(league, group.id, name)); form.reset(); });
        }}>
          <input name="name" className="input max-w-xs" placeholder="Player name" aria-label="Player name" required />
          <button className="btn btn-primary" type="submit">Add player</button>
        </form>
        {feedback && <div className="mt-3">{feedback}</div>}
        {archived.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Archived players</h3>
            <ul className="flex flex-wrap gap-2">
              {archived.map((m) => (
                <li key={m.id}><button className="btn btn-sm" type="button" onClick={() => run(() => commit(setMemberArchived(league, group.id, m.id, false)))}>Restore {m.name}</button></li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Group settings</h2>
        <form className="grid max-w-xl gap-4" onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          run(() => { commit(updateGroup(league, group.id, { name: String(data.get("name")), description: String(data.get("description")) })); return "Saved."; });
        }}>
          <Field label="Name"><input name="name" className="input" required defaultValue={group.name} /></Field>
          <Field label="Description"><textarea name="description" className="input" rows={3} defaultValue={group.description} /></Field>
          <div><button className="btn btn-primary" type="submit">Save settings</button></div>
        </form>
        <div className="mt-6 border-t border-line pt-4">
          {confirmDelete ? (
            <div className="grid gap-2">
              <Alert kind="warn">This permanently deletes the group with all events and results from this browser.</Alert>
              <div className="flex gap-2">
                <button className="btn btn-danger btn-sm" type="button" onClick={() => { commit(deleteGroup(league, group.id)); navigate("/groups"); }}>Yes, delete group</button>
                <button className="btn btn-sm" type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirmDelete(true)}>Delete group…</button>
          )}
        </div>
      </section>
    </div>
  );
}

export function History({ group }: { group: Group }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = [...group.tournaments]
    .filter((t) => (!from || t.playedAt.slice(0, 10) >= from) && (!to || t.playedAt.slice(0, 10) <= to))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));

  return (
    <div className="grid gap-6">
      <div className="card flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {(from || to) && <button className="btn btn-sm" type="button" onClick={() => { setFrom(""); setTo(""); }}>Clear</button>}
      </div>
      {list.length === 0 ? <EmptyState title="No tournaments found">Finalized game nights appear here.</EmptyState> : (
        <ul className="grid gap-3">
          {list.map((t) => {
            const winner = t.results.find((r) => r.position === 1);
            return (
              <li key={t.id}>
                <Link to={`/g/${group.id}/history/${t.id}`} className="card flex flex-wrap items-center justify-between gap-3 transition hover:border-accent/50">
                  <span>
                    <span className="block font-bold">{t.title}</span>
                    <span className="text-sm text-muted">{formatDate(t.playedAt)} · {t.results.length} players</span>
                  </span>
                  {winner && <span className="text-sm"><span className="mr-2 text-xs uppercase tracking-wide text-muted">Winner</span><PlayerName group={group} memberId={winner.memberId} /></span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Statistics({ group }: { group: Group }) {
  const rows = resultRows(group);
  if (rows.length === 0) return <EmptyState title="No statistics yet">Statistics appear after the first tournament is finalized.</EmptyState>;
  const board = computeLeaderboard(rows);
  const top = highlights(board);
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? "Unknown";
  const labels = new Map(group.members.map((m) => [m.id, m.name]));
  const cards = [
    { label: "Most wins", entry: top.mostWins },
    { label: "Highest total points", entry: top.highestPoints },
    { label: "Most second places", entry: top.mostSeconds },
    { label: "Most tournaments played", entry: top.mostPlayed },
  ];
  return (
    <div className="grid gap-6">
      <section aria-label="Highlights" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Tournaments held" value={group.tournaments.length} />
        {cards.map((c) => (
          <Stat key={c.label} label={c.label} value={c.entry ? <>{c.entry.value}<span className="block truncate text-sm font-semibold text-accent">{name(c.entry.userId)}</span></> : "–"} />
        ))}
      </section>
      <section className="card">
        <h2 className="card-title">Ranking points over time</h2>
        <PointsChart data={pointsOverTime(rows)} labels={labels} />
      </section>
      <section className="card">
        <h2 className="card-title">Player statistics</h2>
        <LeaderboardTable entries={board} group={group} />
      </section>
    </div>
  );
}

export function TournamentDetail({ league, group, tournamentId, children }: { league: League; group: Group; tournamentId: string; children: React.ReactNode }) {
  void league;
  const t = group.tournaments.find((x) => x.id === tournamentId);
  if (!t) return <EmptyState title="Tournament not found" action={{ to: `/g/${group.id}/history`, label: "Back to history" }} />;
  const sorted = [...t.results].sort((a, b) => a.position - b.position);
  return (
    <div className="grid gap-6">
      <section className="card">
        <Link to={`/g/${group.id}/history`} className="text-sm text-muted hover:text-foreground">← All tournaments</Link>
        <h2 className="mt-2 text-xl font-bold">{t.title}</h2>
        <p className="text-sm text-muted">
          {formatDate(t.playedAt)} · {t.results.length} players
          {t.correctedAt && <> · corrected {formatDate(t.correctedAt)} ({t.correctionCount}×)</>}
        </p>
        <table className="table mt-4">
          <thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col" className="text-right">Points</th></tr></thead>
          <tbody className="tabular-nums">
            {sorted.map((r) => (
              <tr key={r.memberId}>
                <td className="font-bold text-accent">{ordinal(r.position)}</td>
                <td><PlayerName group={group} memberId={r.memberId} /></td>
                <td className="text-right font-bold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {children}
    </div>
  );
}
