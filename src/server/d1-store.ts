import { ConflictError, type Doc, type DocStore } from "./backend";

// Minimal shape of the Cloudflare D1 API that is used here, so this file needs no Workers types.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface D1Like {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<{ results?: unknown[] }[]>;
}

/**
 * Keeps the whole league as one JSON document in a single D1 row. Every write checks the version it
 * loaded (optimistic locking), so two people saving at the same moment cannot overwrite each other.
 * Create one instance per request.
 */
export class D1Store implements DocStore {
  private version = 0;
  private loaded: string | undefined;

  constructor(private db: D1Like) {}

  async load(): Promise<Doc | undefined> {
    // The table is created on first use, so there is no separate setup step.
    const [, read] = await this.db.batch([
      this.db.prepare("CREATE TABLE IF NOT EXISTS doc (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, version INTEGER NOT NULL)"),
      this.db.prepare("SELECT json, version FROM doc WHERE id = 1"),
    ]);
    const row = read.results?.[0] as { json: string; version: number } | undefined;
    if (!row) return undefined;
    this.version = row.version;
    this.loaded = row.json;
    return JSON.parse(row.json) as Doc;
  }

  async save(doc: Doc): Promise<void> {
    const json = JSON.stringify(doc);
    if (json === this.loaded) return; // nothing changed (e.g. plain reads), so no write
    const statement = this.version === 0
      ? this.db.prepare("INSERT OR IGNORE INTO doc (id, json, version) VALUES (1, ?, 1)").bind(json)
      : this.db.prepare("UPDATE doc SET json = ?, version = version + 1 WHERE id = 1 AND version = ?").bind(json, this.version);
    const { meta } = await statement.run();
    if (meta.changes !== 1) throw new ConflictError();
    this.version += 1;
    this.loaded = json;
  }
}
