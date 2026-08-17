import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { auth, makeTestServer } from '../test/helpers.js';

describe('app', () => {
  it('responds to health check', async () => {
    const res = await request(createApp(openDb(':memory:'))).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns JSON 404 for an unknown /api route with a valid token', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app).get('/api/not-a-real-route').set(auth(adminToken));
    expect(res.status).toBe(404);
    expect(res.type).toMatch(/json/);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('returns JSON 400 for a malformed JSON request body', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app)
      .post('/api/diagrams')
      .set(auth(adminToken))
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
    expect(res.type).toMatch(/json/);
    expect(res.body).toEqual({ error: 'invalid JSON body' });
  });
});
