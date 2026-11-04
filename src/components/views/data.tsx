"use client";

import { useState } from "react";
import { Alert, Field, PageHeader } from "@/components/ui";
import { emptyLeague, type League } from "@/lib/domain";
import { commit, parseLeague } from "@/lib/storage";

export function DataPage({ league, saveError }: { league: League; saveError: string | null }) {
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(league, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `felt-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="rise mx-auto grid max-w-xl gap-6">
      <PageHeader title="Your data" subtitle="Everything is stored in this browser only. There is no account and no server." />
      {saveError && <Alert kind="warn">{saveError}</Alert>}
      <section className="card grid gap-3">
        <h2 className="card-title">Back up</h2>
        <p className="text-sm text-muted">Download your leagues as a file to keep them safe or to open them on another device.</p>
        <div><button className="btn btn-primary" type="button" onClick={exportBackup}>Download backup</button></div>
      </section>
      <section className="card grid gap-3">
        <h2 className="card-title">Restore</h2>
        <Field label="Backup file" hint="Replaces everything currently stored in this browser.">
          <input type="file" accept="application/json,.json" className="input" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const restored = parseLeague(await file.text());
              if (!window.confirm("Replace all data in this browser with this backup?")) return;
              commit(restored);
              setMessage({ kind: "success", text: `Restored ${restored.groups.length} group(s).` });
            } catch (error) {
              setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not read that file." });
            }
            e.target.value = "";
          }} />
        </Field>
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
      </section>
      <section className="card grid gap-3 border-danger/30">
        <h2 className="card-title">Erase</h2>
        <div><button className="btn btn-danger" type="button" onClick={() => {
          if (window.confirm("Erase every group, event and result from this browser?")) commit(emptyLeague());
        }}>Erase all data</button></div>
      </section>
    </div>
  );
}
