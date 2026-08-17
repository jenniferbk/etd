import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { auth, makeTestServer } from '../test/helpers.js';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

describe('static serving (ETD_STATIC_DIR)', () => {
  function makeStaticDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'etd-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ETD</title>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app")');
    return dir;
  }

  it('serves index.html at / and static assets when staticDir is set', async () => {
    const app = createApp(openDb(':memory:'), { staticDir: makeStaticDir() });
    const root = await request(app).get('/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('<title>ETD</title>');
    const asset = await request(app).get('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toContain('console.log');
  });

  it('serves index.html for unknown non-api GET routes (SPA fallback)', async () => {
    const app = createApp(openDb(':memory:'), { staticDir: makeStaticDir() });
    const res = await request(app).get('/some/client/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>ETD</title>');
  });

  it('keeps /api JSON behavior with staticDir set', async () => {
    const app = createApp(openDb(':memory:'), { staticDir: makeStaticDir() });
    const health = await request(app).get('/api/health');
    expect(health.body).toEqual({ ok: true });
    const unknown = await request(app).get('/api/nope');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBeTypeOf('string');
  });

  it('returns 404 for / when staticDir is not set (unchanged behavior)', async () => {
    const res = await request(createApp(openDb(':memory:'))).get('/');
    expect(res.status).toBe(404);
  });
});
