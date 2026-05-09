import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.LUMEN_DB ?? "data/lumen.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    github_login TEXT,
    invited_by TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    issued_by TEXT,
    consumed_by TEXT,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lenses (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    url TEXT NOT NULL,
    author_id TEXT NOT NULL,
    anonymous INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    body TEXT NOT NULL,
    refs TEXT NOT NULL DEFAULT '[]',
    anchor TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lenses_room ON lenses(room_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_lenses_author ON lenses(author_id, created_at);

  CREATE TABLE IF NOT EXISTS reactions (
    lens_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (lens_id, user_id, kind)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    lens_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'user_report',
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reports_lens ON reports(lens_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id, created_at);

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    reading_mode TEXT NOT NULL DEFAULT 'quiet',
    per_site_overrides TEXT NOT NULL DEFAULT '{}',
    custom_tag_filters TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS token_revocations (
    user_id TEXT PRIMARY KEY,
    revoked_before INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS companion_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS companion_participants (
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    left_at INTEGER,
    PRIMARY KEY (session_id, user_id)
  );
`;

db.exec(SCHEMA);

const findMigration = db.query<{ id: number }, [number]>(
  "SELECT id FROM schema_migrations WHERE id = ?",
);
const recordMigration = db.query<unknown, [number, string, number]>(
  "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
);

function hasColumn(table: string, column: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`invalid table name: ${table}`);
  const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`);
  return columns.all().some((row) => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (hasColumn(table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function runMigration(id: number, name: string, apply: () => void) {
  if (findMigration.get(id)) return;
  db.transaction(() => {
    apply();
    recordMigration.run(id, name, Date.now());
  })();
}

runMigration(1, "baseline core schema", () => {
  // Existing databases are already brought to the baseline by SCHEMA above.
});

runMigration(2, "report review queue", () => {
  addColumnIfMissing("reports", "status", "TEXT NOT NULL DEFAULT 'open'");
  addColumnIfMissing("reports", "reviewed_by", "TEXT");
  addColumnIfMissing("reports", "reviewed_at", "INTEGER");
  addColumnIfMissing("reports", "review_note", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at)");
});

if (import.meta.main) {
  console.log(`DB ready at ${DB_PATH}`);
}
