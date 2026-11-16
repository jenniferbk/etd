import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';
import { seedCodebook } from '../../scripts/seed-codebook.js';

async function registerMember(app: import('express').Express, adminToken: string, email: string, groupId = 1): Promise<string> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'longenough', displayName: email, acceptedPolicy: true,
  });
  return reg.body.token as string;
}

const KINDS = [
  { id: 'a', label: 'Restates', category: 'Cat 1', type: 'other' },
  { id: 'b', label: 'Recall', category: 'Cat 2', type: 'question' },
  { id: 'c', label: 'Calculation', category: 'Cat 2', type: 'question' },
];

async function init(app: import('express').Express, token: string) {
  return request(app).post('/api/groups/1/codebook/init').set(auth(token)).send({ kinds: KINDS });
}

describe('codebook', () => {
  it('init then GET returns kinds in order; second init is 409', async () => {
    const { app, adminToken } = await makeTestServer();
    const r = await init(app, adminToken);
    expect(r.status).toBe(200);
    const got = await request(app).get('/api/groups/1/codebook').set(auth(adminToken));
    expect(got.body.kinds.map((k: { id: string }) => k.id)).toEqual(['a', 'b', 'c']);
    expect(got.body.kinds[0]).toEqual({
      id: 'a', label: 'Restates', category: 'Cat 1', type: 'other', status: 'active', mergedInto: null, position: 0,
    });
    expect((await init(app, adminToken)).status).toBe(409);
  });

  it('labels are unique ignoring case; a merged kind label may be reused', async () => {
    const { app, adminToken } = await makeTestServer();
    await init(app, adminToken);
    const dup = await request(app).post('/api/groups/1/codebook/kinds').set(auth(adminToken))
      .send({ label: 'restates', category: 'X', type: 'other' });
    expect(dup.status).toBe(409);
    const dupId = await request(app).post('/api/groups/1/codebook/kinds').set(auth(adminToken))
      .send({ id: 'a', label: 'Fresh', category: 'X', type: 'other' });
    expect(dupId.status).toBe(409);
    await request(app).post('/api/groups/1/codebook/kinds/a/merge').set(auth(adminToken)).send({ into: 'b' });
    const reuse = await request(app).post('/api/groups/1/codebook/kinds').set(auth(adminToken))
      .send({ label: 'restates', category: 'X', type: 'other' });
    expect(reuse.status).toBe(200);
    expect(typeof reuse.body.id).toBe('string');
    expect(reuse.body.position).toBe(3);
  });

  it('rename keeps id and logs the change with the user name', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'peer@uga.edu');
    await init(app, adminToken);
    const p = await request(app).patch('/api/groups/1/codebook/kinds/b').set(auth(member)).send({ label: 'Remember' });
    expect(p.status).toBe(200);
    const got = await request(app).get('/api/groups/1/codebook').set(auth(member));
    expect(got.body.kinds[1]).toMatchObject({ id: 'b', label: 'Remember' });
    const log = await request(app).get('/api/groups/1/codebook/log').set(auth(member));
    const updates = log.body.entries.filter((e: { action: string }) => e.action === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ user: 'peer@uga.edu', kindId: 'b' });
    expect(updates[0].before.label).toBe('Recall');
    expect(updates[0].after.label).toBe('Remember');
    expect(log.body.entries[0].action).toBe('update');
    const clash = await request(app).patch('/api/groups/1/codebook/kinds/b').set(auth(member)).send({ label: 'CALCULATION' });
    expect(clash.status).toBe(409);
  });

  it('merge flattens chains', async () => {
    const { app, adminToken } = await makeTestServer();
    await init(app, adminToken);
    const m1 = await request(app).post('/api/groups/1/codebook/kinds/a/merge').set(auth(adminToken)).send({ into: 'b' });
    expect(m1.status).toBe(200);
    const m2 = await request(app).post('/api/groups/1/codebook/kinds/b/merge').set(auth(adminToken)).send({ into: 'c' });
    expect(m2.status).toBe(200);
    const byId = Object.fromEntries(m2.body.kinds.map((k: { id: string }) => [k.id, k]));
    expect(byId.a).toMatchObject({ mergedInto: 'c', status: 'retired' });
    expect(byId.b).toMatchObject({ mergedInto: 'c', status: 'retired' });
    expect(byId.c).toMatchObject({ mergedInto: null, status: 'active' });
    const react = await request(app).patch('/api/groups/1/codebook/kinds/a').set(auth(adminToken)).send({ status: 'active' });
    expect(react.status).toBe(400);
  });

  it('merge rejects self, merged, and retired targets', async () => {
    const { app, adminToken } = await makeTestServer();
    await init(app, adminToken);
    const merge = (id: string, into: string) =>
      request(app).post(`/api/groups/1/codebook/kinds/${id}/merge`).set(auth(adminToken)).send({ into });
    expect((await merge('a', 'a')).status).toBe(400);
    await merge('a', 'b');
    expect((await merge('c', 'a')).status).toBe(400); // merged target
    await request(app).patch('/api/groups/1/codebook/kinds/c').set(auth(adminToken)).send({ status: 'retired' });
    expect((await merge('b', 'c')).status).toBe(400); // retired target
  });

  it('non-member gets 403 on GET and POST', async () => {
    const { app, adminToken, db } = await makeTestServer();
    db.prepare("INSERT INTO groups (name) VALUES ('Other')").run();
    const outsider = await registerMember(app, adminToken, 'out@uga.edu', 2);
    const g = await request(app).get('/api/groups/1/codebook').set(auth(outsider));
    expect(g.status).toBe(403);
    const p = await request(app).post('/api/groups/1/codebook/init').set(auth(outsider)).send({ kinds: KINDS });
    expect(p.status).toBe(403);
  });

  it('seed upserts and is idempotent', async () => {
    const { app, adminToken, db } = await makeTestServer();
    await request(app).post('/api/groups/1/codebook/init').set(auth(adminToken))
      .send({ kinds: [{ id: 'displays', label: 'Displays', category: '[uncategorized]', type: 'other' }] });
    const seed = { kinds: [
      { id: 'displays', label: 'Displays', category: 'Showing', type: 'other' as const },
      { id: 'recall', label: 'Recall', category: 'Cat 2', type: 'question' as const },
    ] };
    const first = seedCodebook(db, 1, seed);
    expect(first).toEqual({ added: 1, updated: 1, unchanged: 0 });
    const second = seedCodebook(db, 1, seed);
    expect(second).toEqual({ added: 0, updated: 0, unchanged: 2 });
    const got = await request(app).get('/api/groups/1/codebook').set(auth(adminToken));
    expect(got.body.kinds.map((k: { id: string; category: string }) => [k.id, k.category]))
      .toEqual([['displays', 'Showing'], ['recall', 'Cat 2']]);
    const log = await request(app).get('/api/groups/1/codebook/log').set(auth(adminToken));
    expect(log.body.entries.filter((e: { action: string }) => e.action === 'seed')).toHaveLength(2);
  });
  it('seed aborts without writing when a label belongs to another unmerged kind', async () => {
    const { app, adminToken, db } = await makeTestServer();
    await request(app).post('/api/groups/1/codebook/init').set(auth(adminToken)).send({ kinds: [
      { id: 'mine', label: 'Recall', category: 'Cat 2', type: 'question' },
      { id: 'old', label: 'Displays', category: 'k', type: 'other' },
      { id: 'keep', label: 'Keep', category: 'k', type: 'other' },
    ] });
    // A merged kind may share a label; it does not count.
    const merged = await request(app).post('/api/groups/1/codebook/kinds/old/merge').set(auth(adminToken)).send({ into: 'keep' });
    expect(merged.status).toBe(200);
    const seed = { kinds: [
      { id: 'new', label: 'Brand new', category: 'k', type: 'other' as const },
      { id: 'displays', label: 'Displays', category: 'Showing', type: 'other' as const },
      { id: 'recall', label: ' recall ', category: 'Cat 2', type: 'question' as const },
    ] };
    expect(() => seedCodebook(db, 1, seed)).toThrow(/recall.*mine/is);
    const got = await request(app).get('/api/groups/1/codebook').set(auth(adminToken));
    expect(got.body.kinds.map((k: { id: string }) => k.id)).toEqual(['mine', 'old', 'keep']);
    const log = await request(app).get('/api/groups/1/codebook/log').set(auth(adminToken));
    expect(log.body.entries.filter((e: { action: string }) => e.action === 'seed')).toHaveLength(0);
  });
});
