import { describe, it, expect } from 'vitest';
import { defaultArrowhead, resolveArrowhead } from './arrowhead';
import type { ArgumentElement, DiagramElement, Connection } from '../types';

function arg(id: string, argumentType: ArgumentElement['argumentType'] = 'claim', attachedTo?: ArgumentElement['attachedTo']): ArgumentElement {
  return {
    id, type: 'argument', argumentType, contributor: 'student',
    label: 'X', content: '',
    position: { x: 0, y: 0 }, size: { width: 100, height: 60 },
    ...(attachedTo ? { attachedTo } : {}),
  };
}

function byId(...els: DiagramElement[]): ReadonlyMap<string, DiagramElement> {
  return new Map(els.map((e) => [e.id, e]));
}

const support: Connection = { id: 'c1', from: 'a', to: 'b', type: 'support' };
const counter: Connection = { id: 'c2', from: 'a', to: 'b', type: 'counterclaim' };
const warrant: Connection = { id: 'c3', from: 'a', to: { connectionId: 'c1', position: 0.5 }, type: 'support' };
const toQual: Connection = { id: 'c4', from: 'a', to: 'q', type: 'support' };

describe('defaultArrowhead', () => {
  it('support element→element: true', () => {
    expect(defaultArrowhead(support, byId(arg('a'), arg('b')))).toBe(true);
  });
  it('counterclaim: false', () => {
    expect(defaultArrowhead(counter, byId(arg('a'), arg('b')))).toBe(false);
  });
  it('warrant attachment (to is ConnectionTarget): false', () => {
    expect(defaultArrowhead(warrant, byId(arg('a')))).toBe(false);
  });
  it('rebuttal→attached qualifier: false', () => {
    const q = arg('q', 'qualifier', { connectionId: 'c1', position: 0.5 });
    expect(defaultArrowhead(toQual, byId(arg('a'), q))).toBe(false);
  });
  it('→ unattached qualifier: true', () => {
    expect(defaultArrowhead(toQual, byId(arg('a'), arg('q', 'qualifier')))).toBe(true);
  });
});

describe('resolveArrowhead', () => {
  it('undefined override falls back to default', () => {
    expect(resolveArrowhead(support, byId(arg('a'), arg('b')))).toBe(true);
    expect(resolveArrowhead(counter, byId(arg('a'), arg('b')))).toBe(false);
  });
  it('arrowhead: false hides a support arrow', () => {
    expect(resolveArrowhead({ ...support, arrowhead: false }, byId(arg('a'), arg('b')))).toBe(false);
  });
  it('arrowhead: true shows a counterclaim arrow', () => {
    expect(resolveArrowhead({ ...counter, arrowhead: true }, byId(arg('a'), arg('b')))).toBe(true);
  });
  it('arrowhead: true shows a warrant-attachment arrow', () => {
    expect(resolveArrowhead({ ...warrant, arrowhead: true }, byId(arg('a')))).toBe(true);
  });
  it('arrowhead: true shows a rebuttal→qualifier arrow', () => {
    const q = arg('q', 'qualifier', { connectionId: 'c1', position: 0.5 });
    expect(resolveArrowhead({ ...toQual, arrowhead: true }, byId(arg('a'), q))).toBe(true);
  });
});
