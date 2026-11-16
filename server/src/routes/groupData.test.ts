/* eslint-disable @typescript-eslint/no-explicit-any -- SSE frames are free-form JSON */
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LiveRooms } from '../live.js';
import { auth, makeTestServer } from '../../test/helpers.js';

const SNAP = {
  version: '1.9', name: 'D', styleConfig: {}, transcript: null, notes: [], connections: [],
  elements: [{ id: 'a', content: 'A' }],
};
const patch = (content: string) => [{ t: 'patch', c: 'elements', id: 'a', fields: { content } }];

let servers: Server[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  servers.forEach((s) => s.closeAllConnections());
  servers.forEach((s) => s.close());
  servers = [];
});

async function setup() {
  const t = await makeTestServer({ live: { flushDelayMs: 30, maxFlushDelayMs: 200 } });
  const mk = async (title: string, groupId = 1) =>
    (await request(t.app).post('/api/diagrams').set(auth(t.adminToken)).send({ groupId, title, snapshot: SNAP })).body.id as number;
  return { ...t, mk };
}

describe('group data endpoints', () => {
  it('GET data returns non-trashed diagrams with snapshots', async () => {
    const { app, adminToken, mk } = await setup();
    const a = await mk('One');
    const b = await mk('Two');
    await request(app).delete(`/api/diagrams/${b}`).set(auth(adminToken));
    const r = await request(app).get('/api/groups/1/data').set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.diagrams.map((d: any) => d.id)).toEqual([a]);
    expect(r.body.diagrams[0]).toMatchObject({ title: 'One', folderId: null, snapshot: SNAP });
    expect(r.body.diagrams[0].currentVersionId).toBeTypeOf('number');
  });

  it('apply writes one labeled version per diagram', async () => {
    const { app, adminToken, mk } = await setup();
    const a = await mk('One');
    const r = await request(app).post('/api/groups/1/data/apply').set(auth(adminToken))
      .send({ label: 'Import from x.xlsx', edits: [{ diagramId: a, ops: patch('A2') }] });
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(1);
    const versions = await request(app).get(`/api/diagrams/${a}/versions`).set(auth(adminToken));
    expect(versions.body[0].label).toBe('Import from x.xlsx');
    expect(versions.body[0].id).toBe(r.body.results[0].versionId);
    const opened = await request(app).get(`/api/diagrams/${a}`).set(auth(adminToken));
    expect(opened.body.snapshot.elements[0].content).toBe('A2');
  });

  it('apply rejects a diagram from another group before changing anything', async () => {
    const { app, adminToken, mk } = await setup();
    const g2 = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' });
    const a = await mk('One');
    const other = await mk('Elsewhere', g2.body.id);
    const r = await request(app).post('/api/groups/1/data/apply').set(auth(adminToken))
      .send({ label: 'L', edits: [{ diagramId: a, ops: patch('X') }, { diagramId: other, ops: patch('Y') }] });
    expect(r.status).toBe(400);
    expect(r.body.diagramId).toBe(other);
    const versions = await request(app).get(`/api/diagrams/${a}/versions`).set(auth(adminToken));
    expect(versions.body).toHaveLength(1);
  });

  it('apply answers 410 for a trashed diagram', async () => {
    const { app, adminToken, mk } = await setup();
    const a = await mk('One');
    await request(app).delete(`/api/diagrams/${a}`).set(auth(adminToken));
    const r = await request(app).post('/api/groups/1/data/apply').set(auth(adminToken))
      .send({ label: 'L', edits: [{ diagramId: a, ops: patch('X') }] });
    expect(r.status).toBe(410);
    expect(r.body.diagramId).toBe(a);
  });

  it('open live client receives applied ops', async () => {
    const t = await setup();
    const server = t.app.listen(0);
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const a = await t.mk('Live');
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/diagrams/${a}/live?clientId=client-watch-01`, {
      headers: { Authorization: `Bearer ${t.adminToken}` }, signal: ctrl.signal,
    });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const readUntil = async (needle: string) => {
      for (let i = 0; i < 100 && !buf.includes(needle); i++) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil('event: hello');
    const r = await request(t.app).post('/api/groups/1/data/apply').set(auth(t.adminToken))
      .send({ label: 'Import', edits: [{ diagramId: a, ops: patch('Live2') }] });
    expect(r.status).toBe(200);
    await readUntil('event: ops');
    ctrl.abort();
    const frame = buf.split('\n\n').find((f) => f.startsWith('event: ops'))!;
    expect(frame).toBeDefined();
    expect(JSON.parse(/^data: (.*)$/m.exec(frame)![1]).ops).toEqual(patch('Live2'));
  });

  it('autosaves a teammate\'s unsaved edit first so the labeled version holds the import on top', async () => {
    const t = await setup();
    const server = t.app.listen(0);
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const a = await t.mk('Live');
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/diagrams/${a}/live?clientId=client-watch-02`, {
      headers: { Authorization: `Bearer ${t.adminToken}` }, signal: ctrl.signal,
    });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (!buf.includes('event: hello')) buf += dec.decode((await reader.read()).value, { stream: true });
    const teammate = [{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'Teammate' } }];
    await request(t.app).post(`/api/diagrams/${a}/live/ops`).set(auth(t.adminToken))
      .send({ clientId: 'client-watch-02', batchId: 'T:1', ops: teammate });
    const r = await request(t.app).post('/api/groups/1/data/apply').set(auth(t.adminToken))
      .send({ label: 'Import', edits: [{ diagramId: a, ops: [{ t: 'patch', c: 'elements', id: 'a', fields: { note: 'imp' } }] }] });
    expect(r.status).toBe(200);
    const versions = (await request(t.app).get(`/api/diagrams/${a}/versions`).set(auth(t.adminToken))).body;
    expect(versions[0].label).toBe('Import');
    expect(versions).toHaveLength(3); // original, pre-import autosave, labeled
    const snap = async (v: number) =>
      (await request(t.app).get(`/api/diagrams/${a}/versions/${v}`).set(auth(t.adminToken))).body.snapshot.elements[0];
    expect(await snap(versions[1].id)).toEqual({ id: 'a', content: 'Teammate' });
    expect(await snap(versions[0].id)).toEqual({ id: 'a', content: 'Teammate', note: 'imp' });
    ctrl.abort();
  });

  it('a mid-batch failure keeps earlier results, reports the failure, and leaks no room', async () => {
    const { app, adminToken, mk } = await setup();
    const a = await mk('One');
    const b = await mk('Two');
    const real = LiveRooms.prototype.applyAndSave;
    vi.spyOn(LiveRooms.prototype, 'applyAndSave').mockImplementation(function (this: LiveRooms, id, ...rest) {
      if (id === b) throw new Error('boom');
      return real.call(this, id, ...rest);
    });
    const r = await request(app).post('/api/groups/1/data/apply').set(auth(adminToken))
      .send({ label: 'L', edits: [{ diagramId: a, ops: patch('A2') }, { diagramId: b, ops: patch('B2') }] });
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: any) => x.diagramId)).toEqual([a]);
    expect(r.body.failed).toEqual([{ diagramId: b, error: 'boom' }]);
    // all failing -> 500
    const r2 = await request(app).post('/api/groups/1/data/apply').set(auth(adminToken))
      .send({ label: 'L', edits: [{ diagramId: b, ops: patch('B3') }] });
    expect(r2.status).toBe(500);
  });

  it('merges duplicate diagram ids into one labeled version', async () => {
    const { app, adminToken, mk } = await setup();
    const a = await mk('One');
    const r = await request(app).post('/api/groups/1/data/apply').set(auth(adminToken))
      .send({ label: 'L', edits: [{ diagramId: a, ops: patch('first') }, { diagramId: a, ops: patch('second') }] });
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(1);
    const versions = await request(app).get(`/api/diagrams/${a}/versions`).set(auth(adminToken));
    expect(versions.body).toHaveLength(2);
    const opened = await request(app).get(`/api/diagrams/${a}`).set(auth(adminToken));
    expect(opened.body.snapshot.elements[0].content).toBe('second');
  });
});
