import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

async function registerMember(app: import('express').Express, adminToken: string, email: string): Promise<string> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'oldpassword', displayName: email, acceptedPolicy: true,
  });
  return reg.body.token as string;
}

describe('password resets', () => {
  it('admin issues a reset; user sets a new password; old sessions die', async () => {
    const { app, adminToken } = await makeTestServer();
    const oldToken = await registerMember(app, adminToken, 'forgetful@uga.edu');

    const issued = await request(app)
      .post('/api/password-resets').set(auth(adminToken)).send({ email: 'forgetful@uga.edu' });
    expect(issued.status).toBe(200);

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: issued.body.token, newPassword: 'brand-new-pw' });
    expect(reset.status).toBe(204);

    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(401);

    const relogin = await request(app)
      .post('/api/auth/login').send({ email: 'forgetful@uga.edu', password: 'brand-new-pw' });
    expect(relogin.status).toBe(200);
  });

  it('reset token is single-use', async () => {
    const { app, adminToken } = await makeTestServer();
    await registerMember(app, adminToken, 'x@uga.edu');
    const issued = await request(app)
      .post('/api/password-resets').set(auth(adminToken)).send({ email: 'x@uga.edu' });
    await request(app).post('/api/auth/reset-password').send({ token: issued.body.token, newPassword: 'first-new-pw' });
    const again = await request(app)
      .post('/api/auth/reset-password').send({ token: issued.body.token, newPassword: 'second-new-pw' });
    expect(again.status).toBe(400);
  });

  it('a plain member cannot issue resets', async () => {
    const { app, adminToken } = await makeTestServer();
    const memberToken = await registerMember(app, adminToken, 'm@uga.edu');
    await registerMember(app, adminToken, 'target@uga.edu');
    const res = await request(app)
      .post('/api/password-resets').set(auth(memberToken)).send({ email: 'target@uga.edu' });
    expect(res.status).toBe(403);
  });

  it('a plain member gets an identical 403 whether or not the target email exists (no email-existence oracle)', async () => {
    const { app, adminToken } = await makeTestServer();
    const memberToken = await registerMember(app, adminToken, 'm2@uga.edu');
    await registerMember(app, adminToken, 'exists@uga.edu');

    const existing = await request(app)
      .post('/api/password-resets').set(auth(memberToken)).send({ email: 'exists@uga.edu' });
    const nonexistent = await request(app)
      .post('/api/password-resets').set(auth(memberToken)).send({ email: 'nobody-here@uga.edu' });

    expect(existing.status).toBe(403);
    expect(nonexistent.status).toBe(403);
    expect(existing.body).toEqual(nonexistent.body);
  });

  it('a group admin cannot issue a reset for a site admin sharing their group (no privilege escalation)', async () => {
    const { app, adminToken } = await makeTestServer();
    const groupAdminToken = await registerMember(app, adminToken, 'groupadmin@uga.edu');
    await request(app)
      .post('/api/groups/1/members').set(auth(adminToken))
      .send({ email: 'groupadmin@uga.edu', role: 'admin' });

    const res = await request(app)
      .post('/api/password-resets').set(auth(groupAdminToken)).send({ email: 'admin@test.edu' });
    expect(res.status).toBe(403);
  });
});
