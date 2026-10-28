import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CalendarDays, CirclePlus, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { createGroup } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function DashboardContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const supabase = await createClient();

  if (!supabase) {
    return <main className="auth-page"><section className="auth-panel"><div className="panel-kicker">SETUP REQUIRED</div><h1>Connect your league</h1><p className="auth-description">Add Supabase credentials and apply the database migration before group data can be loaded or saved.</p><Link className="panel-link" href="/">Return to preview</Link></section></main>;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: memberships, error: groupsError }] = await Promise.all([
    supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle(),
    supabase.from("group_members").select("role, poker_groups(id, name, description)").eq("user_id", user.id).is("archived_at", null),
  ]);
  const name = profile?.display_name || profile?.username || user.email?.split("@")[0] || "Player";
  const groups = (memberships ?? []).flatMap((membership) => {
    const group = membership.poker_groups as unknown as { id: string; name: string; description: string | null } | null;
    return group ? [{ ...group, role: membership.role }] : [];
  });

  return <main className="member-page"><header className="member-header"><Link className="brand" href="/"><span className="brand-mark"><span>F</span></span><span className="brand-name">felt<span className="brand-period">.</span></span></Link><div className="member-header-right"><span>{name}</span><form action={signOut}><button className="text-button">Sign out</button></form></div></header><div className="member-content"><div className="eyebrow"><span className="eyebrow-line" />PRIVATE LEAGUE</div><h1>Your groups<span className="heading-dot">.</span></h1><p className="welcome-copy">Choose a league to see its people, events, and tournament history.</p>
    {error && <div className="auth-alert error-alert" role="alert">{error}</div>}{groupsError && <div className="auth-alert error-alert" role="alert">Could not load groups. Check that the database migration has been applied.</div>}
    <section className="member-group-grid" aria-label="Your poker groups">{groups.map((group) => <Link className="member-group-card" href={`/groups/${group.id}`} key={group.id}><span className="group-card-mark"><UsersRound size={18} /></span><span className="group-card-copy"><strong>{group.name}</strong><small>{group.description || "Private poker group"}</small></span><span className="role-label">{group.role}</span></Link>)}</section>
    {groups.length === 0 && <div className="empty-state"><span className="empty-state-icon"><CalendarDays size={20} /></span><strong>Your first group starts here</strong><p>Create a private space for your friends, then schedule an in-person poker night.</p></div>}
    <section className="create-group-panel"><div><div className="panel-kicker">START A LEAGUE</div><h2>Create a group</h2><p>Only invited members can view a private group.</p></div><form action={createGroup} className="group-create-form"><label>Group name<input name="name" required minLength={2} maxLength={80} placeholder="e.g. Thursday Night Crew" /></label><label>Description <span>(optional)</span><textarea name="description" maxLength={500} rows={3} placeholder="A little about your group" /></label><button className="primary-button"><CirclePlus size={16} />Create group</button></form></section>
    </div></main>;
}

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<main className="auth-page"><div className="auth-panel">Loading your groups…</div></main>}><DashboardContent searchParams={searchParams} /></Suspense>;
}
