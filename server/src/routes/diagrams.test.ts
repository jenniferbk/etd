import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

const SNAP = { version: '1.6', name: 'Test', elements: [], connections: [], styleConfig: {}, transcript: null };

async function registerMember(app: import('express').Express, adminToken: string, email: string): Promise<string> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: 1 });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'longenough', displayName: email, acceptedPolicy: true,
  });
  return reg.body.token as string;
}

describe('diagrams', () => {
  it('creates, lists, opens, and saves a diagram', async () => {
    const { app, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken))
      .send({ groupId: 1, title: 'Lesson 4 argument', snapshot: SNAP });
    expect(created.status).toBe(200);
    const { id } = created.body;

    const list = await request(app).get('/api/groups/1/diagrams').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id, title: 'Lesson 4 argument', versionCount: 1 });
    expect(list.body[0].lastEditor).toBeTypeOf('string');

    const opened = await request(app).get(`/api/diagrams/${id}`).set(auth(adminToken));
    expect(opened.status).toBe(200);
    expect(opened.body.snapshot).toEqual(SNAP);

    const saved = await request(app)
      .put(`/api/diagrams/${id}`).set(auth(adminToken))
      .send({ snapshot: { ...SNAP, name: 'Renamed' }, title: 'Renamed' });
    expect(saved.status).toBe(200);
    expect(saved.body.currentVersionId).not.toBe(created.body.currentVersionId);

    const list2 = await request(app).get('/api/groups/1/diagrams').set(auth(adminToken));
    expect(list2.body[0]).toMatchObject({ title: 'Renamed', versionCount: 2 });
  });

  it('every save is retained as a version row', async () => {
    const { app, db, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'T', snapshot: SNAP });
    await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
    await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number };
    expect(n).toBe(3);
  });

  it('non-members get 403 on every diagram route', async () => {
    const { app, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'Private', snapshot: SNAP });
    const id = created.body.id;
    // outsider: a member of a *different* group only
    const g2 = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' });
    const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: g2.body.id });
    const reg = await request(app).post('/api/auth/register').send({
      inviteToken: inv.body.token, email: 'out@uga.edu', password: 'longenough',
      displayName: 'Out', acceptedPolicy: true,
    });
    const outsider = reg.body.token as string;

    expect((await request(app).get('/api/groups/1/diagrams').set(auth(outsider))).status).toBe(403);
    expect((await request(app).get(`/api/diagrams/${id}`).set(auth(outsider))).status).toBe(403);
    expect((await request(app).get(`/api/diagrams/${id}/versions`).set(auth(outsider))).status).toBe(403);
    expect((await request(app).put(`/api/diagrams/${id}`).set(auth(outsider)).send({ snapshot: SNAP })).status).toBe(403);
    expect((await request(app).delete(`/api/diagrams/${id}`).set(auth(outsider))).status).toBe(403);
    expect(
      (await request(app).post('/api/diagrams').set(auth(outsider)).send({ groupId: 1, title: 'X', snapshot: SNAP })).status,
    ).toBe(403);
  });

  it('members can edit but only creator/admin can delete', async () => {
    const { app, adminToken } = await makeTestServer();
    const memberToken = await registerMember(app, adminToken, 'peer@uga.edu');
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'Shared', snapshot: SNAP });
    const id = created.body.id;

    expect((await request(app).put(`/api/diagrams/${id}`).set(auth(memberToken)).send({ snapshot: SNAP })).status).toBe(200);
    expect((await request(app).delete(`/api/diagrams/${id}`).set(auth(memberToken))).status).toBe(403);
    expect((await request(app).delete(`/api/diagrams/${id}`).set(auth(adminToken))).status).toBe(204);
    expect((await request(app).get(`/api/diagrams/${id}`).set(auth(adminToken))).status).toBe(404);
  });

  it('PATCH renames without creating a version row', async () => {
    const { app, db, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'Old', snapshot: SNAP });
    const before = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
    const res = await request(app)
      .patch(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ title: 'New name' });
    expect(res.status).toBe(200);
    const after = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
    expect(after).toBe(before);
    const list = await request(app).get('/api/groups/1/diagrams').set(auth(adminToken));
    expect(list.body[0].title).toBe('New name');
  });

  it('PATCH rejects blank titles and enforces membership', async () => {
    const { app, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'T', snapshot: SNAP });
    expect((await request(app).patch(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ title: '  ' })).status).toBe(400);
    expect((await request(app).patch(`/api/diagrams/${created.body.id}`).send({ title: 'X' })).status).toBe(401);
  });

  it('lists versions newest-first with authors and isCurrent', async () => {
    const { app, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'V', snapshot: SNAP });
    await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
    const res = await request(app).get(`/api/diagrams/${created.body.id}/versions`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].isCurrent).toBe(true);
    expect(res.body[1].isCurrent).toBe(false);
    expect(res.body[0].id).toBeGreaterThan(res.body[1].id);
    expect(res.body[0].author).toBeTypeOf('string');
  });

  it('fetches a single version snapshot; cross-diagram access 404s', async () => {
    const { app, adminToken } = await makeTestServer();
    const a = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'A', snapshot: SNAP });
    const b = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'B', snapshot: { ...SNAP, name: 'B' } });
    const bVersions = await request(app).get(`/api/diagrams/${b.body.id}/versions`).set(auth(adminToken));
    const bVersionId = bVersions.body[0].id;

    const ok = await request(app)
      .get(`/api/diagrams/${b.body.id}/versions/${bVersionId}`).set(auth(adminToken));
    expect(ok.status).toBe(200);
    expect(ok.body.snapshot).toEqual({ ...SNAP, name: 'B' });

    const cross = await request(app)
      .get(`/api/diagrams/${a.body.id}/versions/${bVersionId}`).set(auth(adminToken));
    expect(cross.status).toBe(404);
  });

  it('409s a stale baseVersionId without creating a version; matching base saves', async () => {
    const { app, db, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'C', snapshot: SNAP });
    const id = created.body.id;
    const base = created.body.currentVersionId;

    const second = await request(app)
      .put(`/api/diagrams/${id}`).set(auth(adminToken)).send({ snapshot: SNAP, baseVersionId: base });
    expect(second.status).toBe(200);

    const before = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
    const stale = await request(app)
      .put(`/api/diagrams/${id}`).set(auth(adminToken)).send({ snapshot: SNAP, baseVersionId: base });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersionId).toBe(second.body.currentVersionId);
    expect(stale.body.error).toBe('someone else saved this diagram while you were editing');
    const after = (db.prepare('SELECT COUNT(*) AS n FROM diagram_versions').get() as { n: number }).n;
    expect(after).toBe(before);
  });

  it('PUT without baseVersionId keeps last-write-wins', async () => {
    const { app, adminToken } = await makeTestServer();
    const created = await request(app)
      .post('/api/diagrams').set(auth(adminToken)).send({ groupId: 1, title: 'L', snapshot: SNAP });
    await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
    const res = await request(app).put(`/api/diagrams/${created.body.id}`).set(auth(adminToken)).send({ snapshot: SNAP });
    expect(res.status).toBe(200);
  });
});
