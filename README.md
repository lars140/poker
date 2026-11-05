# Felt: Private Poker League

Felt manages an in-person Texas Hold'em league: accounts, groups, game nights, attendance, tournament results, points and leaderboards. There is no virtual table, card simulation, chip management, betting, payments or real-money gambling.

## Architecture

Everything runs on Cloudflare as **one Worker** (`worker/`):

- **Website:** a static Next.js export (`out/`) served by the Worker as static assets, using hash routes.
- **API:** `/api/*` is handled by the same Worker, so the site and the API share one address (no CORS, no extra configuration).
- **Data:** all accounts, groups, events and results live in **one JSON document** in a Durable Object, so they are available from every device. The Durable Object handles one request at a time, so simultaneous edits cannot overwrite each other.
- **Shared rules:** `src/lib/domain.ts` is the single implementation of all business rules and permission checks. The browser only displays data; the Worker runs the rules for the authenticated user.

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

- No email, so there is **no password reset or email verification**. A forgotten password cannot be recovered; the owner of the Cloudflare account would have to edit the stored document.
- The whole league is one JSON value (Durable Object storage limit: 2 MB). That is plenty for many hundreds of game nights; very large leagues would need a database.
- The session token is kept in the browser's `localStorage`.
- No in-app notifications or invitation links: admins add people by username.

## Deploy to Cloudflare

Requires Node.js 20.9+ and a free Cloudflare account.

```powershell
npm ci
npx wrangler login
npm run deploy
```

`npm run deploy` builds the website and uploads it together with the Worker. Wrangler prints the address (`https://felt-poker.<your-subdomain>.workers.dev`). Open it, create an account and start your first group. A custom domain can be added in the Cloudflare dashboard (Worker → Settings → Domains & Routes).

If `npm ci` warns that scripts are blocked (`workerd`), run `npm approve-scripts` once so Wrangler can run locally.

### Automatic deploys from GitHub (optional)

The workflow in `.github/workflows/main.yml` runs the tests and deploys on every push to `main`. Add two repository secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: an API token created from the "Edit Cloudflare Workers" template.
- `CLOUDFLARE_ACCOUNT_ID`: shown in the Cloudflare dashboard.

Alternatively, connect the repository in the Cloudflare dashboard (Workers & Pages → Create → Import a repository) with build command `npm ci && npm run build` and deploy command `npx wrangler deploy -c worker/wrangler.toml`.

## Local development

```powershell
npm run worker:dev   # backend on http://localhost:8787 with local storage
npm run dev          # website on http://localhost:3000 (talks to the Worker above)
```

To try the production setup locally, run `npm run build`, then `npm run worker:dev`, and open http://localhost:8787.

## Checks

```powershell
npm test             # domain rules, permissions, scoring, validation, backend (login, sessions, lockout, admin rights)
npm run lint
npm run worker:check # type-check the Worker
npm run build
```

The backend tests run the real request handler with an in-memory store. A manual smoke test against `wrangler dev` covered the website, assets, the 404 page, registration, duplicate usernames, wrong passwords and protected routes from a single address.
