import { describe, expect, it } from 'vitest';
import { SyncEngine } from './syncEngine';
import { applyOps, jsonEqual, type LiveDoc, type Op } from './ops';

const base: LiveDoc = {
  name: 'D', styleConfig: {}, transcript: null, notes: [], connections: [],
  elements: [{ id: 'a', content: 'hello', position: { x: 0, y: 0 } }],
};

/** Minimal in-memory server: applies batches in arrival order and returns
 *  the event every client sees. */
class FakeServer {
  doc: LiveDoc = base;
  apply(clientId: string, batch: { batchId: string; ops: Op[] }) {
    this.doc = applyOps(this.doc, batch.ops);
    return { clientId, ...batch };
  }
}

function patchEl(d: LiveDoc, fields: Record<string, unknown>): LiveDoc {
  return { ...d, elements: d.elements.map((e) => (e.id === 'a' ? { ...e, ...fields } : e)) };
}

describe('SyncEngine', () => {
  it('two clients editing different fields of one element both keep their edit', () => {
    const server = new FakeServer();
    const A = new SyncEngine('A', base);
    const B = new SyncEngine('B', base);
    let localA = patchEl(base, { position: { x: 50, y: 0 } });
    let localB = patchEl(base, { content: 'edited' });

    const ba = A.takeBatch(localA)!;
    const bb = B.takeBatch(localB)!;
    const ea = server.apply('A', ba);
    const eb = server.apply('B', bb);

    // Everyone receives both events in server order.
    for (const ev of [ea, eb]) {
      localA = A.receive(ev, localA) ?? localA;
      localB = B.receive(ev, localB) ?? localB;
    }
    expect(jsonEqual(localA, server.doc)).toBe(true);
    expect(jsonEqual(localB, server.doc)).toBe(true);
    expect(server.doc.elements[0]).toMatchObject({ content: 'edited', position: { x: 50, y: 0 } });
    expect(A.hasPending(localA)).toBe(false);
  });

  it('same field: the edit the server applies last wins on every client', () => {
    const server = new FakeServer();
    const A = new SyncEngine('A', base);
    const B = new SyncEngine('B', base);
    let localA = patchEl(base, { content: 'from A' });
    let localB = patchEl(base, { content: 'from B' });
    const ea = server.apply('A', A.takeBatch(localA)!);
    const eb = server.apply('B', B.takeBatch(localB)!);
    for (const ev of [ea, eb]) {
      localA = A.receive(ev, localA) ?? localA;
      localB = B.receive(ev, localB) ?? localB;
    }
    expect(localA.elements[0].content).toBe('from B');
    expect(localB.elements[0].content).toBe('from B');
  });

  it('unsent local edits survive an incoming remote batch', () => {
    const server = new FakeServer();
    const A = new SyncEngine('A', base);
    const B = new SyncEngine('B', base);
    let localA = patchEl(base, { content: 'typing…' }); // not sent yet
    const localB = { ...base, elements: [...base.elements, { id: 'b', content: 'new' }] };
    const eb = server.apply('B', B.takeBatch(localB)!);
    localA = A.receive(eb, localA)!;
    expect(localA.elements.map((e) => e.content)).toEqual(['typing…', 'new']);
    // And the unsent edit is still queued for sending.
    expect(A.unsent(localA)).toEqual([{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'typing…' } }]);
  });

  it('an edit to an element a teammate deleted does not bring it back', () => {
    const server = new FakeServer();
    const A = new SyncEngine('A', base);
    const B = new SyncEngine('B', base);
    let localA = patchEl(base, { content: 'late' });
    const ea = A.takeBatch(localA)!;
    const eb = server.apply('B', B.takeBatch({ ...base, elements: [] })!);
    localA = A.receive(eb, localA)!;
    server.apply('A', ea);
    expect(localA.elements).toEqual([]);
    expect(server.doc.elements).toEqual([]);
  });

  it('reset folds unechoed batches back into unsent work', () => {
    const A = new SyncEngine('A', base);
    const localA = patchEl(base, { content: 'lost in flight' });
    A.takeBatch(localA);
    const fresh = { ...base, name: 'Renamed elsewhere' };
    const rebuilt = A.reset(fresh, localA);
    expect(rebuilt.name).toBe('Renamed elsewhere');
    expect(rebuilt.elements[0].content).toBe('lost in flight');
    expect(A.inflight).toEqual([]);
    expect(A.takeBatch(rebuilt)?.ops).toEqual([
      { t: 'patch', c: 'elements', id: 'a', fields: { content: 'lost in flight' } },
    ]);
  });

  it('reset drops batches the server already applied, so a resend cannot undo a teammate', () => {
    const server = new FakeServer();
    const A = new SyncEngine('A', base);
    // A moves the box; the server applies it but the echo is lost.
    const localA = patchEl(base, { position: { x: 50, y: 0 } });
    const batch = A.takeBatch(localA)!;
    server.apply('A', batch);
    // B then moves it somewhere else.
    server.doc = applyOps(server.doc, [{ t: 'patch', c: 'elements', id: 'a', fields: { position: { x: 300, y: 0 } } }]);
    const rebuilt = A.reset(server.doc, localA, batch.batchNo);
    expect(rebuilt.elements[0].position).toEqual({ x: 300, y: 0 });
    expect(A.takeBatch(rebuilt)).toBeNull();
  });

  it('discard drops a refused batch but keeps later unsent edits', () => {
    const A = new SyncEngine('A', base);
    const bad = A.takeBatch(patchEl(base, { content: 'refused' }))!;
    const later = patchEl(patchEl(base, { content: 'refused' }), { position: { x: 7, y: 7 } });
    const rebuilt = A.discard(bad.batchId, later);
    expect(rebuilt.elements[0]).toMatchObject({ content: 'hello', position: { x: 7, y: 7 } });
    expect(A.inflight).toEqual([]);
  });

  it('confirm treats a duplicate-acknowledged batch as applied', () => {
    const A = new SyncEngine('A', base);
    const local = patchEl(base, { content: 'x' });
    const b = A.takeBatch(local)!;
    A.confirm(b.batchId);
    expect(A.hasPending(local)).toBe(false);
  });
});
