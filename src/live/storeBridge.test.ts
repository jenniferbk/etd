import { describe, expect, it } from 'vitest';
import {
  applyDocToStore, applyLocalOpsToStore, applyMirroredStyleConfig, docFromStore, isApplyingRemoteDoc, rebaseUndoSnapshot,
} from './storeBridge';
import { useDiagramStore } from '../store';
import { mirrorIntoStyleConfig } from '../data/codebook';
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

  it('flags its store write as remote, and only while it runs', () => {
    useDiagramStore.setState({ elements: [el('a', 'x')], connections: [], notes: [], selectedIds: [] });
    const seen: boolean[] = [];
    const unsub = useDiagramStore.subscribe(() => seen.push(isApplyingRemoteDoc()));
    applyDocToStore({ ...docFromStore(), elements: [el('a', 'remote')] as never });
    applyLocalOpsToStore([{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'local' } }]);
    unsub();
    expect(seen[0]).toBe(true);
    expect(seen.at(-1)).toBe(false);
    expect(isApplyingRemoteDoc()).toBe(false);
  });
});

describe('episode fields', () => {
  it('loadDiagram stores episode and docFromStore exposes it', () => {
    useDiagramStore.getState().loadDiagram([], [], 'E', null, undefined, [], { status: 'not vetted' });
    expect(docFromStore().episode).toEqual({ status: 'not vetted' });
  });

  it('applyDocToStore updates episode, and clears it when the doc has none', () => {
    useDiagramStore.getState().loadDiagram([], [], 'E');
    applyDocToStore({ ...docFromStore(), episode: { clip: '1:00-2:00' } });
    expect(useDiagramStore.getState().episode).toEqual({ clip: '1:00-2:00' });
    const { episode: _omit, ...rest } = docFromStore();
    applyDocToStore(rest);
    expect(useDiagramStore.getState().episode).toEqual({});
  });
});

describe('applyLocalOpsToStore', () => {
  it('applyLocalOpsToStore patches an element and is undoable', () => {
    useDiagramStore.setState({ elements: [el('a', 'before')], connections: [], notes: [], selectedIds: [] });
    useDiagramStore.temporal.getState().clear();
    applyLocalOpsToStore([{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'after' } }]);
    expect(useDiagramStore.getState().elements[0].content).toBe('after');
    useDiagramStore.temporal.getState().undo();
    expect(useDiagramStore.getState().elements[0].content).toBe('before');
  });

  it('applyLocalOpsToStore sets episode', () => {
    useDiagramStore.getState().loadDiagram([], [], 'L');
    applyLocalOpsToStore([{ t: 'set', k: 'episode', value: { clip: '1:00-2:00' } }]);
    expect(useDiagramStore.getState().episode).toEqual({ clip: '1:00-2:00' });
  });
});

describe('applyMirroredStyleConfig', () => {
  const cb = { groupId: 1, kinds: [{ id: 'k1', label: 'Probe', category: 'c', type: 'question', status: 'active' }] } as never;

  it('does not add an undo step, and undo of a later edit keeps the mirrored config', () => {
    useDiagramStore.setState({ elements: [el('a', 'x')], connections: [], notes: [], selectedIds: [] });
    useDiagramStore.temporal.getState().clear();
    const mirrored = mirrorIntoStyleConfig(useDiagramStore.getState().styleConfig, cb);
    expect(mirrored).not.toBe(useDiagramStore.getState().styleConfig);
    applyMirroredStyleConfig(mirrored);
    expect(useDiagramStore.temporal.getState().pastStates).toHaveLength(0);
    applyLocalOpsToStore([{ t: 'patch', c: 'elements', id: 'a', fields: { content: 'y' } }]);
    useDiagramStore.temporal.getState().undo();
    expect(useDiagramStore.getState().elements[0].content).toBe('x');
    expect(useDiagramStore.getState().styleConfig).toEqual(mirrored);
  });

  it('a second mirror returns the same reference, so no second write is needed', () => {
    const mirrored = mirrorIntoStyleConfig(useDiagramStore.getState().styleConfig, cb);
    applyMirroredStyleConfig(mirrored);
    const after = useDiagramStore.getState().styleConfig;
    expect(mirrorIntoStyleConfig(after, cb)).toBe(after);
  });
});
