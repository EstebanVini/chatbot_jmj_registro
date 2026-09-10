import Database from 'better-sqlite3';
import { config } from './config';
import fs from 'fs';
import path from 'path';

// Ensure the directory for the db exists
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.DB_PATH, {
  fileMustExist: false,
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    closed_at     TEXT,
    status        TEXT NOT NULL DEFAULT 'activa'
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

  CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    filename    TEXT NOT NULL,
    mimetype    TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    path        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    seq         INTEGER NOT NULL,
    author      TEXT NOT NULL,
    kind        TEXT NOT NULL,
    text        TEXT,
    media_id    TEXT REFERENCES media(id),
    media_url   TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_seq ON messages(session_id, seq);
`);
