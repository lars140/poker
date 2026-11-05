# PrimePoker: Private Poker League

PrimePoker manages an in-person Texas Hold'em league: accounts, groups, game nights, attendance, tournament results, points and leaderboards. There is no virtual table, card simulation, chip management, betting, payments or real-money gambling.

## Architecture

Everything runs on **Cloudflare Pages** with one **D1** database:

- **Website:** a static Next.js export (`out/`) using hash routes.
- **API:** `functions/api/[[path]].ts` is a Pages Function that answers `/api/*` on the same address as the site (no CORS, no extra configuration).
- **Data:** all accounts, groups, events and results live as **one JSON document in one D1 row** (`src/server/d1-store.ts`), so they are available from every device. Every write checks the version it read, so simultaneous edits cannot overwrite each other; a conflicting request is simply run again. The table is created automatically on first use.
- **Shared rules:** `src/lib/domain.ts` is the single implementation of all business rules and permission checks. The browser only displays data; the function runs the rules for the authenticated user.

## Features

- Log in / create account. Passwords are stored only as salted PBKDF2 hashes; sessions use random tokens of which only a hash is stored; repeated failed logins lock the account for 10 minutes.
- Groups with members. Admins add existing accounts by username. Adding someone never makes them admin.
- Roles per group: an admin of one group is just a stranger in another. Admins edit the group, add/remove members, grant or remove admin rights, manage events and enter or correct results. A group always keeps at least one admin. Members can view everything in their groups, answer event invitations for themselves and leave.
- Private groups: users only receive the groups they belong to and the accounts of their group mates.
- Events with date, location, registration deadline and participant limit; Going / Maybe / Declined; the limit can never be exceeded.
- Results for 4 to 7 players with a confirmation screen, finalized once per event, correctable by admins without double counting. Attendance never awards points.
- Leaderboard, history with date filter, statistics and a points-over-time chart.

Scoring (one central function, `src/lib/scoring.ts`; points are stored per result when finalized):

| Players | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th |
| ------- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 10 | 6 | 3 | 1 | | | |
| 5 | 12 | 8 | 5 | 2 | 0 | | |
| 6 | 15 | 10 | 6 | 3 | 1 | 0 | |
| 7 | 18 | 12 | 8 | 4 | 2 | 1 | 0 |

## Known limits

- No email, so there is **no password reset or email verification**. A forgotten password cannot be recovered; the owner of the Cloudflare account would have to edit the stored document in D1.
- The whole league is one JSON value (D1 row limit: 2 MB). That is plenty for many hundreds of game nights; very large leagues would need a database.
- The session token is kept in the browser's `localStorage`.
- No in-app notifications or invitation links: admins add people by username.

## Deploy to Cloudflare Pages

Requires Node.js 20.9+ and a free Cloudflare account.

```powershell
npm ci
npx wrangler login
npx wrangler d1 create felt-db
```

The last command prints a `database_id`. Paste it into [wrangler.toml](wrangler.toml) (replacing `REPLACE_WITH_YOUR_DATABASE_ID`), then:

```powershell
npx wrangler pages project create felt-poker --production-branch=main   # once
npm run deploy
```

`npm run deploy` builds the website and uploads it together with the function. Wrangler prints the address (`https://felt-poker.pages.dev`). Open it, create an account and start your first group. A custom domain can be added in the Cloudflare dashboard (Workers & Pages → felt-poker → Custom domains).

The `DB` binding comes from `wrangler.toml`, so it does not have to be set in the dashboard.

### Automatic deploys

Either connect the repository in the Cloudflare dashboard (Workers & Pages → Create → Pages → Connect to Git) with build command `npm run build` and output directory `out`, or use the workflow in `.github/workflows/main.yml`, which runs the tests and deploys on every push to `main`. For the workflow add two repository secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: an API token with the permission *Cloudflare Pages: Edit*.
- `CLOUDFLARE_ACCOUNT_ID`: shown in the Cloudflare dashboard.

Use only one of the two, otherwise every push deploys twice.

## Local development

```powershell
npm run build && npm run pages:dev   # site + API on http://localhost:8788 with a local D1 database
```

For live reload while editing the website, copy `.dev.vars.example` to `.dev.vars`, keep `npm run pages:dev` running and start `npm run dev` (http://localhost:3000, talks to the API on port 8788).

## Checks

```powershell
npm test             # domain rules, permissions, scoring, validation, backend (login, sessions, lockout, admin rights)
npm run lint
npm run functions:check # type-check the Pages Function
npm run build
```

The backend tests run the real request handler with an in-memory store. A manual smoke test against `wrangler pages dev` (local D1) covered the website, assets, the 404 page, registration, duplicate usernames, wrong passwords and protected routes from a single address.
