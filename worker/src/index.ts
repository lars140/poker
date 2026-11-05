import { DurableObject } from "cloudflare:workers";
import { Backend, type ApiRequest, type ApiResponse, type Doc } from "../../src/server/backend";

export interface Env {
  STORE: DurableObjectNamespace<Store>;
  /** Origins allowed to call the API cross-origin. Only used in local development. */
  ALLOWED_ORIGINS: string;
}

const MAX_BODY_BYTES = 100_000;

/**
 * One Durable Object holds the whole league as a single JSON document ("data.json") and processes
 * requests one at a time, so concurrent edits from many people cannot overwrite each other.
 */
export class Store extends DurableObject<Env> {
  private backend: Backend;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.backend = new Backend({
      load: () => ctx.storage.get<Doc>("data"),
      save: (doc) => ctx.storage.put("data", doc),
    });
  }

  /** JSON in, JSON out: keeps the RPC boundary simple and fully typed. */
  async handle(request: string): Promise<string> {
    return JSON.stringify(await this.backend.handle(JSON.parse(request) as ApiRequest));
  }
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return json(404, { error: "Not found." }, cors);

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

    const stub = env.STORE.get(env.STORE.idFromName("league"));
    const response = JSON.parse(await stub.handle(JSON.stringify({ method: request.method, path: url.pathname, token, body }))) as ApiResponse;
    return json(response.status, response.body, cors);
  },
} satisfies ExportedHandler<Env>;
