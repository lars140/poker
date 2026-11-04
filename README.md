# Felt: Private Poker League

Felt is a static web app for managing an in-person Texas Hold'em league: groups, players, game nights, attendance, tournament results, points and leaderboards. It is hosted on GitHub Pages, so there is **no server and no database**. All data lives in the visitor's browser (`localStorage`).

There is no virtual table, card simulation, chip management, betting, payments or real-money gambling.

## What it does

- Multiple groups, each with its own players, events, history and leaderboard. Rankings never mix between groups.
- Players can be archived; they stay visible in past results.
- Events with title, description, date and start time, location, registration deadline and a participant limit. Each player is Going, Maybe or Declined; the limit can never be exceeded, and a full event is shown as full.
- Results for 4 to 7 players with a confirmation screen showing the calculated points before saving. An event can be finalized only once; corrections replace all placements and nothing is counted twice. Attendance never awards points.
- Leaderboard (points, wins, 2nd, 3rd, played, average position), history with a date filter, statistics and a points-over-time chart.
- Backup and restore as a JSON file (Data page), so a league can be moved to another browser or device.

Scoring (one central function in `src/lib/scoring.ts`, points stored per result when finalized):

| Players | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th |
| ------- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 10 | 6 | 3 | 1 | | | |
| 5 | 12 | 8 | 5 | 2 | 0 | | |
| 6 | 15 | 10 | 6 | 3 | 1 | 0 | |
| 7 | 18 | 12 | 8 | 4 | 2 | 1 | 0 |

## Limits of a static site

GitHub Pages can only serve files, so some things from a full multi-user app are not possible:

- **No accounts, passwords, email verification or password reset.** Nobody logs in.
- **No shared data between devices.** Each browser has its own copy. Use the backup file to move or share a league. If two people edit separately, their copies diverge.
- **No admin/member roles and no access control.** Anyone who can open the site in your browser can change that browser's data. Players are just names in a group.
- **No direct invitations, invitation links or notifications**, because there is nobody to send them to.
- Clearing site data in the browser deletes the league. Download backups regularly. If the browser refuses to save, the app shows a warning instead of pretending it worked.

Real multi-user features would need a backend, which this project deliberately does not use.

## Run locally

Requires Node.js 20.9 or later and npm.

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Test and build

```powershell
npm test
npm run lint
npm run build
```

Tests cover scoring for 4 to 7 players, invalid and duplicate placements, single finalization, corrections, independent group leaderboards, attendance limits and deadlines, duplicate attendance, and input validation.

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/main.yml` builds the app with Next.js static export and deploys the generated `out/` directory. Repository sites automatically use the repository name as their base path; user and organization sites are published at the root. In the repository settings, enable GitHub Pages and select GitHub Actions as the source.

The app uses hash-based routes (`/#/g/...`), so every page works on a static host without server rewrites.
