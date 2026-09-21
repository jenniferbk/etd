import { describe, it, expect, beforeEach } from 'vitest';
import { useDiagramStore, sweepOrphanedQualifiers } from './diagramStore';
import type { ArgumentElement, SupportElement, DiagramElement, Connection } from '../types';

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
