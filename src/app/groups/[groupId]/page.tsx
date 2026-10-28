import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, CalendarDays, ShieldCheck, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

async function GroupContent({ params }: { params: Promise<{ groupId: string }> }) {
  await connection();
  const { groupId } = await params;
  const supabase = await createClient();
  if (!supabase) return <main className="auth-page"><section className="auth-panel"><h1>Setup required</h1><p className="auth-description">Connect Supabase to open private group data.</p><Link href="/">Return to preview</Link></section></main>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: group, error: groupError }, { data: memberships }] = await Promise.all([
    supabase.from("poker_groups").select("id, name, description, created_at").eq("id", groupId).maybeSingle(),
    supabase.from("group_members").select("role, joined_at, profiles(username, display_name, avatar_url)").eq("group_id", groupId).is("archived_at", null).order("joined_at", { ascending: true }),
  ]);
  if (groupError || !group) notFound();

  return <main className="member-page"><header className="member-header"><Link className="brand" href="/dashboard"><span className="brand-mark"><span>F</span></span><span className="brand-name">felt<span className="brand-period">.</span></span></Link><div className="member-header-right"><Link className="text-button" href="/dashboard">My groups</Link><form action={signOut}><button className="text-button">Sign out</button></form></div></header><div className="member-content"><Link className="back-link" href="/dashboard"><ArrowLeft size={14} />All groups</Link><div className="group-hero"><div className="group-hero-icon"><UsersRound size={22} /></div><div><div className="eyebrow"><span className="eyebrow-line" />PRIVATE POKER GROUP</div><h1>{group.name}<span className="heading-dot">.</span></h1><p>{group.description || "A private group for friends around the table."}</p></div></div>
  <div className="group-overview-grid"><section className="member-section"><div className="panel-heading"><div><div className="panel-kicker">THE GROUP</div><h2>Members <span className="heading-count">{memberships?.length ?? 0}</span></h2></div><ShieldCheck size={18} className="group-secure-icon" /></div><div className="member-list">{(memberships ?? []).map((membership, index) => { const profile = membership.profiles as unknown as { username: string; display_name: string | null; avatar_url: string | null } | null; const username = profile?.username ?? "Player"; const displayName = profile?.display_name || username; const initials = displayName.split(/\s+/).map((part: string) => part[0]).slice(0, 2).join("").toUpperCase(); return <div className="member-list-row" key={`${username}-${index}`}><span className={`player-avatar member-avatar-tone tone-${index % 3}`}>{initials}</span><span className="member-list-copy"><strong>{displayName}</strong><small>@{username}</small></span><span className={`role-label ${membership.role === "admin" ? "admin-role" : ""}`}>{membership.role}</span></div>; })}</div></section><section className="member-section upcoming-placeholder"><div className="panel-kicker">NEXT UP</div><CalendarDays size={22} /><h2>Events will show here</h2><p>Group events are managed by admins and shared with members in this private space.</p></section></div>
  </div></main>;
}

export default function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  return <Suspense fallback={<main className="auth-page"><div className="auth-panel">Loading private group…</div></main>}><GroupContent params={params} /></Suspense>;
}
