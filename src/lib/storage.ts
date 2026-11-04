"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { emptyLeague, type League } from "@/lib/domain";

const KEY = "felt:league:v1";

const leagueSchema = z.object({
  version: z.literal(1),
  groups: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string().optional(), createdAt: z.string(),
    members: z.array(z.object({ id: z.string(), name: z.string(), archived: z.boolean() })),
    events: z.array(z.object({
      id: z.string(), title: z.string(), description: z.string().optional(), location: z.string().optional(),
      startsAt: z.string(), registrationDeadline: z.string().optional(), maxParticipants: z.number().optional(),
      status: z.enum(["scheduled", "completed", "cancelled"]),
      invitations: z.record(z.string(), z.enum(["invited", "going", "maybe", "declined"])),
    })),
    tournaments: z.array(z.object({
      id: z.string(), eventId: z.string(), title: z.string(), playedAt: z.string(), finalizedAt: z.string(),
      correctedAt: z.string().optional(), correctionCount: z.number(),
      results: z.array(z.object({ memberId: z.string(), position: z.number(), points: z.number() })),
    })),
  })),
});

export function parseLeague(text: string): League {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const parsed = leagueSchema.safeParse(raw);
  if (!parsed.success) throw new Error("That file is not a Felt backup.");
  return parsed.data;
}

type Snapshot = { league: League; saveError: string | null };
const EMPTY: Snapshot = { league: emptyLeague(), saveError: null };
let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

function read(): Snapshot {
  try {
    const text = localStorage.getItem(KEY);
    return { league: text ? parseLeague(text) : emptyLeague(), saveError: null };
  } catch {
    return { league: emptyLeague(), saveError: "Your saved data could not be read, so you are starting empty." };
  }
}

function getSnapshot() {
  return (snapshot ??= read());
}

/** Replaces the league and persists it. If the browser refuses to store it, the UI says so. */
export function commit(league: League) {
  let saveError: string | null = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(league));
  } catch {
    saveError = "Your browser blocked saving, so changes will be lost when you close this tab. Export a backup from the Data page.";
  }
  snapshot = { league, saveError };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      snapshot = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** `ready` is false during server rendering/hydration, when browser data is not yet available. */
export function useLeague() {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  return { ...current, ready };
}
