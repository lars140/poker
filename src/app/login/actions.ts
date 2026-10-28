"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

const signUpSchema = credentialsSchema.extend({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/),
  displayName: z.string().trim().max(80).default(""),
});

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=Check%20your%20email%20and%20password");
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=Supabase%20configuration%20is%20required");
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?mode=signup&error=Please%20check%20your%20details");
  const supabase = await createClient();
  if (!supabase) redirect("/login?mode=signup&error=Supabase%20configuration%20is%20required");
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { username: parsed.data.username, display_name: parsed.data.displayName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/dashboard`,
    },
  });
  if (error) redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
  redirect("/login?message=Check%20your%20email%20to%20verify%20your%20account");
}

export async function requestPasswordReset(formData: FormData) {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) redirect("/login?mode=reset&error=Enter%20a%20valid%20email");
  const supabase = await createClient();
  if (!supabase) redirect("/login?mode=reset&error=Supabase%20configuration%20is%20required");
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/reset-password`,
  });
  if (error) redirect(`/login?mode=reset&error=${encodeURIComponent(error.message)}`);
  redirect("/login?message=Password%20reset%20instructions%20sent");
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
