import Database from 'better-sqlite3';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_site_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  PRIMARY KEY (user_id, group_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS diagrams (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  current_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS diagram_versions (
  id INTEGER PRIMARY KEY,
  diagram_id INTEGER NOT NULL REFERENCES diagrams(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  snapshot_gz BLOB NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  diagram_id INTEGER NOT NULL REFERENCES diagrams(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
`;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Additive, idempotent migrations for databases created by an older SCHEMA
// (CREATE TABLE IF NOT EXISTS never alters an existing table).
function migrate(db: Db): void {
  const diagramCols = new Set(
    (db.prepare('PRAGMA table_info(diagrams)').all() as { name: string }[]).map((c) => c.name),
  );
  // Trash: a non-null deleted_at means the diagram is in its group's trash.
  if (!diagramCols.has('deleted_at')) db.exec('ALTER TABLE diagrams ADD COLUMN deleted_at TEXT');
  if (!diagramCols.has('deleted_by')) {
    db.exec('ALTER TABLE diagrams ADD COLUMN deleted_by INTEGER REFERENCES users(id)');
  }
  // Workspace card thumbnail: the latest one sent with a save (not versioned).
  if (!diagramCols.has('thumbnail')) db.exec('ALTER TABLE diagrams ADD COLUMN thumbnail BLOB');
  if (!diagramCols.has('thumbnail_mime')) db.exec('ALTER TABLE diagrams ADD COLUMN thumbnail_mime TEXT');
}
