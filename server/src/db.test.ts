import { describe, expect, it } from 'vitest';
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
});
