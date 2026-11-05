"use client";

import { AuthPage } from "@/components/auth-page";
import { Brand } from "@/components/brand";
import { Avatar, EmptyState } from "@/components/ui";
import { Account } from "@/components/views/account";
import { Dashboard } from "@/components/views/dashboard";
import { CorrectResults, EnterResults, EventDetail, EventsList, NewEvent } from "@/components/views/events";
import { GroupShell, GroupsList, History, Leaderboard, Members, NewGroup, Statistics, TournamentDetail } from "@/components/views/group";
import { EventsOverview, StatisticsOverview, TournamentsOverview } from "@/components/views/overview";
import { Link, segmentsOf, usePath } from "@/lib/router";
import { CalendarDays, ChartColumn, House, LogOut, Settings, Trophy, Users } from "lucide-react";
import { connect, logout, useSession, type SessionState } from "@/lib/session";

const dashboard = (p: string) => p === "/";
const groups = (p: string) => p.startsWith("/groups") || p.startsWith("/g/");
const account = (p: string) => p.startsWith("/account");

const TOP_NAV = [
  { to: "/", label: "Dashboard", icon: House, match: dashboard },
  { to: "/groups", label: "Groups", icon: Users, match: groups },
  { to: "/account", label: "Account", icon: Settings, match: account },
];

const SIDE_NAV = [
  { to: "/", label: "Dashboard", icon: House, match: dashboard },
  { to: "/groups", label: "Groups", icon: Users, match: groups },
  { to: "/events", label: "Events", icon: CalendarDays, match: (p: string) => p.startsWith("/events") },
  { to: "/tournaments", label: "Tournaments", icon: Trophy, match: (p: string) => p.startsWith("/tournaments") },
  { to: "/statistics", label: "Statistics", icon: ChartColumn, match: (p: string) => p.startsWith("/statistics") },
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
      <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Brand href="#/" />
          <span aria-hidden className="hidden h-8 w-px bg-line md:block" />
          <nav aria-label="Main" className="hidden gap-1 md:flex">
            {TOP_NAV.map((item) => (
              <Link key={item.to} to={item.to} aria-current={item.match(clean) ? "page" : undefined} className="tab-link">
                <item.icon size={18} aria-hidden />{item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {me && (
              <Link to="/account" className="flex items-center gap-2 text-sm font-semibold" aria-label="Your account">
                <Avatar name={me.username} size={32} /><span className="hidden sm:inline">{me.username}</span>
              </Link>
            )}
            <button className="btn btn-sm" type="button" onClick={() => void logout()}><LogOut size={14} aria-hidden />Log out</button>
          </div>
        </div>
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 lg:hidden">
          {[...SIDE_NAV, TOP_NAV[2]].map((item) => (
            <Link key={item.to} to={item.to} aria-current={item.match(clean) ? "page" : undefined} className="tab-link whitespace-nowrap">
              <item.icon size={16} aria-hidden />{item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-[15.25rem] shrink-0 flex-col overflow-hidden border-r border-line bg-black/40 lg:flex">
          <nav aria-label="Sections" className="grid gap-1 p-2 pt-4">
            {SIDE_NAV.map((item) => (
              <Link key={item.to} to={item.to} aria-current={item.match(clean) ? "page" : undefined} className="side-link">
                <item.icon size={20} aria-hidden />{item.label}
              </Link>
            ))}
          </nav>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sidebar-art.webp" alt="" aria-hidden className="mt-auto w-full select-none" />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="w-full max-w-[1500px] flex-1 px-4 py-8 sm:px-8">{route(segmentsOf(clean), league)}</main>
          <footer className="border-t border-line py-5 text-center text-xs text-muted">
            PrimePoker only tracks results. There is no online poker, betting or payments.
          </footer>
        </div>
      </div>
    </>
  );
}

function route(segments: string[], league: SessionState["league"]) {
  const [first, a, b, c, d] = segments;
  if (!first) return <Dashboard league={league} />;
  if (first === "account") return <Account />;
  if (first === "events") return <EventsOverview league={league} />;
  if (first === "tournaments") return <TournamentsOverview league={league} />;
  if (first === "statistics") return <StatisticsOverview league={league} />;
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
