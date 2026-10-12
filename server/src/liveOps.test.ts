import { describe, expect, it } from 'vitest';
import { applyOps, danglingConnectionOps, opSchema, toLiveDoc } from './liveOps.js';

const el = (id: string) => ({ id, content: id });

describe('server applyOps (mirrors src/live/ops.ts)', () => {
  it('patch merges fields, null removes a field, patch after delete is a no-op', () => {
    let d = toLiveDoc({ elements: [{ ...el('a'), image: 'x' }] });
    d = applyOps(d, [
      { t: 'patch', c: 'elements', id: 'a', fields: { content: 'A', image: null } },
    ]);
    expect(d.elements[0]).toEqual({ id: 'a', content: 'A' });
    d = applyOps(d, [{ t: 'del', c: 'elements', id: 'a' }, { t: 'patch', c: 'elements', id: 'a', fields: { content: 'late' } }]);
    expect(d.elements).toEqual([]);
  });

  it('order and put behave like the client', () => {
    const d = applyOps(toLiveDoc({ elements: [el('a'), el('b'), el('c')] }), [
      { t: 'order', c: 'elements', ids: ['c', 'zz', 'a'] },
      { t: 'put', c: 'elements', value: el('d') },
    ]);
    expect(d.elements.map((e) => e.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('rejects malformed ops', () => {
    expect(opSchema.safeParse({ t: 'patch', c: 'users', id: 'x', fields: {} }).success).toBe(false);
    expect(opSchema.safeParse({ t: 'set', k: '__proto__', value: 1 }).success).toBe(false);
    expect(opSchema.safeParse({ t: 'put', c: 'elements', value: { content: 'no id' } }).success).toBe(false);
  });

  it('finds connections whose endpoints are gone', () => {
    const d = toLiveDoc({
      elements: [el('a'), el('b')],
      connections: [
        { id: 'ok', from: 'a', to: 'b' },
        { id: 'gone', from: 'a', to: 'zz' },
        { id: 'onArrow', from: 'b', to: { connectionId: 'ok', position: 0.5 } },
        { id: 'onGoneArrow', from: 'b', to: { connectionId: 'gone', position: 0.5 } },
      ],
    });
    expect(danglingConnectionOps(d).map((o) => (o.t === 'del' ? o.id : ''))).toEqual(['gone', 'onGoneArrow']);
  });
});
