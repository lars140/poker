// In production the website and the API are served by the same Cloudflare Pages project, so API calls are
// relative ("/api/..."). During `npm run dev` the site runs on :3000 and talks to `npm run pages:dev` (:8788).
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:8788" : "")
).replace(/\/$/, "");
