import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

async function registerMember(
  app: import('express').Express, adminToken: string, email: string,
): Promise<{ token: string; id: number }> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'longenough', displayName: email, acceptedPolicy: true,
  });
  return { token: reg.body.token, id: reg.body.user.id };
}

describe('groups', () => {
  it('lists my groups with role', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app).get('/api/groups').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'COMS', role: 'admin' }]);
  });

  it('site admin creates a group and becomes its admin', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'AlgebraProject' });
    expect(res.status).toBe(200);
    const groups = await request(app).get('/api/groups').set(auth(adminToken));
    expect(groups.body).toContainEqual({ id: res.body.id, name: 'AlgebraProject', role: 'admin' });
  });

  it('non-site-admin cannot create groups', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'm1@uga.edu');
    const res = await request(app).post('/api/groups').set(auth(member.token)).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('group admin adds and removes members by email', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'm2@uga.edu');
    const g = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Second' });
    const add = await request(app)
      .post(`/api/groups/${g.body.id}/members`).set(auth(adminToken))
      .send({ email: 'm2@uga.edu', role: 'member' });
    expect(add.status).toBe(204);
    const mine = await request(app).get('/api/groups').set(auth(member.token));
    expect(mine.body).toContainEqual({ id: g.body.id, name: 'Second', role: 'member' });

    const del = await request(app)
      .delete(`/api/groups/${g.body.id}/members/${member.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);
    const after = await request(app).get('/api/groups').set(auth(member.token));
    expect(after.body).not.toContainEqual({ id: g.body.id, name: 'Second', role: 'member' });
  });

  it('plain members cannot add members', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'm3@uga.edu');
    const res = await request(app)
      .post('/api/groups/1/members').set(auth(member.token))
      .send({ email: 'm3@uga.edu', role: 'admin' });
    expect(res.status).toBe(403);
  });
});
