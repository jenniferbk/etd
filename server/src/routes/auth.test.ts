import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ADMIN_EMAIL, ADMIN_PASSWORD, auth, makeTestServer } from '../../test/helpers.js';

describe('auth routes', () => {
  it('logs in with correct credentials', async () => {
    const { app } = await makeTestServer();
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: ADMIN_EMAIL, isSiteAdmin: true });
  });

  it('rejects a wrong password with 401', async () => {
    const { app } = await makeTestServer();
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'nope-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTypeOf('string');
  });

  it('GET /me returns the session user and logout invalidates the token', async () => {
    const { app, adminToken } = await makeTestServer();
    const me = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(ADMIN_EMAIL);

    const out = await request(app).post('/api/auth/logout').set(auth(adminToken));
    expect(out.status).toBe(204);

    const after = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(after.status).toBe(401);
  });

  it('GET /me without a token is 401', async () => {
    const { app } = await makeTestServer();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});
