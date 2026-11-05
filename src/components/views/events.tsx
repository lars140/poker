"use client";

import { useState } from "react";
import { useIsAdmin } from "@/components/views/group";
import {
  Alert, EmptyState, Field, formatDateTime, fromLocalInput, PageHeader, PlayerName, StatusBadge, toLocalInput, useAction, useUserLabel,
} from "@/components/ui";
import { activeMembers, goingCount, isFull, type Group, type PokerEvent } from "@/lib/domain";
import { ordinal } from "@/lib/format";
import { Link, navigate } from "@/lib/router";
import { scorePlacements } from "@/lib/scoring";
import { act, useSession } from "@/lib/session";

export function EventsList({ group }: { group: Group }) {
  const isAdmin = useIsAdmin(group);
  const sorted = [...group.events].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const upcoming = sorted.filter((e) => e.status === "scheduled").reverse();
  const past = sorted.filter((e) => e.status !== "scheduled");
  const list = (events: PokerEvent[]) => (
    <ul className="grid gap-3">
      {events.map((event) => (
        <li key={event.id}>
          <Link to={`/g/${group.id}/events/${event.id}`} className="card block transition hover:border-accent/50">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-bold">{event.title}</h3>
                <p className="text-sm text-muted">{formatDateTime(event.startsAt)}{event.location && ` · ${event.location}`}</p>
              </div>
              <StatusBadge status={event.status} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {goingCount(event)}{event.maxParticipants ? ` / ${event.maxParticipants}` : ""} going{isFull(event) && " · full"}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-8">
      {isAdmin && <div><Link to={`/g/${group.id}/events/new`} className="btn btn-primary">Create event</Link></div>}
      <section>
        <h2 className="card-title">Upcoming</h2>
        {upcoming.length === 0 ? <EmptyState title="No upcoming events">{isAdmin ? "Create the next game night." : "An admin will invite you to the next one."}</EmptyState> : list(upcoming)}
      </section>
      {past.length > 0 && <section><h2 className="card-title">Past and cancelled</h2>{list(past)}</section>}
    </div>
  );
}

type EventFields = { title: string; description: string; location: string; startsAt: string; registrationDeadline: string; maxParticipants: string };

function EventForm({ event, submitLabel, onSubmit }: { event?: PokerEvent; submitLabel: string; onSubmit: (fields: EventFields) => Promise<string | void> }) {
  const { run, feedback, busy } = useAction();
  return (
    <form className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      const d = new FormData(e.currentTarget);
      const get = (name: string) => String(d.get(name) ?? "");
      void run(() => onSubmit({
        title: get("title"), description: get("description"), location: get("location"),
        startsAt: fromLocalInput(get("startsAt")), registrationDeadline: fromLocalInput(get("registrationDeadline")),
        maxParticipants: get("maxParticipants"),
      }));
    }}>
      <Field label="Title"><input name="title" className="input" required defaultValue={event?.title} placeholder="Friday night Hold'em" /></Field>
      <Field label="Description (optional)"><textarea name="description" className="input" rows={3} defaultValue={event?.description} /></Field>
      <Field label="Location (optional)"><input name="location" className="input" defaultValue={event?.location} placeholder="Anna's place" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date and start time"><input name="startsAt" type="datetime-local" className="input" required defaultValue={toLocalInput(event?.startsAt)} /></Field>
        <Field label="Registration deadline (optional)"><input name="registrationDeadline" type="datetime-local" className="input" defaultValue={toLocalInput(event?.registrationDeadline)} /></Field>
      </div>
      <Field label="Maximum players (optional)" hint="Confirmed attendance can never exceed this.">
        <input name="maxParticipants" type="number" min={2} max={50} className="input" defaultValue={event?.maxParticipants} />
      </Field>
      {feedback}
      <div><button className="btn btn-primary" type="submit" disabled={busy}>{submitLabel}</button></div>
    </form>
  );
}

export function NewEvent({ group }: { group: Group }) {
  if (!useIsAdmin(group)) return <p className="card text-sm text-muted">Only group admins can create events.</p>;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Create an event" subtitle={`A game night for ${group.name}. All current members are invited.`} />
      <div className="card">
        <EventForm submitLabel="Create event" onSubmit={async (event) => {
          const id = await act("createEvent", { groupId: group.id, event });
          navigate(`/g/${group.id}/events/${id}`);
        }} />
      </div>
    </div>
  );
}

export function EventDetail({ group, eventId }: { group: Group; eventId: string }) {
  const { me } = useSession();
  const isAdmin = useIsAdmin(group);
  const { run, feedback } = useAction();
  const event = group.events.find((e) => e.id === eventId);
  if (!event || !me) return <EmptyState title="Event not found" action={{ to: `/g/${group.id}/events`, label: "Back to events" }} />;

  const tournament = group.tournaments.find((t) => t.eventId === event.id);
  const open = event.status === "scheduled";
  const going = goingCount(event);
  const mine = event.invitations[me.id];
  const invited = Object.keys(event.invitations).map((id) => ({ id, response: event.invitations[id] }));
  const notInvited = activeMembers(group).filter((m) => !event.invitations[m.userId]);
  const deadlinePassed = event.registrationDeadline ? new Date(event.registrationDeadline) < new Date() : false;
  const respond = (response: string) => run(() => act("respondToEvent", { groupId: group.id, eventId: event.id, response }).then(() => "Response saved."));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-6">
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{event.title}</h2>
              <p className="mt-1 text-sm text-muted">{formatDateTime(event.startsAt)}{event.location && ` · ${event.location}`}</p>
            </div>
            <div className="flex gap-2">{isFull(event) && open && <span className="badge badge-warn">Full</span>}<StatusBadge status={event.status} /></div>
          </div>
          {event.description && <p className="mt-4 whitespace-pre-line text-sm">{event.description}</p>}
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="label">Confirmed</dt><dd className="font-semibold">{going}{event.maxParticipants ? ` / ${event.maxParticipants}` : ""}</dd></div>
            <div><dt className="label">Places left</dt><dd className="font-semibold">{event.maxParticipants === undefined ? "No limit" : Math.max(0, event.maxParticipants - going)}</dd></div>
            <div><dt className="label">Register by</dt><dd className="font-semibold">{event.registrationDeadline ? formatDateTime(event.registrationDeadline) : "–"}</dd></div>
          </dl>

          {open && mine && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-semibold">Your response: <StatusBadge status={mine} /></p>
              {deadlinePassed && <Alert kind="warn">The registration deadline has passed. You can only decline now.</Alert>}
              {!deadlinePassed && isFull(event) && mine !== "going" && <Alert kind="warn">This event is full. You can still answer maybe or decline.</Alert>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void respond("going")}>I&apos;m going</button>
                <button type="button" className="btn btn-sm" onClick={() => void respond("maybe")}>Maybe</button>
                <button type="button" className="btn btn-sm" onClick={() => void respond("declined")}>Can&apos;t make it</button>
              </div>
            </div>
          )}
          {open && !mine && <p className="mt-5 border-t border-line pt-4 text-sm text-muted">You have not been invited to this event.{isAdmin && " Invite yourself from the panel on the right."}</p>}
          {feedback && <div className="mt-3">{feedback}</div>}
        </section>

        <section className="card">
          <h2 className="card-title">Invitations and responses</h2>
          {invited.length === 0 ? <p className="text-sm text-muted">Nobody is invited yet.</p> : (
            <ul className="divide-y divide-line">
              {invited.map(({ id, response }) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <PlayerName group={group} userId={id} />
                  <StatusBadge status={response} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isAdmin && (
        <aside className="grid content-start gap-6">
          <section className="card">
            <h2 className="card-title">Results</h2>
            {tournament ? (
              <Link to={`/g/${group.id}/history/${tournament.id}`} className="btn btn-sm w-full">View finalized results</Link>
            ) : event.status === "cancelled" ? (
              <p className="text-sm text-muted">Cancelled events cannot have results.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">After the game, record the final standings to award points. Attendance alone never awards points.</p>
                <Link to={`/g/${group.id}/events/${event.id}/results`} className="btn btn-primary btn-sm w-full">Enter results</Link>
              </>
            )}
          </section>

          {open && (
            <>
              {notInvited.length > 0 && (
                <section className="card">
                  <h2 className="card-title">Invite members</h2>
                  <ul className="grid gap-2">
                    {notInvited.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                        <PlayerName userId={m.userId} />
                        <button className="btn btn-sm" type="button" onClick={() => void run(() => act("inviteToEvent", { groupId: group.id, eventId: event.id, userIds: [m.userId] }).then(() => "Member invited."))}>Invite</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="card">
                <h2 className="card-title">Edit event</h2>
                <EventForm event={event} submitLabel="Save changes" onSubmit={(fields) => act("updateEvent", { groupId: group.id, eventId: event.id, event: fields }).then(() => "Event updated.")} />
              </section>
              <section className="card border-danger/30">
                <h2 className="card-title">Cancel event</h2>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => {
                  if (window.confirm("Cancel this event?")) void run(() => act("cancelEvent", { groupId: group.id, eventId: event.id }).then(() => "Event cancelled."));
                }}>Cancel this event</button>
              </section>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

/** Arrange the finishing order, then review the calculated points before saving. */
function PlacementsForm({ group, initialOrder, submitLabel, onSave }: {
  group: Group;
  initialOrder: string[];
  submitLabel: string;
  onSave: (placements: { userId: string; position: number }[]) => Promise<void>;
}) {
  const label = useUserLabel();
  const [order, setOrder] = useState(initialOrder);
  const [step, setStep] = useState<"arrange" | "review">("arrange");
  const { run, feedback, busy } = useAction();
  const pool = activeMembers(group).filter((m) => !order.includes(m.userId));

  let scored: ReturnType<typeof scorePlacements> | null = null;
  let problem: string | null = null;
  try {
    scored = scorePlacements(order.map((userId, i) => ({ userId, position: i + 1 })));
  } catch (error) {
    problem = error instanceof Error ? error.message : "Invalid placements.";
  }
  const move = (index: number, delta: number) =>
    setOrder((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  if (step === "review") {
    return (
      <div className="grid gap-4">
        <h2 className="card-title">Please confirm</h2>
        <p className="text-sm text-muted">{scored?.length} players. These placements and points will be saved and counted in the leaderboard.</p>
        <table className="table">
          <thead><tr><th>Place</th><th>Player</th><th className="text-right">Points</th></tr></thead>
          <tbody className="tabular-nums">
            {scored?.map((r) => (
              <tr key={r.userId}><td className="font-bold text-accent">{ordinal(r.position)}</td><td className="font-semibold">{label(r.userId)}</td><td className="text-right font-bold">{r.points}</td></tr>
            ))}
          </tbody>
        </table>
        {feedback}
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setStep("arrange")}>Back</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => onSave(order.map((userId, i) => ({ userId, position: i + 1 }))))}>{busy ? "Saving…" : submitLabel}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section>
        <h2 className="card-title">Finishing order ({order.length}/7)</h2>
        {order.length === 0 ? <p className="text-sm text-muted">Add 4 to 7 players, starting with the winner.</p> : (
          <ol className="grid gap-2">
            {order.map((id, index) => (
              <li key={id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
                <span className="w-9 text-sm font-bold text-accent">{ordinal(index + 1)}</span>
                <span className="flex-1 font-semibold">{label(id)}</span>
                <button type="button" className="btn btn-sm" aria-label={`Move ${label(id)} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                <button type="button" className="btn btn-sm" aria-label={`Move ${label(id)} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button type="button" className="btn btn-sm btn-danger" aria-label={`Remove ${label(id)}`} onClick={() => setOrder(order.filter((x) => x !== id))}>✕</button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {pool.length > 0 && (
        <section>
          <h2 className="card-title">Members</h2>
          <div className="flex flex-wrap gap-2">
            {pool.map((m) => <button key={m.userId} type="button" className="btn btn-sm" disabled={order.length >= 7} onClick={() => setOrder([...order, m.userId])}>+ {label(m.userId)}</button>)}
          </div>
        </section>
      )}
      {problem && order.length > 0 && <Alert kind="warn">{problem}</Alert>}
      <div><button type="button" className="btn btn-primary" disabled={!scored} onClick={() => setStep("review")}>Review results</button></div>
    </div>
  );
}

export function EnterResults({ group, eventId }: { group: Group; eventId: string }) {
  const isAdmin = useIsAdmin(group);
  const event = group.events.find((e) => e.id === eventId);
  if (!isAdmin) return <p className="card text-sm text-muted">Only group admins can enter results.</p>;
  if (!event) return <EmptyState title="Event not found" />;
  const done = group.tournaments.find((t) => t.eventId === eventId);
  if (done) return <div className="card"><p className="text-sm">Results for this event were already finalized.</p><Link to={`/g/${group.id}/history/${done.id}`} className="btn btn-sm mt-3">View results</Link></div>;
  if (event.status === "cancelled") return <p className="card text-sm text-muted">Cancelled events cannot have results.</p>;

  const attendees = activeMembers(group).filter((m) => event.invitations[m.userId] === "going").slice(0, 7).map((m) => m.userId);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Enter results" subtitle={`${event.title}: arrange the players from winner to last place.`} />
      <div className="card">
        <PlacementsForm group={group} initialOrder={attendees} submitLabel="Finalize results" onSave={async (placements) => {
          const id = await act("finalizeTournament", { groupId: group.id, eventId: event.id, placements });
          navigate(`/g/${group.id}/history/${id}`);
        }} />
      </div>
      <p className="mt-3 text-xs text-muted">Pre-filled with confirmed players in no particular order. Finalized results can be corrected later.</p>
    </div>
  );
}

export function CorrectResults({ group, tournamentId }: { group: Group; tournamentId: string }) {
  const isAdmin = useIsAdmin(group);
  const t = group.tournaments.find((x) => x.id === tournamentId);
  if (!t || !isAdmin) return null;
  const initial = [...t.results].sort((a, b) => a.position - b.position).map((r) => r.memberId);
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-semibold">Correct results (admins only)</summary>
      <p className="my-3 text-sm text-muted">A correction replaces all placements and recalculates points. Rankings update automatically; nothing is counted twice.</p>
      <PlacementsForm key={t.correctionCount} group={group} initialOrder={initial} submitLabel="Save correction" onSave={async (placements) => {
        await act("correctTournament", { groupId: group.id, tournamentId: t.id, placements });
      }} />
    </details>
  );
}
