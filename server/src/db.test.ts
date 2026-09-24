import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from './db.js';

describe('openDb', () => {
  it('creates all tables', () => {
    const db = openDb(':memory:');
    const names = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
    ).map((r) => r.name);
    for (const t of [
      'users', 'groups', 'memberships', 'sessions',
      'diagrams', 'diagram_versions', 'comments', 'invites', 'password_resets',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('enforces foreign keys', () => {
    const db = openDb(':memory:');
    expect(() =>
      db.prepare(`INSERT INTO memberships (user_id, group_id, role) VALUES (999, 999, 'member')`).run(),
    ).toThrow();
  });

  it('adds trash columns to a database created before the trash existed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'etd-db-'));
    const path = join(dir, 'old.db');
    const old = new Database(path);
    old.exec(`CREATE TABLE diagrams (
      id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL, creator_id INTEGER NOT NULL,
      title TEXT NOT NULL, current_version_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO diagrams (group_id, creator_id, title) VALUES (1, 1, 'Existing');`);
    old.close();

    const db = openDb(path);
    const cols = (db.prepare('PRAGMA table_info(diagrams)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('deleted_at');
    expect(cols).toContain('deleted_by');
    const row = db.prepare('SELECT title, deleted_at FROM diagrams').get() as { title: string; deleted_at: string | null };
    expect(row).toEqual({ title: 'Existing', deleted_at: null });
    db.close();
    // re-opening is a no-op
    openDb(path).close();
    rmSync(dir, { recursive: true, force: true });
  });
});
