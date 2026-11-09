import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node has no canvas; loadDiagram's auto-size only needs a height.
vi.mock('../utils/textMeasure', () => ({
  calculateElementSize: () => ({ width: 0, height: 0 }),
}));
import { useDiagramStore, sweepOrphanedQualifiers } from './diagramStore';
import type { ArgumentElement, SupportElement, DiagramElement, Connection, AnalyticNote } from '../types';

function arg(id: string, x = 0, y = 0): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim', content: '',
    position: { x, y }, size: { width: 100, height: 60 },
  };
}

function sup(id: string, x = 0, y = 0, associatedWith?: string): SupportElement {
  return {
    id, type: 'support', contributor: 'teacher',
    supportType: 'question', content: '',
    position: { x, y }, size: { width: 80, height: 40 },
    ...(associatedWith ? { associatedWith } : {}),
  };
}

beforeEach(() => {
  useDiagramStore.setState({
    elements: [],
    connections: [],
    selectedIds: [],
  });
});

describe('moveCluster', () => {
  it('updates positions for every id in startPositions', () => {
    useDiagramStore.setState({
      elements: [arg('a', 10, 20), sup('s1', 30, 40), sup('s2', 50, 60)],
    });
    const startPositions = new Map([
      ['a', { x: 10, y: 20 }],
      ['s1', { x: 30, y: 40 }],
      ['s2', { x: 50, y: 60 }],
    ]);
    useDiagramStore.getState().moveCluster(startPositions, { x: 5, y: 7 });
    const els = useDiagramStore.getState().elements;
    expect(els.find(e => e.id === 'a')!.position).toEqual({ x: 15, y: 27 });
    expect(els.find(e => e.id === 's1')!.position).toEqual({ x: 35, y: 47 });
    expect(els.find(e => e.id === 's2')!.position).toEqual({ x: 55, y: 67 });
  });

  it('leaves elements not in startPositions untouched', () => {
    useDiagramStore.setState({
      elements: [arg('a', 10, 20), sup('outside', 200, 200)],
    });
    const startPositions = new Map([['a', { x: 10, y: 20 }]]);
    useDiagramStore.getState().moveCluster(startPositions, { x: 5, y: 5 });
    expect(useDiagramStore.getState().elements.find(e => e.id === 'outside')!.position)
      .toEqual({ x: 200, y: 200 });
  });
});

describe('moveAndLink', () => {
  it('updates position and associatedWith in one transition', () => {
    useDiagramStore.setState({ elements: [sup('s', 0, 0)] });
    useDiagramStore.getState().moveAndLink('s', { x: 100, y: 50 }, 'argA');
    const s = useDiagramStore.getState().elements.find(e => e.id === 's') as SupportElement;
    expect(s.position).toEqual({ x: 100, y: 50 });
    expect(s.associatedWith).toBe('argA');
  });

  it('clears associatedWith when passed null', () => {
    useDiagramStore.setState({ elements: [sup('s', 0, 0, 'argA')] });
    useDiagramStore.getState().moveAndLink('s', { x: 5, y: 5 }, null);
    const s = useDiagramStore.getState().elements.find(e => e.id === 's') as SupportElement;
    expect(s.position).toEqual({ x: 5, y: 5 });
    expect(s.associatedWith).toBeUndefined();
  });

  it('does nothing if id is not a support', () => {
    useDiagramStore.setState({ elements: [arg('a', 0, 0)] });
    useDiagramStore.getState().moveAndLink('a', { x: 50, y: 50 }, 'other');
    const a = useDiagramStore.getState().elements.find(e => e.id === 'a')!;
    expect((a as ArgumentElement).type).toBe('argument');
  });
});

function qualifier(id: string, attachedConnectionId?: string, position = 0.5): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'qualifier', contributor: 'student',
    label: `Qualifier ${id}`, content: '',
    position: { x: 0, y: 0 }, size: { width: 60, height: 24 },
    ...(attachedConnectionId ? { attachedTo: { connectionId: attachedConnectionId, position } } : {}),
  };
}

describe('removeConnection cascade', () => {
  it('removes attached qualifier elements when their parent connection is removed', () => {
    useDiagramStore.setState({
      elements: [arg('a'), arg('b'), qualifier('q1', 'conn-1', 0.5)],
      connections: [{ id: 'conn-1', from: 'a', to: 'b', type: 'support' }],
    });
    useDiagramStore.getState().removeConnection('conn-1');
    const state = useDiagramStore.getState();
    expect(state.connections.find(c => c.id === 'conn-1')).toBeUndefined();
    expect(state.elements.find(e => e.id === 'q1')).toBeUndefined();
    expect(state.elements.find(e => e.id === 'a')).toBeDefined();
    expect(state.elements.find(e => e.id === 'b')).toBeDefined();
  });

  it('leaves qualifiers attached to other connections untouched', () => {
    useDiagramStore.setState({
      elements: [arg('a'), arg('b'), qualifier('q1', 'conn-1'), qualifier('q2', 'conn-2')],
      connections: [
        { id: 'conn-1', from: 'a', to: 'b', type: 'support' },
        { id: 'conn-2', from: 'a', to: 'b', type: 'support' },
      ],
    });
    useDiagramStore.getState().removeConnection('conn-1');
    const state = useDiagramStore.getState();
    expect(state.elements.find(e => e.id === 'q1')).toBeUndefined();
    expect(state.elements.find(e => e.id === 'q2')).toBeDefined();
  });

  it('does not remove orphan qualifiers (no attachedTo) on connection removal', () => {
    useDiagramStore.setState({
      elements: [arg('a'), arg('b'), qualifier('orphan')], // no attachedTo
      connections: [{ id: 'conn-1', from: 'a', to: 'b', type: 'support' }],
    });
    useDiagramStore.getState().removeConnection('conn-1');
    expect(useDiagramStore.getState().elements.find(e => e.id === 'orphan')).toBeDefined();
  });
});

describe('sweepOrphanedQualifiers (pure helper used by loadDiagram)', () => {
  it('clears attachedTo when its connectionId does not resolve', () => {
    const q = qualifier('q1', 'ghost-conn', 0.5);
    const swept = sweepOrphanedQualifiers([q] as DiagramElement[], [] as Connection[]);
    expect((swept[0] as ArgumentElement).attachedTo).toBeUndefined();
  });

  it('preserves attachedTo when its connectionId resolves', () => {
    const q = qualifier('q1', 'real-conn', 0.5);
    const conns: Connection[] = [{ id: 'real-conn', from: 'a', to: 'b', type: 'support' }];
    const swept = sweepOrphanedQualifiers([q] as DiagramElement[], conns);
    expect((swept[0] as ArgumentElement).attachedTo).toEqual({ connectionId: 'real-conn', position: 0.5 });
  });

  it('leaves non-qualifier elements untouched even if they have attachedTo', () => {
    const stray = { ...arg('x'), attachedTo: { connectionId: 'ghost', position: 0.5 } } as ArgumentElement;
    const swept = sweepOrphanedQualifiers([stray] as DiagramElement[], [] as Connection[]);
    expect((swept[0] as ArgumentElement).attachedTo).toEqual({ connectionId: 'ghost', position: 0.5 });
  });
});

describe('updateElement attachedTo clearing on argumentType change', () => {
  it('clears attachedTo when argumentType is changed away from qualifier', () => {
    useDiagramStore.setState({
      elements: [qualifier('q', 'c1', 0.5)],
      connections: [{ id: 'c1', from: 'a', to: 'b', type: 'support' }],
    });
    useDiagramStore.getState().updateElement('q', { argumentType: 'claim' } as Partial<ArgumentElement>);
    const after = useDiagramStore.getState().elements[0] as ArgumentElement;
    expect(after.argumentType).toBe('claim');
    expect(after.attachedTo).toBeUndefined();
  });

  it('clears attachedTo when argumentType is set TO qualifier (drag-onto-line sets it later)', () => {
    useDiagramStore.setState({
      elements: [{ ...arg('x'), attachedTo: { connectionId: 'c1', position: 0.5 } } as ArgumentElement],
    });
    useDiagramStore.getState().updateElement('x', { argumentType: 'qualifier' } as Partial<ArgumentElement>);
    const after = useDiagramStore.getState().elements[0] as ArgumentElement;
    expect(after.argumentType).toBe('qualifier');
    expect(after.attachedTo).toBeUndefined();
  });

  it('leaves attachedTo alone for non-argumentType updates', () => {
    useDiagramStore.setState({
      elements: [qualifier('q', 'c1', 0.5)],
      connections: [{ id: 'c1', from: 'a', to: 'b', type: 'support' }],
    });
    // Use a non-content field (position) so the auto-size step (which needs DOM) is skipped.
    useDiagramStore.getState().updateElement('q', { position: { x: 99, y: 99 } });
    const after = useDiagramStore.getState().elements[0] as ArgumentElement;
    expect(after.attachedTo).toEqual({ connectionId: 'c1', position: 0.5 });
  });
});

describe('removeElement scrub', () => {
  it('clears associatedWith on supports linked to a removed argument', () => {
    useDiagramStore.setState({
      elements: [
        arg('argA'),
        sup('s1', 0, 0, 'argA'),
        sup('s2', 0, 0, 'argA'),
        sup('s3', 0, 0, 'argB'),
      ],
    });
    useDiagramStore.getState().removeElement('argA');
    const els = useDiagramStore.getState().elements;
    expect(els.find(e => e.id === 'argA')).toBeUndefined();
    expect((els.find(e => e.id === 's1') as SupportElement).associatedWith).toBeUndefined();
    expect((els.find(e => e.id === 's2') as SupportElement).associatedWith).toBeUndefined();
    expect((els.find(e => e.id === 's3') as SupportElement).associatedWith).toBe('argB');
  });

  it('does NOT scrub associatedWith when removing a support', () => {
    useDiagramStore.setState({
      elements: [arg('argA'), sup('s1', 0, 0, 'argA'), sup('toRemove')],
    });
    useDiagramStore.getState().removeElement('toRemove');
    const els = useDiagramStore.getState().elements;
    expect((els.find(e => e.id === 's1') as SupportElement).associatedWith).toBe('argA');
  });
});

describe('setConnectionType', () => {
  it('flips a connection between support and counterclaim', () => {
    useDiagramStore.setState({
      elements: [arg('a'), arg('b')],
      connections: [{ id: 'c1', from: 'a', to: 'b', type: 'support' }],
    });
    useDiagramStore.getState().setConnectionType('c1', 'counterclaim');
    expect(useDiagramStore.getState().connections[0].type).toBe('counterclaim');
    useDiagramStore.getState().setConnectionType('c1', 'support');
    expect(useDiagramStore.getState().connections[0].type).toBe('support');
  });

  it('preserves routing fields and leaves other connections untouched', () => {
    const c1: Connection = {
      id: 'c1', from: 'a', to: 'b', type: 'support',
      waypoints: [{ x: 50, y: 50 }], fromAnchor: { edge: 'right', t: 0.5 },
    };
    const c2: Connection = { id: 'c2', from: 'b', to: 'a', type: 'support' };
    useDiagramStore.setState({ elements: [arg('a'), arg('b')], connections: [c1, c2] });
    useDiagramStore.getState().setConnectionType('c1', 'counterclaim');
    const [n1, n2] = useDiagramStore.getState().connections;
    expect(n1).toEqual({ ...c1, type: 'counterclaim' });
    expect(n2).toBe(c2);
  });
});

describe('setConnectionArrowhead', () => {
  const setup = () => {
    useDiagramStore.setState({
      elements: [arg('a'), arg('b')],
      connections: [{ id: 'c1', from: 'a', to: 'b', type: 'support' }],
    });
    useDiagramStore.temporal.getState().clear();
  };

  it('sets true/false', () => {
    setup();
    useDiagramStore.getState().setConnectionArrowhead('c1', false);
    expect(useDiagramStore.getState().connections[0].arrowhead).toBe(false);
    useDiagramStore.getState().setConnectionArrowhead('c1', true);
    expect(useDiagramStore.getState().connections[0].arrowhead).toBe(true);
  });

  it('undefined removes the key', () => {
    setup();
    useDiagramStore.getState().setConnectionArrowhead('c1', true);
    useDiagramStore.getState().setConnectionArrowhead('c1', undefined);
    const conn = useDiagramStore.getState().connections[0];
    expect(!('arrowhead' in conn)).toBe(true);
  });

  it('is undoable in one step', () => {
    setup();
    const original = useDiagramStore.getState().connections[0];
    useDiagramStore.getState().setConnectionArrowhead('c1', false);
    useDiagramStore.temporal.getState().undo();
    expect(useDiagramStore.getState().connections[0]).toEqual(original);
    expect('arrowhead' in useDiagramStore.getState().connections[0]).toBe(false);
  });
});

describe('analytic notes', () => {
  beforeEach(() => {
    useDiagramStore.setState({ notes: [] });
  });

  it('addNote appends a note with id, createdAt, text, anchor and author', () => {
    const note = useDiagramStore.getState().addNote({
      text: 'The warrant is implicit here.',
      anchor: { kind: 'element', id: 'w1' },
      author: 'Jennifer',
    });
    expect(note.id).toMatch(/^note-/);
    expect(Number.isNaN(Date.parse(note.createdAt))).toBe(false);
    expect(note.anchor).toEqual({ kind: 'element', id: 'w1' });
    expect(note.author).toBe('Jennifer');
    expect(useDiagramStore.getState().notes).toEqual([note]);
  });

  it('addNote omits author and anchor keys when not given (general, signed-out note)', () => {
    const note = useDiagramStore.getState().addNote({ text: 'General memo' });
    expect('author' in note).toBe(false);
    expect('anchor' in note).toBe(false);
  });

  it('updateNoteText changes only that note and stamps updatedAt', () => {
    const a = useDiagramStore.getState().addNote({ text: 'a' });
    const b = useDiagramStore.getState().addNote({ text: 'b' });
    useDiagramStore.getState().updateNoteText(a.id, 'a2');
    const notes = useDiagramStore.getState().notes;
    const a2 = notes.find((n) => n.id === a.id)!;
    expect(a2.text).toBe('a2');
    expect(a2.updatedAt).toBeDefined();
    expect(notes.find((n) => n.id === b.id)).toEqual(b);
  });

  it('removeNote drops only that note', () => {
    const a = useDiagramStore.getState().addNote({ text: 'a' });
    const b = useDiagramStore.getState().addNote({ text: 'b' });
    useDiagramStore.getState().removeNote(a.id);
    expect(useDiagramStore.getState().notes).toEqual([b]);
  });

  it('removeElement keeps notes anchored to the removed element (detached, not deleted)', () => {
    useDiagramStore.setState({ elements: [arg('a')] });
    const note = useDiagramStore.getState().addNote({ text: 'memo', anchor: { kind: 'element', id: 'a' } });
    useDiagramStore.getState().removeElement('a');
    expect(useDiagramStore.getState().notes).toEqual([note]);
  });

  it('clearDiagram empties notes', () => {
    useDiagramStore.getState().addNote({ text: 'memo' });
    useDiagramStore.getState().clearDiagram();
    expect(useDiagramStore.getState().notes).toEqual([]);
  });

  it('loadDiagram defaults notes to [] when omitted and loads them when given', () => {
    useDiagramStore.getState().addNote({ text: 'stale' });
    useDiagramStore.getState().loadDiagram([], [], 'Untitled');
    expect(useDiagramStore.getState().notes).toEqual([]);
    const loaded: AnalyticNote[] = [{ id: 'note-1', text: 'from file', createdAt: '2026-09-21T10:00:00.000Z' }];
    useDiagramStore.getState().loadDiagram([], [], 'Untitled', null, undefined, loaded);
    expect(useDiagramStore.getState().notes).toEqual(loaded);
  });

  it('loadDiagram ignores a non-array notes value from a hand-edited file', () => {
    useDiagramStore.getState().loadDiagram([], [], 'Untitled', null, undefined, 'junk' as unknown as AnalyticNote[]);
    expect(useDiagramStore.getState().notes).toEqual([]);
    useDiagramStore.getState().loadDiagram([], [], 'Untitled', null, undefined, {} as unknown as AnalyticNote[]);
    expect(useDiagramStore.getState().notes).toEqual([]);
  });

  it('setNotesPanelOpen toggles the panel flag', () => {
    useDiagramStore.getState().setNotesPanelOpen(true);
    expect(useDiagramStore.getState().notesPanelOpen).toBe(true);
    useDiagramStore.getState().setNotesPanelOpen(false);
    expect(useDiagramStore.getState().notesPanelOpen).toBe(false);
  });
});

describe('straightenConnection', () => {
  it('clears hand-placed routing when the boxes can be joined straight', () => {
    const conn: Connection = {
      id: 'c', from: 'a', to: 'b', type: 'support',
      waypoints: [{ x: 250, y: 130 }, { x: 250, y: 133 }],
      toAnchor: { edge: 'left', t: 0.2 },
    };
    useDiagramStore.setState({ elements: [arg('a', 0, 100), arg('b', 400, 103)], connections: [conn] });
    expect(useDiagramStore.getState().straightenConnection('c')).toBe(true);
    const after = useDiagramStore.getState().connections[0];
    expect(after.waypoints).toBeUndefined();
    expect(after.fromAnchor).toBeUndefined();
    expect(after.toAnchor).toBeUndefined();
    expect('waypoints' in after).toBe(false);
  });

  it('stores jog-free waypoints when the boxes do not line up', () => {
    const conn: Connection = {
      id: 'c', from: 'a', to: 'b', type: 'support',
      waypoints: [{ x: 300, y: 30 }, { x: 300, y: 34 }, { x: 500, y: 34 }, { x: 500, y: 430 }],
    };
    useDiagramStore.setState({ elements: [arg('a', 0, 0), arg('b', 600, 400)], connections: [conn] });
    expect(useDiagramStore.getState().straightenConnection('c')).toBe(true);
    expect(useDiagramStore.getState().connections[0].waypoints).toEqual([{ x: 500, y: 30 }, { x: 500, y: 430 }]);
  });

  it('returns false and leaves state alone when there is nothing to straighten', () => {
    const conn: Connection = { id: 'c', from: 'a', to: 'b', type: 'support' };
    useDiagramStore.setState({ elements: [arg('a', 0, 100), arg('b', 400, 103)], connections: [conn] });
    const before = useDiagramStore.getState().connections;
    expect(useDiagramStore.getState().straightenConnection('c')).toBe(false);
    expect(useDiagramStore.getState().connections).toBe(before);
  });
});

// ---- Containers ----
function box(id: string, x = 0, y = 0): ArgumentElement {
  return { ...arg(id, x, y), isContainer: true, size: { width: 400, height: 250 } };
}
function member(id: string, containerId: string, x: number, y: number): ArgumentElement {
  return { ...arg(id, x, y), containerId };
}
const st = () => useDiagramStore.getState();
const byId = (id: string) => st().elements.find((e) => e.id === id)!;
const freshHistory = (elements: DiagramElement[], connections: Connection[] = []) => {
  useDiagramStore.setState({ elements, connections, selectedIds: [] });
  useDiagramStore.temporal.getState().clear();
};

describe('container moveElement', () => {
  it('moves members with the container', () => {
    freshHistory([box('c', 0, 0), member('m1', 'c', 100, 100), member('m2', 'c', 200, 100)]);
    st().moveElement('c', { x: 50, y: 30 });
    expect(byId('c').position).toEqual({ x: 50, y: 30 });
    expect(byId('m1').position).toEqual({ x: 150, y: 130 });
    expect(byId('m2').position).toEqual({ x: 250, y: 130 });
    expect(useDiagramStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('leaves excluded members in place', () => {
    freshHistory([box('c', 0, 0), member('m1', 'c', 100, 100), member('m2', 'c', 200, 100)]);
    st().moveElement('c', { x: 50, y: 30 }, { excludeMemberIds: ['m1'] });
    expect(byId('m1').position).toEqual({ x: 100, y: 100 });
    expect(byId('m2').position).toEqual({ x: 250, y: 130 });
  });

  it('joins a container when moved inside and leaves when moved out', () => {
    freshHistory([box('c', 0, 0), arg('p', 600, 600)]);
    st().moveElement('p', { x: 100, y: 100 });
    expect((byId('p') as ArgumentElement).containerId).toBe('c');
    st().moveElement('p', { x: 700, y: 700 });
    expect('containerId' in byId('p')).toBe(false);
  });
});

describe('container moveCluster / moveAndLink', () => {
  it('cluster dropped inside a container joins it', () => {
    freshHistory([box('c', 0, 0), arg('a', 600, 600), sup('s', 650, 650, 'a')]);
    st().moveCluster(new Map([['a', { x: 600, y: 600 }], ['s', { x: 650, y: 650 }]]), { x: -500, y: -500 });
    expect(byId('a').containerId).toBe('c');
    expect(byId('s').containerId).toBe('c');
  });

  it('moveAndLink re-tests membership', () => {
    freshHistory([box('c', 0, 0), sup('s', 700, 700)]);
    st().moveAndLink('s', { x: 100, y: 100 }, null);
    expect(byId('s').containerId).toBe('c');
  });
});

describe('container resizeElement', () => {
  it('shrinking drops an outside member and does not move members', () => {
    freshHistory([box('c', 0, 0), member('m1', 'c', 50, 50), member('m2', 'c', 300, 150)]);
    st().resizeElement('c', { width: 200, height: 250 }, { x: 0, y: 0 });
    expect(byId('m1').containerId).toBe('c');
    expect('containerId' in byId('m2')).toBe(false);
    expect(byId('m1').position).toEqual({ x: 50, y: 50 });
    expect(byId('m2').position).toEqual({ x: 300, y: 150 });
  });

  it('growing takes in an element', () => {
    freshHistory([box('c', 0, 0), arg('p', 450, 50)]);
    st().resizeElement('c', { width: 600, height: 250 });
    expect(byId('p').containerId).toBe('c');
    expect(useDiagramStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('applies new position when given', () => {
    freshHistory([arg('a', 0, 0)]);
    st().resizeElement('a', { width: 150, height: 90 }, { x: 10, y: 20 });
    expect(byId('a').position).toEqual({ x: 10, y: 20 });
    expect(byId('a').size).toEqual({ width: 150, height: 90 });
  });
});

describe('container removeElement', () => {
  it('releases members and undoes in one step', () => {
    freshHistory([box('c', 0, 0), member('m1', 'c', 100, 100)]);
    st().removeElement('c');
    expect(st().elements).toHaveLength(1);
    expect('containerId' in byId('m1')).toBe(false);
    useDiagramStore.temporal.getState().undo();
    expect(st().elements).toHaveLength(2);
    expect(byId('m1').containerId).toBe('c');
  });
});

describe('setContainer', () => {
  it('on: min size and sweep, one undo step', () => {
    freshHistory([arg('a', 0, 0), arg('p', 150, 100)]);
    st().setContainer('a', true);
    expect((byId('a') as ArgumentElement).isContainer).toBe(true);
    expect(byId('a').size).toEqual({ width: 400, height: 250 });
    expect(byId('p').containerId).toBe('a');
    expect(useDiagramStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('off: members released', () => {
    freshHistory([box('c', 0, 0), member('m1', 'c', 100, 100)]);
    st().setContainer('c', false);
    expect('isContainer' in byId('c')).toBe(false);
    expect('containerId' in byId('m1')).toBe(false);
  });

  it('off: ex-container inside another container becomes its member', () => {
    freshHistory([box('big', 0, 0), { ...box('small', 100, 100), size: { width: 100, height: 60 } }]);
    st().setContainer('small', false);
    expect(byId('small').containerId).toBe('big');
  });
});

describe('duplicateElements with containers', () => {
  it('copies container, members and inner connection; selects new ids', () => {
    freshHistory(
      [box('c', 0, 0), member('m1', 'c', 100, 100), member('m2', 'c', 250, 100)],
      [{ id: 'k', from: 'm1', to: 'm2', type: 'support' }],
    );
    st().duplicateElements(['c']);
    expect(st().elements).toHaveLength(6);
    expect(st().connections).toHaveLength(2);
    const newIds = st().selectedIds;
    expect(newIds).toHaveLength(3);
    const copies = st().elements.filter((e) => newIds.includes(e.id));
    const newBox = copies.find((e) => (e as ArgumentElement).isContainer)!;
    expect(copies.filter((e) => e.containerId === newBox.id)).toHaveLength(2);
    const nc = st().connections[1];
    expect(nc.id).not.toBe('k');
    expect(newIds).toContain(nc.from);
    expect(newIds).toContain(nc.to as string);
    expect(useDiagramStore.temporal.getState().pastStates).toHaveLength(1);
  });
});

describe('convertToSupport on a container', () => {
  it('drops the flag and releases members', () => {
    freshHistory([box('c', 0, 0), member('m1', 'c', 100, 100)]);
    st().convertToSupport('c', 'question');
    expect(byId('c').type).toBe('support');
    expect('isContainer' in byId('c')).toBe(false);
    expect('containerId' in byId('m1')).toBe(false);
  });
});

describe('updateElement argumentType change', () => {
  it('keeps valid containment intact and is one undo step', () => {
    freshHistory([box('c', 0, 0), member('m1', 'c', 100, 100)]);
    st().updateElement('m1', { argumentType: 'warrant' });
    expect(byId('m1').containerId).toBe('c');
    expect((byId('c') as ArgumentElement).isContainer).toBe(true);
    expect(useDiagramStore.temporal.getState().pastStates).toHaveLength(1);
  });
});

describe('container loadDiagram', () => {
  it('clears a dangling containerId', () => {
    st().loadDiagram([member('m', 'ghost', 0, 0)], [], 'n');
    expect('containerId' in byId('m')).toBe(false);
  });

  it('leaves files without container fields unchanged', () => {
    const input = [arg('a', 5, 5), sup('s', 300, 300)];
    st().loadDiagram(input, [], 'n');
    for (const el of input) {
      const out = byId(el.id);
      expect({ ...out, size: undefined }).toEqual({ ...el, size: undefined });
    }
  });
});
