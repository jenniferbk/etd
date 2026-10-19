import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, makeTestServer } from '../../test/helpers.js';

const SNAP = { version: '1.6', name: 'Test', elements: [], connections: [], styleConfig: {}, transcript: null };

async function registerMember(app: import('express').Express, adminToken: string, email: string, groupId = 1): Promise<string> {
  const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId });
  const reg = await request(app).post('/api/auth/register').send({
    inviteToken: inv.body.token, email, password: 'longenough', displayName: email, acceptedPolicy: true,
  });
  return reg.body.token as string;
}

async function newDiagram(app: import('express').Express, token: string, title: string, folderId?: number): Promise<number> {
  const res = await request(app).post('/api/diagrams').set(auth(token))
    .send({ groupId: 1, title, snapshot: SNAP, ...(folderId !== undefined ? { folderId } : {}) });
  expect(res.status).toBe(200);
  return res.body.id as number;
}

describe('folders', () => {
  it('a member creates, lists, and renames a folder', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'peer@uga.edu');
    const created = await request(app).post('/api/groups/1/folders').set(auth(member)).send({ name: '  Ava lessons ' });
    expect(created.status).toBe(200);
    const folderId = created.body.id as number;

    const list = await request(app).get('/api/groups/1/folders').set(auth(member));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: folderId, name: 'Ava lessons', diagramCount: 0 }]);

    const renamed = await request(app).patch(`/api/folders/${folderId}`).set(auth(member)).send({ name: 'Ava' });
    expect(renamed.status).toBe(200);
    const list2 = await request(app).get('/api/groups/1/folders').set(auth(member));
    expect(list2.body[0].name).toBe('Ava');
  });

  it('folder names are unique within a group, ignoring case', async () => {
    const { app, adminToken } = await makeTestServer();
    await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'Year 2' });
    const dup = await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'year 2' });
    expect(dup.status).toBe(409);
    const empty = await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: '   ' });
    expect(empty.status).toBe(400);
  });

  it('folders are listed by name and count only live diagrams', async () => {
    const { app, adminToken } = await makeTestServer();
    const b = (await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'B' })).body.id;
    const a = (await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'a' })).body.id;
    await newDiagram(app, adminToken, 'one', b);
    const trashed = await newDiagram(app, adminToken, 'two', b);
    await request(app).delete(`/api/diagrams/${trashed}`).set(auth(adminToken));
    const list = await request(app).get('/api/groups/1/folders').set(auth(adminToken));
    expect(list.body).toEqual([
      { id: a, name: 'a', diagramCount: 0 },
      { id: b, name: 'B', diagramCount: 1 },
    ]);
  });

  it('moves a diagram into and out of a folder without counting as an edit', async () => {
    const { app, adminToken } = await makeTestServer();
    const folderId = (await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'F' })).body.id;
    const id = await newDiagram(app, adminToken, 'D');
    const before = (await request(app).get('/api/groups/1/diagrams').set(auth(adminToken))).body[0];
    expect(before.folderId).toBeNull();

    const moved = await request(app).patch(`/api/diagrams/${id}`).set(auth(adminToken)).send({ folderId });
    expect(moved.status).toBe(200);
    const after = (await request(app).get('/api/groups/1/diagrams').set(auth(adminToken))).body[0];
    expect(after.folderId).toBe(folderId);
    expect(after.updatedAt).toBe(before.updatedAt);

    await request(app).patch(`/api/diagrams/${id}`).set(auth(adminToken)).send({ folderId: null });
    expect((await request(app).get('/api/groups/1/diagrams').set(auth(adminToken))).body[0].folderId).toBeNull();
  });

  it('creates a diagram directly inside a folder', async () => {
    const { app, adminToken } = await makeTestServer();
    const folderId = (await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'F' })).body.id;
    await newDiagram(app, adminToken, 'D', folderId);
    expect((await request(app).get('/api/groups/1/diagrams').set(auth(adminToken))).body[0].folderId).toBe(folderId);
  });

  it('rejects a folder from another group', async () => {
    const { app, adminToken } = await makeTestServer();
    const g2 = (await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' })).body.id;
    const otherFolder = (await request(app).post(`/api/groups/${g2}/folders`).set(auth(adminToken)).send({ name: 'X' })).body.id;
    const id = await newDiagram(app, adminToken, 'D');
    expect((await request(app).patch(`/api/diagrams/${id}`).set(auth(adminToken)).send({ folderId: otherFolder })).status).toBe(400);
    expect((await request(app).post('/api/diagrams').set(auth(adminToken))
      .send({ groupId: 1, title: 'E', snapshot: SNAP, folderId: otherFolder })).status).toBe(400);
  });

  it('deleting a folder moves its diagrams, trashed ones too, back to the top level', async () => {
    const { app, adminToken } = await makeTestServer();
    const member = await registerMember(app, adminToken, 'peer@uga.edu');
    const folderId = (await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'F' })).body.id;
    const live = await newDiagram(app, adminToken, 'live', folderId);
    const gone = await newDiagram(app, adminToken, 'gone', folderId);
    await request(app).delete(`/api/diagrams/${gone}`).set(auth(adminToken));

    const del = await request(app).delete(`/api/folders/${folderId}`).set(auth(member));
    expect(del.status).toBe(204);
    expect((await request(app).get('/api/groups/1/folders').set(auth(adminToken))).body).toEqual([]);
    const list = (await request(app).get('/api/groups/1/diagrams').set(auth(adminToken))).body;
    expect(list.find((d: { id: number }) => d.id === live).folderId).toBeNull();

    await request(app).post(`/api/diagrams/${gone}/restore`).set(auth(adminToken));
    const list2 = (await request(app).get('/api/groups/1/diagrams').set(auth(adminToken))).body;
    expect(list2.find((d: { id: number }) => d.id === gone).folderId).toBeNull();
  });

  it('non-members get 403 on every folder route', async () => {
    const { app, adminToken } = await makeTestServer();
    const folderId = (await request(app).post('/api/groups/1/folders').set(auth(adminToken)).send({ name: 'F' })).body.id;
    const g2 = (await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' })).body.id;
    const outsider = await registerMember(app, adminToken, 'out@uga.edu', g2);
    expect((await request(app).get('/api/groups/1/folders').set(auth(outsider))).status).toBe(403);
    expect((await request(app).post('/api/groups/1/folders').set(auth(outsider)).send({ name: 'Y' })).status).toBe(403);
    expect((await request(app).patch(`/api/folders/${folderId}`).set(auth(outsider)).send({ name: 'Y' })).status).toBe(403);
    expect((await request(app).delete(`/api/folders/${folderId}`).set(auth(outsider))).status).toBe(403);
  });

  it('the diagram list includes creator and created time', async () => {
    const { app, adminToken } = await makeTestServer();
    await newDiagram(app, adminToken, 'D');
    const item = (await request(app).get('/api/groups/1/diagrams').set(auth(adminToken))).body[0];
    expect(item.creator).toBeTypeOf('string');
    expect(item.createdAt).toBeTypeOf('string');
  });
});
