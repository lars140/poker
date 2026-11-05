"use client";

import { Field, PageHeader, useAction } from "@/components/ui";
import { act, logout, useSession } from "@/lib/session";

export function Account() {
  const { me, league } = useSession();
  const { run, feedback, busy } = useAction();
  if (!me) return null;

  const download = () => {
    const blob = new Blob([JSON.stringify({ me, league }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `felt-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="rise mx-auto grid max-w-xl gap-6">
      <PageHeader title="Your account" subtitle={`Signed in as @${me.username}`} />
      <section className="card">
        <h2 className="card-title">Profile</h2>
        <form className="grid gap-4" onSubmit={(e) => {
          e.preventDefault();
          const displayName = String(new FormData(e.currentTarget).get("displayName") ?? "");
          void run(() => act("updateProfile", { displayName }).then(() => "Saved."));
        }}>
          <Field label="Username" hint="Group admins add you by this name. It cannot be changed."><input className="input" value={me.username} readOnly /></Field>
          <Field label="Display name (optional)"><input name="displayName" className="input" defaultValue={me.displayName} /></Field>
          {feedback}
          <div><button className="btn btn-primary" type="submit" disabled={busy}>Save profile</button></div>
        </form>
      </section>
      <section className="card grid gap-3">
        <h2 className="card-title">Your data</h2>
        <p className="text-sm text-muted">Everything is stored on the server and shared with the members of your groups. Download a copy of what you can see.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" type="button" onClick={download}>Download my data (.json)</button>
          <button className="btn btn-danger" type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </section>
    </div>
  );
}
