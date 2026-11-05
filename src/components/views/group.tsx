"use client";

import { useState } from "react";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { PointsChart } from "@/components/points-chart";
import {
  Alert, EmptyState, Field, formatDate, formatDateTime, PageHeader, PlayerName, Stat, StatusBadge, toLocalInput, useAction,
} from "@/components/ui";
import { activeMembers, isAdminOf, resultRows, type Group, type League } from "@/lib/domain";
import { ordinal } from "@/lib/format";
import { Link, navigate, usePath } from "@/lib/router";
import { act, useSession } from "@/lib/session";
import { computeLeaderboard, highlights, pointsOverTime } from "@/lib/stats";

const TABS = [
  { to: "", label: "Leaderboard" },
  { to: "/events", label: "Events" },
  { to: "/history", label: "History" },
  { to: "/stats", label: "Statistics" },
  { to: "/members", label: "Members" },
];

/** True when the signed-in user is an admin of this particular group. */
export function useIsAdmin(group: Group) {
  const { me } = useSession();
  return !!me && isAdminOf(group, me.id);
}

export function GroupShell({ group, children }: { group: Group; children: React.ReactNode }) {
  const path = usePath().split("?")[0];
  const isAdmin = useIsAdmin(group);
  const base = `/g/${group.id}`;
  return (
    <div className="rise">
      <PageHeader title={group.name} subtitle={group.description ?? "Private poker group"} actions={<StatusBadge status={isAdmin ? "admin" : "member"} />} />
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
  const { me } = useSession();
  return (
    <div className="rise">
      <PageHeader title="Groups" subtitle="Every group has its own members, events and leaderboard."
        actions={<Link to="/groups/new" className="btn btn-primary">Create group</Link>} />
      {league.groups.length === 0 ? (
        <EmptyState title="No groups yet" action={{ to: "/groups/new", label: "Create your first group" }}>
          Create a group, or ask a group admin to add your username ({me?.username}).
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {league.groups.map((g) => (
            <li key={g.id}>
              <Link to={`/g/${g.id}`} className="card block h-full transition hover:border-accent/50">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold">{g.name}</h2>
                  {me && isAdminOf(g, me.id) && <span className="badge badge-accent">Admin</span>}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{g.description ?? "No description"}</p>
                <p className="mt-3 text-xs text-muted">{activeMembers(g).length} members · {g.tournaments.length} tournaments</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewGroup() {
  const { run, feedback, busy } = useAction();
  return (
    <div className="rise mx-auto max-w-xl">
      <PageHeader title="Create a group" subtitle="You become its admin and can add other accounts afterwards." />
      <form className="card grid gap-4" onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void run(async () => {
          const id = await act("createGroup", { name: String(data.get("name") ?? ""), description: String(data.get("description") ?? "") });
          navigate(`/g/${id}/members`);
        });
      }}>
        <Field label="Group name"><input name="name" className="input" required placeholder="Friday Night Hold'em" /></Field>
        <Field label="Description (optional)"><textarea name="description" className="input" rows={3} /></Field>
        {feedback}
        <button className="btn btn-primary" type="submit" disabled={busy}>Create group</button>
      </form>
    </div>
  );
}

export function Leaderboard({ group }: { group: Group }) {
  const isAdmin = useIsAdmin(group);
  const board = computeLeaderboard(resultRows(group));
  const next = group.events.filter((e) => e.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 3);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="card">
        <h2 className="card-title">Leaderboard</h2>
        {board.length === 0 ? (
          <EmptyState title="No finalized tournaments yet">Points are awarded once an admin finalizes the results of a game night.</EmptyState>
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
        {isAdmin && <Link to={`/g/${group.id}/events/new`} className="btn btn-sm mt-4 w-full">Create event</Link>}
      </aside>
    </div>
  );
}

export function Members({ group }: { group: Group }) {
  const { me } = useSession();
  const isAdmin = useIsAdmin(group);
  const { run, feedback } = useAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = activeMembers(group);
  const former = group.members.filter((m) => m.archived);
  const adminCount = active.filter((m) => m.role === "admin").length;

  return (
    <div className="grid gap-6">
      <section className="card">
        <h2 className="card-title">Members ({active.length})</h2>
        <ul className="divide-y divide-line">
          {active.map((m) => {
            const isMe = m.userId === me?.id;
            const lastAdmin = m.role === "admin" && adminCount === 1;
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2"><PlayerName group={group} userId={m.userId} />{isMe && <span className="text-xs text-muted">(you)</span>}</span>
                <span className="flex flex-wrap gap-2">
                  {isAdmin && m.role === "member" && (
                    <button type="button" className="btn btn-sm" onClick={() => { if (window.confirm("Give this member admin rights in this group?")) void run(() => act("setRole", { groupId: group.id, userId: m.userId, role: "admin" }).then(() => "Admin rights granted.")); }}>Make admin</button>
                  )}
                  {isAdmin && m.role === "admin" && !lastAdmin && (
                    <button type="button" className="btn btn-sm" onClick={() => void run(() => act("setRole", { groupId: group.id, userId: m.userId, role: "member" }).then(() => "Admin rights removed."))}>Remove admin rights</button>
                  )}
                  {isAdmin && !isMe && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => { if (window.confirm("Remove this member? Their past results stay in the history.")) void run(() => act("removeMember", { groupId: group.id, userId: m.userId }).then(() => "Member removed.")); }}>Remove</button>
                  )}
                  {isMe && !lastAdmin && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => { if (window.confirm("Leave this group?")) void run(async () => { await act("removeMember", { groupId: group.id, userId: m.userId }); navigate("/groups"); }); }}>Leave group</button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {feedback && <div className="mt-3">{feedback}</div>}
        {former.length > 0 && (
          <div className="mt-4 text-xs text-muted">Former members, kept in the history: <span className="inline-flex flex-wrap gap-3 align-middle">{former.map((m) => <PlayerName key={m.userId} group={group} userId={m.userId} />)}</span></div>
        )}
      </section>

      {isAdmin && (
        <>
          <section className="card">
            <h2 className="card-title">Add an account</h2>
            <AddMember groupId={group.id} />
          </section>
          <section className="card">
            <h2 className="card-title">Group settings</h2>
            <GroupSettings group={group} />
            <div className="mt-6 border-t border-line pt-4">
              {confirmDelete ? (
                <div className="grid gap-2">
                  <Alert kind="warn">This permanently deletes the group with all events and results for everyone.</Alert>
                  <div className="flex gap-2">
                    <button className="btn btn-danger btn-sm" type="button" onClick={() => void run(async () => { await act("deleteGroup", { groupId: group.id }); navigate("/groups"); })}>Yes, delete group</button>
                    <button className="btn btn-sm" type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirmDelete(true)}>Delete group…</button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AddMember({ groupId }: { groupId: string }) {
  const { run, feedback, busy } = useAction();
  return (
    <form className="grid max-w-md gap-3" onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const username = String(new FormData(form).get("username") ?? "");
      void run(async () => { await act("addMember", { groupId, username }); form.reset(); return `${username.trim()} was added as a member.`; });
    }}>
      <Field label="Username" hint="The person must have created an account first. New members are plain members; you can give them admin rights afterwards.">
        <input name="username" className="input" required autoCapitalize="none" spellCheck={false} />
      </Field>
      {feedback}
      <div><button className="btn btn-primary" type="submit" disabled={busy}>Add to group</button></div>
    </form>
  );
}

function GroupSettings({ group }: { group: Group }) {
  const { run, feedback, busy } = useAction();
  return (
    <form className="grid max-w-xl gap-4" onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      void run(() => act("updateGroup", { groupId: group.id, name: String(data.get("name")), description: String(data.get("description")) }).then(() => "Saved."));
    }}>
      <Field label="Name"><input name="name" className="input" required defaultValue={group.name} /></Field>
      <Field label="Description"><textarea name="description" className="input" rows={3} defaultValue={group.description} /></Field>
      {feedback}
      <div><button className="btn btn-primary" type="submit" disabled={busy}>Save settings</button></div>
    </form>
  );
}

export function History({ group }: { group: Group }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = [...group.tournaments]
    .filter((t) => {
      const day = toLocalInput(t.playedAt).slice(0, 10); // the viewer's local calendar day
      return (!from || day >= from) && (!to || day <= to);
    })
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
                  {winner && <span className="text-sm"><span className="mr-2 text-xs uppercase tracking-wide text-muted">Winner</span><PlayerName group={group} userId={winner.memberId} /></span>}
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
  const { league } = useSession();
  const rows = resultRows(group);
  if (rows.length === 0) return <EmptyState title="No statistics yet">Statistics appear after the first tournament is finalized.</EmptyState>;
  const board = computeLeaderboard(rows);
  const top = highlights(board);
  const labels = new Map(league.users.map((u) => [u.id, u.displayName || u.username]));
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
          <Stat key={c.label} label={c.label} value={c.entry ? <>{c.entry.value}<span className="block truncate text-sm font-semibold text-accent">{labels.get(c.entry.userId) ?? "Unknown"}</span></> : "–"} />
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

export function TournamentDetail({ group, tournamentId, children }: { group: Group; tournamentId: string; children: React.ReactNode }) {
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
                <td><PlayerName group={group} userId={r.memberId} /></td>
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
