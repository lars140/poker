# Felt: Poker League Preview

Felt is a static preview dashboard for an in-person poker league. The dashboard uses illustrative sample data; it does not provide accounts, persistence, or a backend.

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

The scoring module has unit tests for tournament sizes, placements, and awarded points.

## GitHub Pages

The GitHub Actions workflow builds the app with Next.js static export and deploys the generated `out/` directory. Repository sites automatically use the repository name as their base path; user and organization sites are published at the root. Enable GitHub Pages in the repository settings and select GitHub Actions as the deployment source.
