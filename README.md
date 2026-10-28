# Felt: Private Poker League

A responsive league-management foundation for private, in-person Texas Hold'em groups. It tracks accounts, groups, invitations, events, attendance, standings, notifications, and tournament results. It does not implement a virtual table, card simulation, chip management, betting, payments, or real-money gambling.

## Requirements

- Node.js 20.9 or later and npm
- A Supabase project
- Supabase CLI for applying migrations locally or remotely

## Install and run

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Without Supabase environment variables, the home dashboard displays clearly marked preview data and account actions explain that configuration is required. Preview values are not persisted.

## Environment

Set these values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key; safe for browser use when RLS is enabled |
| `NEXT_PUBLIC_SITE_URL` | Canonical app origin used in verification and password-reset links |

Never put a Supabase service-role key in a `NEXT_PUBLIC_*` variable or browser bundle. No service-role key is needed by the current app foundation.

## Supabase setup

1. Create a Supabase project and configure its Auth email provider and email templates.
2. Add `http://localhost:3000/auth/callback` and your deployed `/auth/callback` URL to Supabase Auth's allowed redirect URLs.
3. Set the environment variables above.
4. Link the Supabase CLI to your project, then apply the migration:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The initial migration is `supabase/migrations/202610260001_initial_schema.sql`. It creates profile, group, invitation, event, attendance, tournament, result, and notification tables; RLS policies; and permission-checked transactional RPCs. Tournament results are scored at finalization and retain their awarded points. Event attendance does not create results.

For local Supabase development, use `npx supabase start`, then `npx supabase db reset` to apply migrations to the local database. Configure local Auth email behavior using the Supabase CLI's local development output.

## Authentication foundation

The `/login` page supports sign-up, password sign-in, and reset-link requests. Sign-up includes email verification through `/auth/callback`; `/reset-password` changes the password using the verified Supabase session. Middleware protects future `/dashboard` and `/groups` routes once Supabase is configured. Passwords are handled only by Supabase Auth.

## Test and build

```powershell
npm test
npm run lint
npm run build
```

The current automated suite covers scoring tables for four through seven participants, invalid placements, duplicate entrants, and stored point values. Database integration, RLS, auth email delivery, invitations, event concurrency, correction flows, and leaderboard queries require a configured Supabase instance and are not claimed as tested by the local unit suite.

## Current implementation status

- Complete foundation: Next.js/TypeScript/Tailwind app shell, responsive preview dashboard, auth forms/actions, Supabase SSR/browser clients, scoring module/tests, and initial relational schema/RLS/RPC migration.
- The dashboard currently uses illustrative preview content. Group/event/result management screens and their UI actions, profile editing/avatar upload, and end-to-end database tests remain to be implemented and connected before this is a complete production league manager.
- The migration has not been applied or integration-tested because this workspace has no configured Supabase project or local Supabase/Postgres CLI.

## Deploy

Deploy the Next.js app to a Node-compatible host such as Vercel. Configure the three environment values for the deployed origin, allow that origin's `/auth/callback` in Supabase Auth, apply migrations before enabling users, and verify RLS behavior with separate member/admin test accounts. Keep the project private by relying on authenticated Supabase queries and RLS policies, not by hiding links in the UI.
