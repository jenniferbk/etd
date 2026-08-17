import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDb, type Db } from '../src/db.js';
import { bootstrap } from '../src/bootstrap.js';

export const ADMIN_EMAIL = 'admin@test.edu';
export const ADMIN_PASSWORD = 'admin-pw-123';

export async function makeTestServer(): Promise<{ app: Express; db: Db; adminToken: string }> {
  const db = openDb(':memory:');
  await bootstrap(db, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, initialGroup: 'COMS' });
  const app = createApp(db);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  return { app, db, adminToken: res.body.token as string };
}

export function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
