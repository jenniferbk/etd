import { describe, expect, it } from 'vitest';
import { applyDocToStore, docFromStore, rebaseUndoSnapshot } from './storeBridge';
import { useDiagramStore } from '../store';
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

describe('applyDocToStore', () => {
  const arg = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      id, type: 'argument', argumentType: 'claim', contributor: 'student', label: id, content: '',
      position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, ...extra,
    }) as unknown as DiagramElement;

  it('applyDocToStore clears a containerId that points at a container which is itself a member', () => {
    useDiagramStore.setState({ elements: [], connections: [], notes: [], selectedIds: [] });
    const doc = {
      ...docFromStore(),
      elements: [
        arg('A', { isContainer: true }),
        arg('B', { isContainer: true, containerId: 'A' }),
        arg('C', { containerId: 'B' }),
      ] as unknown as ReturnType<typeof docFromStore>['elements'],
    };
    applyDocToStore(doc);
    const els = useDiagramStore.getState().elements;
    expect(els.find((e) => e.id === 'B')!.containerId).toBeUndefined();
    expect(els.find((e) => e.id === 'C')!.containerId).toBe('B');
  });
});
