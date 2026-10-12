import { describe, expect, it } from 'vitest';
import { rebaseUndoSnapshot } from './storeBridge';
import type { DiagramElement } from '../types';

const el = (id: string, content: string) =>
  ({ id, type: 'infoBox', label: '', content, position: { x: 0, y: 0 }, size: { width: 10, height: 10 } }) as DiagramElement;

describe('rebaseUndoSnapshot', () => {
  it("applies a teammate's edits to an undo snapshot so undo cannot revert them", () => {
    const past = { elements: [el('mine', 'before my edit'), el('theirs', 'old')], connections: [] };
    const rebased = rebaseUndoSnapshot(past, [
      { t: 'patch', c: 'elements', id: 'theirs', fields: { content: 'teammate edit' } },
      { t: 'put', c: 'elements', value: el('new', 'added by teammate') as never },
    ]);
    expect(rebased.elements!.map((e) => e.content)).toEqual(['before my edit', 'teammate edit', 'added by teammate']);
  });

  it('ignores edits to parts of the document undo does not track', () => {
    const past = { elements: [el('a', 'x')] };
    expect(rebaseUndoSnapshot(past, [{ t: 'set', k: 'name', value: 'n' }])).toBe(past);
  });
});
