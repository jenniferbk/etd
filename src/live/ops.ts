// Live-collaboration edit operations.
//
// A diagram is synced as a "live doc" in the save-file shape (see
// utils/saveDiagram buildDiagramFile). Edits travel as small operations that
// the server applies in arrival order, so the server's order is the single
// source of truth. Merging is last-writer-wins PER FIELD of an element,
// connection, or note: one person moving a box while another edits its text
// keeps both changes.
//
// The server holds a copy of applyOps (server/src/liveOps.ts). Keep the two
// in step; both have tests pinning the same cases.

export type Collection = 'elements' | 'connections' | 'notes';
export type ScalarKey = 'name' | 'styleConfig' | 'transcript' | 'version';

export const COLLECTIONS: readonly Collection[] = ['elements', 'connections', 'notes'];
export const SCALAR_KEYS: readonly ScalarKey[] = ['name', 'styleConfig', 'transcript', 'version'];

type Entity = { id: string } & Record<string, unknown>;

export type Op =
  /** Create (or fully replace) one item. Appended when new. */
  | { t: 'put'; c: Collection; value: Entity }
  /** Change some fields of an existing item. Ignored if the item is gone,
   *  so an edit racing a delete never resurrects a half-built item.
   *  A field set to null is removed from the item. */
  | { t: 'patch'; c: Collection; id: string; fields: Record<string, unknown> }
  | { t: 'del'; c: Collection; id: string }
  /** Reorder: listed ids that still exist take this order (stacking order for
   *  elements); anything not listed keeps its relative place after them. */
  | { t: 'order'; c: Collection; ids: string[] }
  | { t: 'set'; k: ScalarKey; value: unknown };

export interface LiveDoc {
  version?: string;
  name: string;
  elements: Entity[];
  connections: Entity[];
  notes: Entity[];
  styleConfig?: unknown;
  transcript?: unknown;
  [extra: string]: unknown;
}

function applyOne(doc: LiveDoc, op: Op): LiveDoc {
  if (op.t === 'set') {
    return { ...doc, [op.k]: op.value };
  }
  const list = doc[op.c] ?? [];
  switch (op.t) {
    case 'put': {
      const i = list.findIndex((x) => x.id === op.value.id);
      const next = i === -1 ? [...list, op.value] : list.map((x, j) => (j === i ? op.value : x));
      return { ...doc, [op.c]: next };
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
    case 'del': {
      if (!list.some((x) => x.id === op.id)) return doc;
      return { ...doc, [op.c]: list.filter((x) => x.id !== op.id) };
    }
    case 'order': {
      const byId = new Map(list.map((x) => [x.id, x]));
      const listed: Entity[] = [];
      const seen = new Set<string>();
      for (const id of op.ids) {
        const item = byId.get(id);
        if (item && !seen.has(id)) {
          listed.push(item);
          seen.add(id);
        }
      }
      const rest = list.filter((x) => !seen.has(x.id));
      return { ...doc, [op.c]: [...listed, ...rest] };
    }
  }
}

export function applyOps(doc: LiveDoc, ops: readonly Op[]): LiveDoc {
  let d = doc;
  for (const op of ops) d = applyOne(d, op);
  return d;
}

/** Structural equality for JSON-shaped values. Fast path on reference. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!jsonEqual(ao[k], bo[k])) return false;
  return true;
}

function diffCollection(c: Collection, from: Entity[], to: Entity[]): Op[] {
  const ops: Op[] = [];
  const fromById = new Map(from.map((x) => [x.id, x]));
  const toIds = new Set(to.map((x) => x.id));
  for (const x of from) {
    if (!toIds.has(x.id)) ops.push({ t: 'del', c, id: x.id });
  }
  for (const x of to) {
    const prev = fromById.get(x.id);
    if (!prev) {
      ops.push({ t: 'put', c, value: x });
      continue;
    }
    if (prev === x) continue;
    const fields: Record<string, unknown> = {};
    let changed = false;
    for (const k of new Set([...Object.keys(prev), ...Object.keys(x)])) {
      if (k === 'id') continue;
      const nv = x[k];
      // null and missing are the same on the wire (a null patch removes the field).
      if (prev[k] == null && nv == null) continue;
      if (!jsonEqual(prev[k], nv)) {
        fields[k] = nv === undefined ? null : nv;
        changed = true;
      }
    }
    if (changed) ops.push({ t: 'patch', c, id: x.id, fields });
  }
  // Order: compare the sequence of ids both sides share, after the deletes
  // and appends above. Only emitted when it actually differs.
  const survivingFrom = from.filter((x) => toIds.has(x.id)).map((x) => x.id);
  const appended = to.filter((x) => !fromById.has(x.id)).map((x) => x.id);
  const expected = [...survivingFrom, ...appended];
  const actual = to.map((x) => x.id);
  if (expected.some((id, i) => id !== actual[i])) {
    ops.push({ t: 'order', c, ids: actual });
  }
  return ops;
}

/** The operations that turn `from` into `to`. applyOps(from, diff) equals `to`
 *  (up to undefined-vs-missing fields). */
export function diffDocs(from: LiveDoc, to: LiveDoc): Op[] {
  const ops: Op[] = [];
  for (const c of COLLECTIONS) {
    ops.push(...diffCollection(c, from[c] ?? [], to[c] ?? []));
  }
  for (const k of SCALAR_KEYS) {
    if (!jsonEqual(from[k], to[k])) ops.push({ t: 'set', k, value: to[k] ?? null });
  }
  return ops;
}
