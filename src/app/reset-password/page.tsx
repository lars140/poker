"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8 || password.length > 128) {
      setMessage("Use a password between 8 and 128 characters.");
      setBusy(false);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase configuration is required before accounts can be used.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? error.message : "Password updated. You can now sign in.");
    setBusy(false);
  }

  return <main className="auth-page"><Link className="brand auth-brand" href="/" aria-label="Felt home"><span className="brand-mark"><span>F</span></span><span className="brand-name">felt<span className="brand-period">.</span></span></Link><section className="auth-panel"><div className="panel-kicker">ACCOUNT SECURITY</div><h1>Choose a new password</h1><p className="auth-description">Use at least 8 characters. Your password is managed securely by Supabase Auth.</p><form onSubmit={updatePassword} className="auth-form"><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label><button className="auth-submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form>{message && <div className="auth-alert" role="status">{message}</div>}<div className="auth-links"><Link href="/login">Back to sign in</Link></div></section></main>;
}
