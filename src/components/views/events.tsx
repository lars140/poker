"use client";

import { useState } from "react";
import {
  Alert, EmptyState, Field, formatDateTime, fromLocalInput, PageHeader, PlayerName, StatusBadge, toLocalInput, useAction,
} from "@/components/ui";
import {
  activeMembers, cancelEvent, correctTournament, createEvent, finalizeTournament, goingCount, inviteToEvent, isFull,
  memberName, respondToEvent, updateEvent, type Group, type League, type PokerEvent,
} from "@/lib/domain";
import { ordinal } from "@/lib/format";
import { Link, navigate } from "@/lib/router";
import { scorePlacements } from "@/lib/scoring";
import { commit } from "@/lib/storage";

export function EventsList({ group }: { group: Group }) {
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
      <div><Link to={`/g/${group.id}/events/new`} className="btn btn-primary">Create event</Link></div>
      <section>
        <h2 className="card-title">Upcoming</h2>
        {upcoming.length === 0 ? <EmptyState title="No upcoming events">Create the next game night.</EmptyState> : list(upcoming)}
      </section>
      {past.length > 0 && <section><h2 className="card-title">Past and cancelled</h2>{list(past)}</section>}
    </div>
  );
}

function EventForm({ event, submitLabel, onSubmit }: { event?: PokerEvent; submitLabel: string; onSubmit: (input: Parameters<typeof createEvent>[2]) => string | void }) {
  const { run, feedback } = useAction();
  return (
    <form className="grid gap-4" onSubmit={(e) => {
      e.preventDefault();
      const d = new FormData(e.currentTarget);
      const get = (name: string) => String(d.get(name) ?? "");
      run(() => onSubmit({
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
      <div><button className="btn btn-primary" type="submit">{submitLabel}</button></div>
    </form>
  );
}

export function NewEvent({ league, group }: { league: League; group: Group }) {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Create an event" subtitle={`A game night for ${group.name}. All current players are invited.`} />
      <div className="card">
        <EventForm submitLabel="Create event" onSubmit={(input) => {
          const created = createEvent(league, group.id, input);
          commit(created.league);
          navigate(`/g/${group.id}/events/${created.id}`);
        }} />
      </div>
    </div>
  );
}

export function EventDetail({ league, group, eventId }: { league: League; group: Group; eventId: string }) {
  const event = group.events.find((e) => e.id === eventId);
  const { run, feedback } = useAction();
  if (!event) return <EmptyState title="Event not found" action={{ to: `/g/${group.id}/events`, label: "Back to events" }} />;

  const tournament = group.tournaments.find((t) => t.eventId === event.id);
  const open = event.status === "scheduled";
  const going = goingCount(event);
  const invited = Object.keys(event.invitations).map((id) => ({ id, response: event.invitations[id] }));
  const notInvited = activeMembers(group).filter((m) => !event.invitations[m.id]);
  const deadlinePassed = event.registrationDeadline ? new Date(event.registrationDeadline) < new Date() : false;

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
          {open && deadlinePassed && <div className="mt-4"><Alert kind="warn">The registration deadline has passed. Players can only decline now.</Alert></div>}
        </section>

        <section className="card">
          <h2 className="card-title">Invitations and responses</h2>
          {invited.length === 0 ? <p className="text-sm text-muted">Nobody is invited. Add players to the group first.</p> : (
            <ul className="divide-y divide-line">
              {invited.map(({ id, response }) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-3"><PlayerName group={group} memberId={id} /><StatusBadge status={response} /></span>
                  {open && (
                    <span className="flex gap-1.5">
                      {(["going", "maybe", "declined"] as const).map((answer) => (
                        <button key={answer} type="button" className={`btn btn-sm ${response === answer ? "btn-primary" : ""}`}
                          onClick={() => run(() => commit(respondToEvent(league, group.id, event.id, id, answer)))}>
                          {answer === "going" ? "Going" : answer === "maybe" ? "Maybe" : "Declined"}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {feedback && <div className="mt-3">{feedback}</div>}
        </section>
      </div>

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
                <h2 className="card-title">Invite players</h2>
                <ul className="grid gap-2">
                  {notInvited.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                      {m.name}
                      <button className="btn btn-sm" type="button" onClick={() => run(() => commit(inviteToEvent(league, group.id, event.id, [m.id])))}>Invite</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="card">
              <h2 className="card-title">Edit event</h2>
              <EventForm event={event} submitLabel="Save changes" onSubmit={(input) => { commit(updateEvent(league, group.id, event.id, input)); return "Event updated."; }} />
            </section>
            <section className="card border-danger/30">
              <h2 className="card-title">Cancel event</h2>
              <button className="btn btn-danger btn-sm" type="button" onClick={() => {
                if (window.confirm("Cancel this event?")) run(() => commit(cancelEvent(league, group.id, event.id)));
              }}>Cancel this event</button>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

/** Arrange the finishing order, then review the calculated points before saving. */
export function PlacementsForm({ group, initialOrder, submitLabel, onSave }: {
  group: Group;
  initialOrder: string[];
  submitLabel: string;
  onSave: (placements: { userId: string; position: number }[]) => void;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [step, setStep] = useState<"arrange" | "review">("arrange");
  const { run, feedback } = useAction();
  const pool = activeMembers(group).filter((m) => !order.includes(m.id));

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
              <tr key={r.userId}><td className="font-bold text-accent">{ordinal(r.position)}</td><td className="font-semibold">{memberName(group, r.userId)}</td><td className="text-right font-bold">{r.points}</td></tr>
            ))}
          </tbody>
        </table>
        {feedback}
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setStep("arrange")}>Back</button>
          <button type="button" className="btn btn-primary" onClick={() => run(() => onSave(order.map((userId, i) => ({ userId, position: i + 1 }))))}>{submitLabel}</button>
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
                <span className="flex-1 font-semibold">{memberName(group, id)}</span>
                <button type="button" className="btn btn-sm" aria-label={`Move ${memberName(group, id)} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                <button type="button" className="btn btn-sm" aria-label={`Move ${memberName(group, id)} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button type="button" className="btn btn-sm btn-danger" aria-label={`Remove ${memberName(group, id)}`} onClick={() => setOrder(order.filter((x) => x !== id))}>✕</button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {pool.length > 0 && (
        <section>
          <h2 className="card-title">Players</h2>
          <div className="flex flex-wrap gap-2">
            {pool.map((m) => <button key={m.id} type="button" className="btn btn-sm" disabled={order.length >= 7} onClick={() => setOrder([...order, m.id])}>+ {m.name}</button>)}
          </div>
        </section>
      )}
      {problem && order.length > 0 && <Alert kind="warn">{problem}</Alert>}
      <div><button type="button" className="btn btn-primary" disabled={!scored} onClick={() => setStep("review")}>Review results</button></div>
    </div>
  );
}

export function EnterResults({ league, group, eventId }: { league: League; group: Group; eventId: string }) {
  const event = group.events.find((e) => e.id === eventId);
  if (!event) return <EmptyState title="Event not found" />;
  const done = group.tournaments.find((t) => t.eventId === eventId);
  if (done) return <div className="card"><p className="text-sm">Results for this event were already finalized.</p><Link to={`/g/${group.id}/history/${done.id}`} className="btn btn-sm mt-3">View results</Link></div>;
  if (event.status === "cancelled") return <p className="card text-sm text-muted">Cancelled events cannot have results.</p>;

  const attendees = activeMembers(group).filter((m) => event.invitations[m.id] === "going").slice(0, 7).map((m) => m.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Enter results" subtitle={`${event.title}: arrange the players from winner to last place.`} />
      <div className="card">
        <PlacementsForm group={group} initialOrder={attendees} submitLabel="Finalize results" onSave={(placements) => {
          const created = finalizeTournament(league, group.id, event.id, placements);
          commit(created.league);
          navigate(`/g/${group.id}/history/${created.id}`);
        }} />
      </div>
      <p className="mt-3 text-xs text-muted">Pre-filled with confirmed players in no particular order. Finalized results can be corrected later.</p>
    </div>
  );
}

export function CorrectResults({ league, group, tournamentId }: { league: League; group: Group; tournamentId: string }) {
  const t = group.tournaments.find((x) => x.id === tournamentId);
  if (!t) return null;
  const initial = [...t.results].sort((a, b) => a.position - b.position).map((r) => r.memberId);
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-semibold">Correct results</summary>
      <p className="my-3 text-sm text-muted">A correction replaces all placements and recalculates points. Rankings update automatically; nothing is counted twice.</p>
      <PlacementsForm group={group} initialOrder={initial} submitLabel="Save correction" onSave={(placements) => {
        commit(correctTournament(league, group.id, t.id, placements));
        navigate(`/g/${group.id}/history/${t.id}`);
      }} />
    </details>
  );
}
