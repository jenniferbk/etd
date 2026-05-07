import { describe, it, expect, beforeEach } from 'vitest';
import { useDiagramStore } from './diagramStore';
import type { ArgumentElement, SupportElement } from '../types';

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
