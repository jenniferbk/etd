// Server copy of the live-collaboration operation semantics.
// MUST stay in step with src/live/ops.ts (applyOps) in the frontend; both
// test suites pin the same cases. The server never diffs, it only applies.
import { z } from 'zod';

export type Collection = 'elements' | 'connections' | 'notes';
type Entity = { id: string } & Record<string, unknown>;

const collection = z.enum(['elements', 'connections', 'notes']);
const entity = z.looseObject({ id: z.string().min(1) });

export const opSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('put'), c: collection, value: entity }),
  z.object({ t: z.literal('patch'), c: collection, id: z.string().min(1), fields: z.record(z.string(), z.unknown()) }),
  z.object({ t: z.literal('del'), c: collection, id: z.string().min(1) }),
  z.object({ t: z.literal('order'), c: collection, ids: z.array(z.string()) }),
  z.object({ t: z.literal('set'), k: z.enum(['name', 'styleConfig', 'transcript', 'version']), value: z.unknown() }),
]);

export type Op = z.infer<typeof opSchema>;

export interface LiveDoc {
  name?: unknown;
  elements: Entity[];
  connections: Entity[];
  notes: Entity[];
  [key: string]: unknown;
}

/** Coerce a stored snapshot into a LiveDoc (missing collections → []). */
export function toLiveDoc(snapshot: unknown): LiveDoc {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Entity[]) : []);
  return { ...s, elements: arr(s.elements), connections: arr(s.connections), notes: arr(s.notes) };
}

function applyOne(doc: LiveDoc, op: Op): LiveDoc {
  if (op.t === 'set') return { ...doc, [op.k]: op.value };
  const list = doc[op.c];
  switch (op.t) {
    case 'put': {
      const value = op.value as Entity;
      const i = list.findIndex((x) => x.id === value.id);
      return { ...doc, [op.c]: i === -1 ? [...list, value] : list.map((x, j) => (j === i ? value : x)) };
    }
    case 'patch': {
      const i = list.findIndex((x) => x.id === op.id);
      if (i === -1) return doc;
      const merged: Entity = { ...list[i] };
      for (const [k, v] of Object.entries(op.fields)) {
        if (k === 'id') continue;
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      return { ...doc, [op.c]: list.map((x, j) => (j === i ? merged : x)) };
    }
    case 'del':
      if (!list.some((x) => x.id === op.id)) return doc;
      return { ...doc, [op.c]: list.filter((x) => x.id !== op.id) };
    case 'order': {
      const byId = new Map(list.map((x) => [x.id, x]));
      const seen = new Set<string>();
      const listed: Entity[] = [];
      for (const id of op.ids) {
        const item = byId.get(id);
        if (item && !seen.has(id)) {
          listed.push(item);
          seen.add(id);
        }
      }
      return { ...doc, [op.c]: [...listed, ...list.filter((x) => !seen.has(x.id))] };
    }
  }
}

export function applyOps(doc: LiveDoc, ops: readonly Op[]): LiveDoc {
  let d = doc;
  for (const op of ops) d = applyOne(d, op);
  return d;
}

/**
 * Deletes for connections left pointing at something that no longer exists
 * (one person deletes a box while another draws an arrow to it). Returned as
 * ops so they are broadcast like any other edit and every client converges.
 */
export function danglingConnectionOps(doc: LiveDoc): Op[] {
  const elementIds = new Set(doc.elements.map((e) => e.id));
  const live = new Map(doc.connections.map((c) => [c.id, c]));
  const removed: string[] = [];
  // Repeat until stable: removing one connection can strand another that
  // was attached to it.
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of live.values()) {
      const to = c.to as unknown;
      const fromOk = typeof c.from === 'string' && elementIds.has(c.from);
      const toOk =
        typeof to === 'string'
          ? elementIds.has(to)
          : typeof to === 'object' && to !== null &&
            live.has(String((to as { connectionId?: unknown }).connectionId));
      if (!fromOk || !toOk) {
        live.delete(c.id);
        removed.push(c.id);
        changed = true;
      }
    }
  }
  const order = new Map(doc.connections.map((c, i) => [c.id, i]));
  removed.sort((a, b) => order.get(a)! - order.get(b)!);
  return removed.map((id) => ({ t: 'del', c: 'connections', id }));
}
