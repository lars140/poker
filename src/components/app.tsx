"use client";

import { AuthPage } from "@/components/auth-page";
import { Brand } from "@/components/brand";
import { Avatar, EmptyState } from "@/components/ui";
import { Account } from "@/components/views/account";
import { Dashboard } from "@/components/views/dashboard";
import { CorrectResults, EnterResults, EventDetail, EventsList, NewEvent } from "@/components/views/events";
import { GroupShell, GroupsList, History, Leaderboard, Members, NewGroup, Statistics, TournamentDetail } from "@/components/views/group";
import { Link, segmentsOf, usePath } from "@/lib/router";
import { connect, logout, useSession, type SessionState } from "@/lib/session";

const NAV = [
  { to: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { to: "/groups", label: "Groups", match: (p: string) => p.startsWith("/groups") || p.startsWith("/g/") },
  { to: "/account", label: "Account", match: (p: string) => p.startsWith("/account") },
];

function Notice({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10 text-center">
      <div className="flex justify-center"><Brand /></div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted">{children}</p>
      {action}
    </main>
  );
}

export function App() {
  const session = useSession();

  if (session.status === "loading") return <Notice title="Loading…">Connecting to the server.</Notice>;
  if (session.status === "unreachable") {
    return <Notice title="Server unreachable" action={<div><button className="btn btn-primary" type="button" onClick={() => void connect()}>Try again</button></div>}>
      The server could not be reached. Check your connection and try again.
    </Notice>;
  }
  if (session.status === "anonymous") return <AuthPage />;
  return <Shell session={session} />;
}

function Shell({ session }: { session: SessionState }) {
  const clean = usePath().split("?")[0];
  const { me, league } = session;

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
          <div className="ml-auto flex items-center gap-3">
            {me && <span className="flex items-center gap-2 text-sm font-semibold"><Avatar name={me.username} /><span className="hidden sm:inline">{me.username}</span></span>}
            <button className="btn btn-sm" type="button" onClick={() => void logout()}>Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{route(segmentsOf(clean), league)}</main>
      <footer className="border-t border-line py-5 text-center text-xs text-muted">
        Felt only tracks results. There is no online poker, betting or payments.
      </footer>
    </>
  );
}

function route(segments: string[], league: SessionState["league"]) {
  const [first, a, b, c, d] = segments;
  if (!first) return <Dashboard league={league} />;
  if (first === "account") return <Account />;
  if (first === "groups") return a === "new" ? <NewGroup /> : <GroupsList league={league} />;

  if (first === "g" && a) {
    const group = league.groups.find((g) => g.id === a);
    if (!group) return <EmptyState title="Group not found" action={{ to: "/groups", label: "Your groups" }}>It may have been deleted, or you are not a member of it.</EmptyState>;
    let content: React.ReactNode;
    if (!b) content = <Leaderboard group={group} />;
    else if (b === "members") content = <Members group={group} />;
    else if (b === "stats") content = <Statistics group={group} />;
    else if (b === "history" && !c) content = <History group={group} />;
    else if (b === "history" && c) content = <TournamentDetail group={group} tournamentId={c}><CorrectResults group={group} tournamentId={c} /></TournamentDetail>;
    else if (b === "events" && !c) content = <EventsList group={group} />;
    else if (b === "events" && c === "new") content = <NewEvent group={group} />;
    else if (b === "events" && c && d === "results") content = <EnterResults group={group} eventId={c} />;
    else if (b === "events" && c) content = <EventDetail group={group} eventId={c} />;
    else content = <EmptyState title="Page not found" />;
    return <GroupShell group={group}>{content}</GroupShell>;
  }
  return <EmptyState title="Page not found" action={{ to: "/", label: "Go to dashboard" }} />;
}
