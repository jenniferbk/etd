import { describe, expect, it } from 'vitest';
import { applyOps, diffDocs, jsonEqual, type LiveDoc, type Op } from './ops';

function doc(partial: Partial<LiveDoc> = {}): LiveDoc {
  return { name: 'D', elements: [], connections: [], notes: [], styleConfig: { a: 1 }, transcript: null, ...partial };
}
const el = (id: string, extra: Record<string, unknown> = {}) => ({ id, content: id, position: { x: 0, y: 0 }, ...extra });

describe('applyOps', () => {
  it('put appends a new item and replaces an existing one', () => {
    let d = applyOps(doc(), [{ t: 'put', c: 'elements', value: el('a') }]);
    d = applyOps(d, [{ t: 'put', c: 'elements', value: el('b') }, { t: 'put', c: 'elements', value: el('a', { content: 'A' }) }]);
    expect(d.elements.map((e) => [e.id, e.content])).toEqual([['a', 'A'], ['b', 'b']]);
  });

  it('patch merges fields; two patches to different fields both survive', () => {
    let d = doc({ elements: [el('a')] });
    d = applyOps(d, [{ t: 'patch', c: 'elements', id: 'a', fields: { position: { x: 5, y: 6 } } }]);
    d = applyOps(d, [{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'edited' } }]);
    expect(d.elements[0]).toEqual({ id: 'a', content: 'edited', position: { x: 5, y: 6 } });
  });

  it('patch on a deleted item is a no-op (no resurrection)', () => {
    const d = applyOps(doc({ elements: [el('a')] }), [
      { t: 'del', c: 'elements', id: 'a' },
      { t: 'patch', c: 'elements', id: 'a', fields: { content: 'late edit' } },
    ]);
    expect(d.elements).toEqual([]);
  });

  it('a null field in a patch removes that field', () => {
    const d = applyOps(doc({ elements: [el('a', { image: 'data:x' })] }), [
      { t: 'patch', c: 'elements', id: 'a', fields: { image: null } },
    ]);
    expect('image' in d.elements[0]).toBe(false);
  });

  it('order keeps unknown ids out and unlisted items after the listed ones', () => {
    const d = applyOps(doc({ elements: [el('a'), el('b'), el('c')] }), [
      { t: 'order', c: 'elements', ids: ['c', 'zz', 'a'] },
    ]);
    expect(d.elements.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('set replaces a scalar key', () => {
    expect(applyOps(doc(), [{ t: 'set', k: 'name', value: 'New' }]).name).toBe('New');
  });

  it('does not mutate its input', () => {
    const d = doc({ elements: [el('a')] });
    const frozen = JSON.stringify(d);
    applyOps(d, [{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'x' } }, { t: 'del', c: 'elements', id: 'a' }]);
    expect(JSON.stringify(d)).toBe(frozen);
  });
});

describe('diffDocs', () => {
  const roundTrip = (a: LiveDoc, b: LiveDoc) => {
    const ops = diffDocs(a, b);
    expect(jsonEqual(applyOps(a, ops), b)).toBe(true);
    return ops;
  };

  it('is empty for equal docs', () => {
    expect(diffDocs(doc({ elements: [el('a')] }), doc({ elements: [el('a')] }))).toEqual([]);
  });

  it('emits field-level patches, not whole items', () => {
    const ops = roundTrip(doc({ elements: [el('a', { image: 'BIG' })] }), doc({ elements: [el('a', { image: 'BIG', content: 'new' })] }));
    expect(ops).toEqual([{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'new' } }]);
  });

  it('handles adds, deletes, removed fields, reorders and scalars together', () => {
    const a = doc({ elements: [el('a', { image: 'x' }), el('b'), el('c')], notes: [{ id: 'n', text: 't' }] });
    const b = doc({
      name: 'Renamed',
      elements: [el('c'), el('a'), el('d')],
      notes: [],
      transcript: { lines: [] },
    });
    const ops = roundTrip(a, b);
    expect(ops.some((o: Op) => o.t === 'order')).toBe(true);
  });

  it('no reorder op when items were only appended or deleted', () => {
    const ops = roundTrip(doc({ elements: [el('a'), el('b')] }), doc({ elements: [el('b'), el('c')] }));
    expect(ops.map((o) => o.t)).toEqual(['del', 'put']);
  });

  it('treats null and missing fields as equal', () => {
    expect(diffDocs(doc({ elements: [el('a', { image: null })] }), doc({ elements: [el('a')] }))).toEqual([]);
  });
});
