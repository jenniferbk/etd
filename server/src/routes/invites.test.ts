import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

async function makeInvite(app: import('express').Express, adminToken: string): Promise<string> {
  const res = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

const REG = {
  email: 'newbie@uga.edu',
  password: 'longenough',
  displayName: 'Newbie',
  acceptedPolicy: true,
};

describe('invites + register', () => {
  it('admin creates an invite; new user registers and lands in the group', async () => {
    const { app, db, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    const res = await request(app).post('/api/auth/register').send({ inviteToken, ...REG });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: REG.email, displayName: 'Newbie', isSiteAdmin: false });
    const m = db
      .prepare(`SELECT role FROM memberships WHERE user_id = ? AND group_id = 1`)
      .get(res.body.user.id) as { role: string };
    expect(m.role).toBe('member');
  });

  it('an invite is single-use', async () => {
    const { app, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    await request(app).post('/api/auth/register').send({ inviteToken, ...REG });
    const second = await request(app)
      .post('/api/auth/register')
      .send({ inviteToken, ...REG, email: 'other@uga.edu' });
    expect(second.status).toBe(400);
  });

  it('rejects registration without acceptedPolicy', async () => {
    const { app, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ inviteToken, ...REG, acceptedPolicy: false });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email with 409', async () => {
    const { app, adminToken } = await makeTestServer();
    const t1 = await makeInvite(app, adminToken);
    const t2 = await makeInvite(app, adminToken);
    await request(app).post('/api/auth/register').send({ inviteToken: t1, ...REG });
    const res = await request(app).post('/api/auth/register').send({ inviteToken: t2, ...REG });
    expect(res.status).toBe(409);
  });

  it('non-admin members cannot create invites', async () => {
    const { app, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    const reg = await request(app).post('/api/auth/register').send({ inviteToken, ...REG });
    const res = await request(app).post('/api/invites').set(auth(reg.body.token)).send({ groupId: 1 });
    expect(res.status).toBe(403);
  });

  it('atomic invite claim: second registration with same token fails with 400', async () => {
    const { app, db, adminToken } = await makeTestServer();
    const inviteToken = await makeInvite(app, adminToken);
    const first = await request(app).post('/api/auth/register').send({ inviteToken, ...REG });
    expect(first.status).toBe(200);
    const { sha256 } = await import('../auth.js');
    const inviteRow = db
      .prepare('SELECT used_at FROM invites WHERE token_hash = ?')
      .get(sha256(inviteToken)) as { used_at: string | null };
    expect(inviteRow.used_at).not.toBeNull();
    const second = await request(app)
      .post('/api/auth/register')
      .send({ inviteToken, ...REG, email: 'another@uga.edu' });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('invalid or expired invite');
  });

  it('race-safe duplicate email: concurrent registrations with same email return 200 and 409', async () => {
    const { app, adminToken } = await makeTestServer();
    const t1 = await makeInvite(app, adminToken);
    const t2 = await makeInvite(app, adminToken);
    const results = await Promise.all([
      request(app).post('/api/auth/register').send({ inviteToken: t1, ...REG }),
      request(app)
        .post('/api/auth/register')
        .send({ inviteToken: t2, ...REG }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const successResult = results.find((r) => r.status === 200);
    const failResult = results.find((r) => r.status === 409);
    expect(successResult!.body.token).toBeTypeOf('string');
    expect(failResult!.body.error).toBe('an account with that email already exists');
  });
});

describe('invite preview', () => {
  it('previews a valid invite without auth', async () => {
    const { app, adminToken } = await makeTestServer();
    const token = await makeInvite(app, adminToken);
    const res = await request(app).get(`/api/invites/${token}/preview`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupName: 'COMS' });
  });

  it('previews of used or bogus invites 404 identically', async () => {
    const { app, adminToken } = await makeTestServer();
    const token = await makeInvite(app, adminToken);
    await request(app).post('/api/auth/register').send({
      inviteToken: token, email: 'u@uga.edu', password: 'longenough',
      displayName: 'U', acceptedPolicy: true,
    });
    const used = await request(app).get(`/api/invites/${token}/preview`);
    const bogus = await request(app).get('/api/invites/not-a-real-token/preview');
    expect(used.status).toBe(404);
    expect(bogus.status).toBe(404);
    expect(used.body).toEqual(bogus.body);
  });
});
