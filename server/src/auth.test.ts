import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { openDb } from './db.js';
import {
  createSession, deleteSession, getSessionUser, hashPassword, verifyPassword, requireAuth,
} from './auth.js';

async function makeUser(db: ReturnType<typeof openDb>): Promise<number> {
  const pwHash = await hashPassword('correct horse');
  const r = db
    .prepare(`INSERT INTO users (email, password_hash, display_name) VALUES ('a@uga.edu', ?, 'A')`)
    .run(pwHash);
  return Number(r.lastInsertRowid);
}

function appWithProtectedRoute(db: ReturnType<typeof openDb>) {
  const app = express();
  app.get('/protected', requireAuth(db), (req, res) => {
    res.json({ user: req.user });
  });
  return app;
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

describe('requireAuth', () => {
  it('rejects a missing Authorization header with 401 JSON', async () => {
    const db = openDb(':memory:');
    const res = await request(appWithProtectedRoute(db)).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects a non-Bearer or invalid token with 401', async () => {
    const db = openDb(':memory:');
    const app = appWithProtectedRoute(db);
    expect((await request(app).get('/protected').set('Authorization', 'Basic abc')).status).toBe(401);
    expect((await request(app).get('/protected').set('Authorization', 'Bearer not-real')).status).toBe(401);
  });

  it('sets req.user for a valid session token', async () => {
    const db = openDb(':memory:');
    const userId = await makeUser(db);
    const token = createSession(db, userId);
    const res = await request(appWithProtectedRoute(db)).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userId, email: 'a@uga.edu' });
  });
});
