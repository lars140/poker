import { Backend, type ApiRequest } from "../../src/server/backend";
import { D1Store, type D1Like } from "../../src/server/d1-store";

// Cloudflare Pages Function: answers every /api/* request. The website itself is the static export in out/.

interface Env {
  DB: D1Like;
  /** Origins allowed to call the API cross-origin. Only for local development (see .dev.vars.example). */
  ALLOWED_ORIGINS?: string;
}

const MAX_BODY_BYTES = 100_000;

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  let body: unknown;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json(413, { error: "Request too large." }, cors);
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      return json(400, { error: "Invalid JSON." }, cors);
    }
  }

  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
  const apiRequest: ApiRequest = { method: request.method, path: new URL(request.url).pathname.replace(/\/+$/, ""), token, body };

  const response = await new Backend(new D1Store(env.DB)).handle(apiRequest);
  return json(response.status, response.body, cors);
};
