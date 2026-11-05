"use client";

import { useSyncExternalStore } from "react";
import { API_URL } from "@/lib/config";
import { emptyLeague, type League, type User } from "@/lib/domain";

// Client-side session: the signed-in user plus the slice of the league the server lets them see.
// The server is the source of truth; this module only caches its answers.

export type SessionState = {
  status: "loading" | "anonymous" | "authenticated" | "unreachable";
  me: User | null;
  league: League;
};

const TOKEN_KEY = "felt:token";
const POLL_MS = 30_000;
const LOADING: SessionState = { status: "loading", me: null, league: emptyLeague() };

let state: SessionState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session simply will not survive a reload */
  }
};
let memoryToken: string | null = null; // fallback when localStorage is unavailable
const currentToken = () => readToken() ?? memoryToken;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type SessionResponse = { token: string; me: User; league: League; id?: string };

async function request(method: string, path: string, body?: unknown): Promise<SessionResponse> {
  const token = currentToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? "Something went wrong.");
  return data as SessionResponse;
}

function adopt(data: SessionResponse) {
  memoryToken = data.token;
  writeToken(data.token);
  setState({ status: "authenticated", me: data.me, league: data.league });
}

function signedOut() {
  memoryToken = null;
  writeToken(null);
  setState({ status: "anonymous", me: null, league: emptyLeague() });
}

/** First load with a stored token: show the app, a login page, or a retry screen. */
export async function connect() {
  setState(LOADING);
  try {
    adopt(await request("GET", "/api/state"));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) signedOut();
    else setState({ status: "unreachable", me: null, league: emptyLeague() });
  }
}

export async function refresh() {
  if (!currentToken()) return;
  try {
    adopt(await request("GET", "/api/state"));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) signedOut();
    // Network errors keep showing the last known data.
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (currentToken()) void connect();
  else signedOut();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void refresh());
  setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
}

export async function login(username: string, password: string) {
  adopt(await request("POST", "/api/login", { username, password }));
}

export async function register(username: string, password: string, displayName: string) {
  adopt(await request("POST", "/api/register", { username, password, displayName }));
}

export async function logout() {
  try {
    await request("POST", "/api/logout");
  } catch {
    /* the local session is dropped either way */
  }
  signedOut();
}

/** Runs a server action (permissions are checked there) and returns the id of anything it created. */
export async function act(type: string, args: Record<string, unknown>) {
  try {
    const data = await request("POST", "/api/action", { type, args });
    adopt(data);
    return data.id;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) signedOut();
    throw error;
  }
}

export function useSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      start();
      return () => listeners.delete(listener);
    },
    () => state,
    () => LOADING,
  );
}
