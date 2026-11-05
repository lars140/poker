"use client";

import { useState } from "react";
import { Brand } from "@/components/brand";
import { Field, useAction } from "@/components/ui";
import { login, register } from "@/lib/session";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { run, feedback, busy } = useAction();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-8 flex justify-center"><Brand /></div>
      <div className="card rise p-6">
        <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-background p-1">
          {(["login", "register"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={mode === tab}
              onClick={() => setMode(tab)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === tab ? "bg-accent-dim text-accent" : "text-muted hover:text-foreground"}`}
            >
              {tab === "login" ? "Log in" : "Create account"}
            </button>
          ))}
        </div>

        <h1 className="text-xl font-bold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mb-5 mt-1 text-sm text-muted">
          {mode === "login" ? "Log in to see your poker groups." : "You need an account to join groups and take part in game nights."}
        </p>

        <form
          key={mode}
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const get = (name: string) => String(data.get(name) ?? "");
            void run(() =>
              mode === "login"
                ? login(get("username"), get("password"))
                : register(get("username"), get("password"), get("displayName")),
            );
          }}
        >
          <Field label="Username" hint={mode === "register" ? "3-24 letters, numbers or underscores. Group admins add you by this name." : undefined}>
            <input name="username" className="input" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </Field>
          {mode === "register" && (
            <Field label="Display name (optional)">
              <input name="displayName" className="input" autoComplete="name" />
            </Field>
          )}
          <Field label="Password" hint={mode === "register" ? "At least 8 characters with a letter and a number." : undefined}>
            <input name="password" type="password" className="input" required autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>
          {feedback}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button type="button" className="text-accent hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Create one" : "Log in"}
          </button>
        </p>
      </div>
    </main>
  );
}
