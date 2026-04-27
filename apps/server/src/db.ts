import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.LUMEN_DB ?? "data/lumen.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const SCHEMA = `
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

if (import.meta.main) {
  console.log(`DB ready at ${DB_PATH}`);
}
