"use client";

import { useState } from "react";
import type { Group } from "@/lib/domain";
import { Link } from "@/lib/router";

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

/** `<input type="datetime-local">` value (browser time zone) <-> absolute ISO timestamp. */
export const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : "");

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
      className="grid shrink-0 place-items-center rounded-full border border-accent/30 bg-accent-dim font-bold uppercase text-accent"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function PlayerName({ group, memberId }: { group: Group; memberId: string }) {
  const member = group.members.find((m) => m.id === memberId);
  const name = member?.name ?? "Unknown";
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} size={24} />
      <span className="font-semibold">{name}</span>
      {member?.archived && <span className="badge">former</span>}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: { to: string; label: string } }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <Link to={action.to} className="btn btn-primary btn-sm mt-4">{action.label}</Link>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "badge badge-accent", completed: "badge", cancelled: "badge badge-danger",
  going: "badge badge-accent", maybe: "badge badge-warn", declined: "badge badge-danger", invited: "badge",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={STATUS_STYLE[status] ?? "badge"}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "warn"; children: React.ReactNode }) {
  const style = {
    error: "border-danger/40 bg-danger/10 text-danger",
    success: "border-accent/40 bg-accent-dim text-accent",
    warn: "border-warn/40 bg-warn/10 text-warn",
  }[kind];
  return <p role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${style}`}>{children}</p>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Runs an action that may throw a user-facing Error, and shows its message. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => string | void) => {
    try {
      setMessage(fn() ?? null);
      setError(null);
    } catch (e) {
      setMessage(null);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };
  const feedback = error ? <Alert>{error}</Alert> : message ? <Alert kind="success">{message}</Alert> : null;
  return { run, feedback };
}
