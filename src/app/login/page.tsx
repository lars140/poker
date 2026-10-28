import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signIn, signUp, requestPasswordReset } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const mode = typeof params.mode === "string" ? params.mode : "login";
  if (!["login", "signup", "reset"].includes(mode)) redirect("/login");
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;

  return (
    <main className="auth-page">
      <Link className="brand auth-brand" href="/" aria-label="Felt home"><span className="brand-mark"><span>F</span></span><span className="brand-name">felt<span className="brand-period">.</span></span></Link>
      <section className="auth-panel">
        <div className="panel-kicker">YOUR LEAGUE, TOGETHER</div>
        <h1>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}</h1>
        <p className="auth-description">{mode === "signup" ? "Start a private league for your poker nights." : mode === "reset" ? "We’ll send a secure reset link to your email." : "Sign in to keep your league in good company."}</p>
        {error && <div className="auth-alert error-alert" role="alert">{error}</div>}
        {message && <div className="auth-alert success-alert" role="status">{message}</div>}
        {mode === "login" && <form action={signIn} className="auth-form"><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} /></label><button className="auth-submit">Sign in</button></form>}
        {mode === "signup" && <form action={signUp} className="auth-form"><label>Display name<input name="displayName" autoComplete="name" maxLength={80} /></label><label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" /></label><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label><button className="auth-submit">Create account</button></form>}
        {mode === "reset" && <form action={requestPasswordReset} className="auth-form"><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><button className="auth-submit">Send reset link</button></form>}
        <div className="auth-links">{mode === "login" ? <><Link href="/login?mode=reset">Forgot password?</Link><span>New to Felt? <Link href="/login?mode=signup">Create account</Link></span></> : <Link href="/login">Back to sign in</Link>}</div>
        <p className="auth-footnote">For in-person games and friendly competition. No virtual table or wagering.</p>
      </section>
    </main>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<main className="auth-page"><div className="auth-panel">Loading sign in…</div></main>}><LoginContent searchParams={searchParams} /></Suspense>;
}
