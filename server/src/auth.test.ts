import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import {
  createSession, deleteSession, getSessionUser, hashPassword, verifyPassword,
} from './auth.js';

async function makeUser(db: ReturnType<typeof openDb>): Promise<number> {
  const pwHash = await hashPassword('correct horse');
  const r = db
    .prepare(`INSERT INTO users (email, password_hash, display_name) VALUES ('a@uga.edu', ?, 'A')`)
    .run(pwHash);
  return Number(r.lastInsertRowid);
}

describe('passwords', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const h = await hashPassword('secret-pw');
    expect(await verifyPassword(h, 'secret-pw')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(h).not.toContain('secret-pw');
  });
});

describe('sessions', () => {
  it('round-trips a session and deletes it', async () => {
    const db = openDb(':memory:');
    const userId = await makeUser(db);
    const token = createSession(db, userId);
    const user = getSessionUser(db, token);
    expect(user).toMatchObject({ id: userId, email: 'a@uga.edu', displayName: 'A', isSiteAdmin: false });
    deleteSession(db, token);
    expect(getSessionUser(db, token)).toBeNull();
  });

  it('rejects an unknown token', async () => {
    const db = openDb(':memory:');
    await makeUser(db);
    expect(getSessionUser(db, 'not-a-token')).toBeNull();
  });

  it('stores only a hash of the token', async () => {
    const db = openDb(':memory:');
    const userId = await makeUser(db);
    const token = createSession(db, userId);
    const row = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
