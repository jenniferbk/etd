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

  it('returns 404 JSON when adding a member to a non-existent group', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app)
      .post('/api/groups/999999/members').set(auth(adminToken))
      .send({ email: 'admin@test.edu', role: 'member' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTypeOf('string');
  });

  it('returns 404 JSON when removing a member from a non-existent group', async () => {
    const { app, adminToken } = await makeTestServer();
    const res = await request(app)
      .delete('/api/groups/999999/members/1').set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  it('lists group members with roles, ordered by displayName', async () => {
    const { app, adminToken } = await makeTestServer();
    await registerMember(app, adminToken, 'zoe@uga.edu');
    await registerMember(app, adminToken, 'amir@uga.edu');
    const res = await request(app).get('/api/groups/1/members').set(auth(adminToken));
    expect(res.status).toBe(200);
    // makeTestServer's admin has display_name 'Admin'; registerMember uses the
    // email as displayName — case-insensitive name order:
    expect(res.body.map((m: { displayName: string }) => m.displayName)).toEqual([
      'Admin', 'amir@uga.edu', 'zoe@uga.edu',
    ]);
    expect(res.body[0]).toMatchObject({ email: 'admin@test.edu', role: 'admin' });
  });

  it('a plain member can view the roster', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'm@uga.edu');
    const res = await request(app).get('/api/groups/1/members').set(auth(member.token));
    expect(res.status).toBe(200);
  });

  it('non-members get 403; unknown group 404', async () => {
    const { app, adminToken } = await makeTestServer();
    const g2 = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' });
    const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: g2.body.id });
    const reg = await request(app).post('/api/auth/register').send({
      inviteToken: inv.body.token, email: 'out@uga.edu', password: 'longenough',
      displayName: 'Out', acceptedPolicy: true,
    });
    expect((await request(app).get('/api/groups/1/members').set(auth(reg.body.token))).status).toBe(403);
    expect((await request(app).get('/api/groups/999/members').set(auth(adminToken))).status).toBe(404);
  });
});
