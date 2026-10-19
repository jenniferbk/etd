/* eslint-disable @typescript-eslint/no-explicit-any -- SSE frames in these tests are free-form JSON */
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { auth, makeTestServer } from '../../test/helpers.js';

const SNAP = {
  version: '1.8', name: 'Live', styleConfig: {}, transcript: null, notes: [],
  elements: [{ id: 'a', content: 'A' }, { id: 'b', content: 'B' }],
  connections: [{ id: 'ab', from: 'a', to: 'b', type: 'support' }],
};

interface Frame { event: string; data: any }

/** Minimal SSE consumer over fetch (what the browser client does too). */
class Stream {
  frames: Frame[] = [];
  private ctrl = new AbortController();
  private waiters: (() => void)[] = [];
  ready: Promise<void>;

  constructor(base: string, id: number, token: string, clientId: string) {
    this.ready = (async () => {
      const res = await fetch(`${base}/api/diagrams/${id}/live?clientId=${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: this.ctrl.signal,
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i: number;
            while ((i = buf.indexOf('\n\n')) !== -1) {
              const raw = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const ev = /^event: (.*)$/m.exec(raw)?.[1];
              const data = /^data: (.*)$/m.exec(raw)?.[1];
              if (ev && data) this.frames.push({ event: ev, data: JSON.parse(data) });
              this.waiters.splice(0).forEach((w) => w());
            }
          }
        } catch { /* aborted */ }
      })();
    })();
  }

  async next(event: string, pred: (d: any) => boolean = () => true): Promise<any> {
    for (let tries = 0; tries < 200; tries++) {
      const f = this.frames.find((x) => x.event === event && pred(x.data));
      if (f) {
        this.frames.splice(this.frames.indexOf(f), 1);
        return f.data;
      }
      await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 25); });
    }
    throw new Error(`timed out waiting for ${event}`);
  }

  close() { this.ctrl.abort(); }
}

let servers: Server[] = [];
let streams: Stream[] = [];
afterEach(() => {
  streams.forEach((s) => s.close());
  servers.forEach((s) => s.closeAllConnections());
  servers.forEach((s) => s.close());
  servers = [];
  streams = [];
});

async function setup(live = { flushDelayMs: 30, maxFlushDelayMs: 200 }) {
  const t = await makeTestServer({ live });
  const server = t.app.listen(0);
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const created = await request(t.app).post('/api/diagrams').set(auth(t.adminToken))
    .send({ groupId: 1, title: 'Live', snapshot: SNAP });
  const open = (clientId: string) => {
    const s = new Stream(base, created.body.id, t.adminToken, clientId);
    streams.push(s);
    return s;
  };
  const post = (clientId: string, batchId: string, ops: unknown[]) =>
    request(t.app).post(`/api/diagrams/${created.body.id}/live/ops`).set(auth(t.adminToken))
      .send({ clientId, batchId, ops });
  return { ...t, id: created.body.id as number, firstVersion: created.body.currentVersionId as number, open, post };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('live collaboration', () => {
  it('streams the document, then every batch to every client in one order', async () => {
    const { open, post, app, adminToken, id } = await setup();
    const A = open('client-A-0001');
    const B = open('client-B-0001');
    expect((await A.next('hello')).doc.elements).toHaveLength(2);
    await B.next('hello');

    expect((await post('client-A-0001', 'A:1', [{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'A2' } }])).status).toBe(200);
    expect((await post('client-B-0001', 'B:1', [{ t: 'patch', c: 'elements', id: 'a', fields: { position: { x: 9, y: 9 } } }])).status).toBe(200);

    for (const s of [A, B]) {
      const first = await s.next('ops');
      const second = await s.next('ops');
      expect([first.batchId, second.batchId]).toEqual(['A:1', 'B:1']);
      expect(second.seq).toBe(first.seq + 1);
    }
    const opened = await request(app).get(`/api/diagrams/${id}`).set(auth(adminToken));
    expect(opened.body.snapshot.elements[0]).toEqual({ id: 'a', content: 'A2', position: { x: 9, y: 9 } });
  });

  it('autosaves into one version per editing window; Save adds a new version', async () => {
    const { open, post, db, id, firstVersion, app, adminToken } = await setup();
    const A = open('client-A-0002');
    await A.next('hello');
    await post('client-A-0002', 'A:1', [{ t: 'set', k: 'name', value: 'Renamed live' }]);
    const p1 = await A.next('persisted');
    expect(p1.currentVersionId).not.toBe(firstVersion);
    await post('client-A-0002', 'A:2', [{ t: 'del', c: 'elements', id: 'b' }]);
    const p2 = await A.next('persisted');
    expect(p2.currentVersionId).toBe(p1.currentVersionId); // coalesced
    const versions = db.prepare('SELECT id, auto FROM diagram_versions WHERE diagram_id = ? ORDER BY id').all(id);
    expect(versions).toEqual([{ id: firstVersion, auto: 0 }, { id: p1.currentVersionId, auto: 1 }]);
    const title = db.prepare('SELECT title FROM diagrams WHERE id = ?').get(id) as { title: string };
    expect(title.title).toBe('Renamed live');

    const cp = await request(app).post(`/api/diagrams/${id}/checkpoint`).set(auth(adminToken));
    expect(cp.body.currentVersionId).toBeGreaterThan(p2.currentVersionId);
    const list = await request(app).get(`/api/diagrams/${id}/versions`).set(auth(adminToken));
    expect(list.body.map((v: { auto: boolean }) => v.auto)).toEqual([false, true, false]);
  });

  it('removes arrows stranded by a delete and tells everyone', async () => {
    const { open, post } = await setup();
    const A = open('client-A-0003');
    await A.next('hello');
    await post('client-A-0003', 'A:1', [{ t: 'del', c: 'elements', id: 'b' }]);
    await A.next('ops', (d) => d.batchId === 'A:1');
    const cleanup = await A.next('ops', (d) => d.clientId === 'server');
    expect(cleanup.ops).toEqual([{ t: 'del', c: 'connections', id: 'ab' }]);
  });

  it('presence lists who is here and their selection', async () => {
    const { open, app, adminToken, id } = await setup();
    const A = open('client-A-0004');
    await A.next('hello');
    const B = open('client-B-0004');
    await B.next('hello');
    const two = await A.next('presence', (d) => d.members.length === 2);
    expect(two.members[0].color).not.toBe(two.members[1].color);
    await request(app).post(`/api/diagrams/${id}/live/presence`).set(auth(adminToken))
      .send({ clientId: 'client-B-0004', selectedIds: ['a'] });
    const sel = await A.next('presence', (d) => d.members.some((m: { selectedIds: string[] }) => m.selectedIds[0] === 'a'));
    expect(sel.members).toHaveLength(2);
    B.close();
    await A.next('presence', (d) => d.members.length === 1);
  });

  it('a stale full save conflicts while the diagram is open; a forced one resets everyone', async () => {
    const { open, app, adminToken, id, firstVersion } = await setup();
    const A = open('client-A-0005');
    await A.next('hello');
    const stale = await request(app).put(`/api/diagrams/${id}`).set(auth(adminToken))
      .send({ snapshot: { ...SNAP, name: 'old tab' }, baseVersionId: firstVersion });
    expect(stale.status).toBe(409);
    const forced = await request(app).put(`/api/diagrams/${id}`).set(auth(adminToken))
      .send({ snapshot: { ...SNAP, name: 'restored' } });
    expect(forced.status).toBe(200);
    const reset = await A.next('reset');
    expect(reset.doc.name).toBe('restored');
  });

  it('trashing the diagram tells open clients it is gone', async () => {
    const { open, app, adminToken, id } = await setup();
    const A = open('client-A-0006');
    await A.next('hello');
    await request(app).delete(`/api/diagrams/${id}`).set(auth(adminToken));
    expect((await A.next('gone')).reason).toBe('trashed');
  });

  it('saves when the last person leaves, even before the autosave delay', async () => {
    const { open, post, app, adminToken, id } = await setup({ flushDelayMs: 60_000, maxFlushDelayMs: 60_000 });
    const A = open('client-A-0007');
    await A.next('hello');
    await post('client-A-0007', 'A:1', [{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'kept' } }]);
    await A.next('ops');
    A.close();
    await sleep(100);
    const opened = await request(app).get(`/api/diagrams/${id}`).set(auth(adminToken));
    expect(opened.body.snapshot.elements[0].content).toBe('kept');
  });

  it('skips a batch number the client already had applied and reports it in hello', async () => {
    const { open, post, app, adminToken, id } = await setup();
    const send = (batchNo: number, x: number) =>
      request(app).post(`/api/diagrams/${id}/live/ops`).set(auth(adminToken)).send({
        clientId: 'client-A-0009', batchId: `A:${batchNo}`, batchNo,
        ops: [{ t: 'patch', c: 'elements', id: 'a', fields: { position: { x, y: 0 } } }],
      });
    expect((await send(1, 10)).body.seq).toBeTypeOf('number');
    await post('client-B-0009', 'B:1', [{ t: 'patch', c: 'elements', id: 'a', fields: { position: { x: 99, y: 0 } } }]);
    expect((await send(1, 10)).body).toEqual({ duplicate: true });
    const A = open('client-A-0009');
    const hello = await A.next('hello');
    expect(hello.lastBatchNo).toBe(1);
    expect(hello.doc.elements[0].position).toEqual({ x: 99, y: 0 });
  });

  it('rejects malformed batches', async () => {
    const { post } = await setup();
    expect((await post('client-A-0008', 'A:1', [{ t: 'set', k: 'constructor', value: 1 }])).status).toBe(400);
    expect((await post('short', 'A:1', [{ t: 'del', c: 'elements', id: 'a' }])).status).toBe(400);
  });
});

describe('cursors, summon, and chat', () => {
  it('cursor moves go to everyone else, not back to the sender', async () => {
    const { open, app, adminToken, id } = await setup();
    const A = open('client-A-0100');
    await A.next('hello');
    const B = open('client-B-0100');
    await B.next('hello');
    const res = await request(app).post(`/api/diagrams/${id}/live/cursor`).set(auth(adminToken))
      .send({ clientId: 'client-B-0100', x: 120.5, y: -40 });
    expect(res.status).toBe(204);
    const moved = await A.next('cursor');
    expect(moved).toEqual({ clientId: 'client-B-0100', x: 120.5, y: -40 });
    await request(app).post(`/api/diagrams/${id}/live/cursor`).set(auth(adminToken))
      .send({ clientId: 'client-B-0100', x: null, y: null });
    expect(await A.next('cursor')).toEqual({ clientId: 'client-B-0100', x: null, y: null });
    await sleep(50);
    expect(B.frames.some((f) => f.event === 'cursor')).toBe(false);
  });

  it('rejects a cursor from a tab that is not connected', async () => {
    const { app, adminToken, id } = await setup();
    const res = await request(app).post(`/api/diagrams/${id}/live/cursor`).set(auth(adminToken))
      .send({ clientId: 'client-Z-0100', x: 1, y: 1 });
    expect(res.status).toBe(409);
  });

  it('summon goes to the named person (every tab but the sender) with the view and who sent it', async () => {
    const { open, app, adminToken, id } = await setup();
    const A = open('client-A-0101');
    const ahello = await A.next('hello');
    const B = open('client-B-0101');
    await B.next('hello');
    const C = open('client-C-0101');
    await C.next('hello');
    const view = { x: 10, y: 20, width: 800, height: 600 };
    const res = await request(app).post(`/api/diagrams/${id}/live/summon`).set(auth(adminToken))
      .send({ clientId: 'client-A-0101', toUserId: 1, view });
    expect(res.status).toBe(204);
    for (const s of [B, C]) {
      const got = await s.next('summon');
      expect(got).toEqual({ from: { clientId: 'client-A-0101', name: expect.any(String), color: ahello.you.color }, view });
    }
    await sleep(50);
    expect(A.frames.some((f) => f.event === 'summon')).toBe(false);
  });

  it('summon without a person goes to everyone else; a stranger id goes to nobody', async () => {
    const { open, app, adminToken, id } = await setup();
    const A = open('client-A-0102');
    await A.next('hello');
    const B = open('client-B-0102');
    await B.next('hello');
    const view = { x: 0, y: 0, width: 100, height: 100 };
    await request(app).post(`/api/diagrams/${id}/live/summon`).set(auth(adminToken))
      .send({ clientId: 'client-A-0102', view });
    await B.next('summon');
    await request(app).post(`/api/diagrams/${id}/live/summon`).set(auth(adminToken))
      .send({ clientId: 'client-A-0102', toUserId: 999, view });
    await sleep(50);
    expect(B.frames.some((f) => f.event === 'summon')).toBe(false);
  });

  it('chat messages are saved, listed oldest first, and broadcast to the room', async () => {
    const { open, app, adminToken, id } = await setup();
    const A = open('client-A-0103');
    await A.next('hello');
    const sent = await request(app).post(`/api/diagrams/${id}/chat`).set(auth(adminToken)).send({ body: '  look at warrant 3  ' });
    expect(sent.status).toBe(200);
    const live = await A.next('chat');
    expect(live).toMatchObject({ id: sent.body.id, body: 'look at warrant 3', authorId: 1 });
    expect(live.author).toBeTypeOf('string');
    expect(live.createdAt).toBeTypeOf('string');
    await request(app).post(`/api/diagrams/${id}/chat`).set(auth(adminToken)).send({ body: 'second' });
    const list = await request(app).get(`/api/diagrams/${id}/chat`).set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.map((m: { body: string }) => m.body)).toEqual(['look at warrant 3', 'second']);
  });

  it('chat works when nobody has the diagram open, and rejects empty or huge messages', async () => {
    const { app, adminToken, id } = await setup();
    expect((await request(app).post(`/api/diagrams/${id}/chat`).set(auth(adminToken)).send({ body: 'hi' })).status).toBe(200);
    expect((await request(app).post(`/api/diagrams/${id}/chat`).set(auth(adminToken)).send({ body: '   ' })).status).toBe(400);
    expect((await request(app).post(`/api/diagrams/${id}/chat`).set(auth(adminToken)).send({ body: 'x'.repeat(4001) })).status).toBe(400);
    expect((await request(app).get(`/api/diagrams/${id}/chat`).set(auth(adminToken))).body).toHaveLength(1);
  });

  it('non-members cannot read or post chat', async () => {
    const { app, adminToken, id } = await setup();
    const g2 = await request(app).post('/api/groups').set(auth(adminToken)).send({ name: 'Other' });
    const inv = await request(app).post('/api/invites').set(auth(adminToken)).send({ groupId: g2.body.id });
    const reg = await request(app).post('/api/auth/register').send({
      inviteToken: inv.body.token, email: 'out@uga.edu', password: 'longenough', displayName: 'Out', acceptedPolicy: true,
    });
    const outsider = reg.body.token as string;
    expect((await request(app).get(`/api/diagrams/${id}/chat`).set(auth(outsider))).status).toBe(403);
    expect((await request(app).post(`/api/diagrams/${id}/chat`).set(auth(outsider)).send({ body: 'hi' })).status).toBe(403);
  });
});
