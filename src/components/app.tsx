"use client";

import { Brand } from "@/components/brand";
import { Alert, EmptyState } from "@/components/ui";
import { Dashboard } from "@/components/views/dashboard";
import { DataPage } from "@/components/views/data";
import { CorrectResults, EnterResults, EventDetail, EventsList, NewEvent } from "@/components/views/events";
import { GroupShell, GroupsList, History, Leaderboard, NewGroup, Players, Statistics, TournamentDetail } from "@/components/views/group";
import { Link, segmentsOf, usePath } from "@/lib/router";
import { useLeague } from "@/lib/storage";

const NAV = [
  { to: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { to: "/groups", label: "Groups", match: (p: string) => p.startsWith("/groups") || p.startsWith("/g/") },
  { to: "/data", label: "Data", match: (p: string) => p.startsWith("/data") },
];

export function App() {
  const { league, ready, saveError } = useLeague();
  const path = usePath();
  const clean = path.split("?")[0];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Brand href="#/" />
          <nav aria-label="Main" className="flex gap-1">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} aria-current={item.match(clean) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${item.match(clean) ? "bg-accent-dim text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {!ready ? <p className="text-sm text-muted">Loading…</p> : (
          <>
            {saveError && clean !== "/data" && <div className="mb-4"><Alert kind="warn">{saveError}</Alert></div>}
            {route(segmentsOf(clean), league, saveError)}
          </>
        )}
      </main>
      <footer className="border-t border-line py-5 text-center text-xs text-muted">
        Felt only tracks results. There is no online poker, betting or payments. Data stays in this browser.
      </footer>
    </>
  );
}

function route(segments: string[], league: ReturnType<typeof useLeague>["league"], saveError: string | null) {
  const [first, a, b, c, d] = segments;
  if (!first) return <Dashboard league={league} />;
  if (first === "data") return <DataPage league={league} saveError={saveError} />;
  if (first === "groups") return a === "new" ? <NewGroup league={league} /> : <GroupsList league={league} />;

  if (first === "g" && a) {
    const group = league.groups.find((g) => g.id === a);
    if (!group) return <EmptyState title="Group not found" action={{ to: "/groups", label: "Your groups" }}>It may have been deleted or lives in another browser.</EmptyState>;
    let content: React.ReactNode;
    if (!b) content = <Leaderboard group={group} />;
    else if (b === "members") content = <Players league={league} group={group} />;
    else if (b === "stats") content = <Statistics group={group} />;
    else if (b === "history" && !c) content = <History group={group} />;
    else if (b === "history" && c) content = <TournamentDetail league={league} group={group} tournamentId={c}><CorrectResults league={league} group={group} tournamentId={c} /></TournamentDetail>;
    else if (b === "events" && !c) content = <EventsList group={group} />;
    else if (b === "events" && c === "new") content = <NewEvent league={league} group={group} />;
    else if (b === "events" && c && d === "results") content = <EnterResults league={league} group={group} eventId={c} />;
    else if (b === "events" && c) content = <EventDetail league={league} group={group} eventId={c} />;
    else content = <EmptyState title="Page not found" />;
    return <GroupShell group={group}>{content}</GroupShell>;
  }
  return <EmptyState title="Page not found" action={{ to: "/", label: "Go to dashboard" }} />;
}
