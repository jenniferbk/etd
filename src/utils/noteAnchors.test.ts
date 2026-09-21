import { describe, expect, it } from 'vitest';
import type { AnalyticNote, ArgumentElement, Connection, DiagramElement, InfoBoxElement, SupportElement } from '../types';
import {
  DETACHED_LABEL, countNotesByAnchor, describeAnchor, describeConnection, describeElement,
  resolveAnchor, selectionAnchor, truncate,
} from './noteAnchors';

function claim(id: string, label = `Claim ${id}`): ArgumentElement {
  return { id, type: 'argument', argumentType: 'claim', contributor: 'student', label, content: '', position: { x: 0, y: 0 }, size: { width: 180, height: 80 } };
}
function data(id: string): ArgumentElement {
  return { id, type: 'argument', argumentType: 'data', contributor: 'given', label: `Data ${id}`, content: '', position: { x: 0, y: 0 }, size: { width: 180, height: 80 } };
}
function support(id: string, content: string): SupportElement {
  return { id, type: 'support', contributor: 'teacher', supportType: 'question', content, position: { x: 0, y: 0 }, size: { width: 160, height: 50 } };
}
function infoBox(id: string, label: string): InfoBoxElement {
  return { id, type: 'infoBox', label, content: '', position: { x: 0, y: 0 }, size: { width: 160, height: 80 } };
}
const byId = (els: DiagramElement[]) => new Map(els.map((e) => [e.id, e]));
const note = (id: string, anchor?: AnalyticNote['anchor']): AnalyticNote =>
  ({ id, text: 't', createdAt: '2026-09-21T10:00:00.000Z', ...(anchor ? { anchor } : {}) });

describe('truncate', () => {
  it('collapses whitespace and caps with an ellipsis', () => {
    expect(truncate('  short  text ', 24)).toBe('short text');
    expect(truncate('Why is this one not growing or decaying?', 24)).toBe('Why is this one not gro…');
    expect(truncate('Why is this one not growing or decaying?', 24)).toHaveLength(24);
  });
});

describe('describeElement', () => {
  it('uses the live derived label for claims', () => {
    const c1 = claim('1'); const c2 = claim('2');
    const conns: Connection[] = [{ id: 's', from: '1', to: '2', type: 'support' }];
    expect(describeElement(c1, conns, byId([c1, c2]))).toBe('Dataclaim 1');
    expect(describeElement(c2, conns, byId([c1, c2]))).toBe('Claim 2');
  });
  it('uses the label for non-claim arguments and info boxes', () => {
    expect(describeElement(data('1'), [], byId([]))).toBe('Data 1');
    expect(describeElement(infoBox('i', 'Context'), [], byId([]))).toBe('Context');
  });
  it('uses type + truncated content for support elements', () => {
    expect(describeElement(support('s', 'Why is this one not growing or decaying?'), [], byId([]))).toBe('Question: Why is this one not gro…');
    expect(describeElement(support('s', '   '), [], byId([]))).toBe('Question');
  });
});

describe('describeConnection', () => {
  const els = [data('1'), claim('2'), claim('3')];
  it('reads "from → to" for support links', () => {
    const c: Connection = { id: 'c', from: '1', to: '2', type: 'support' };
    expect(describeConnection(c, els, [c])).toBe('Data 1 → Claim 2');
  });
  it('uses the slash joiner for counterclaims', () => {
    const c: Connection = { id: 'c', from: '2', to: '3', type: 'counterclaim' };
    expect(describeConnection(c, els, [c])).toBe('Claim 2 –/– Claim 3');
  });
  it('says "line" for a connection that targets another connection', () => {
    const base: Connection = { id: 'base', from: '1', to: '2', type: 'support' };
    const w: Connection = { id: 'w', from: '3', to: { connectionId: 'base', position: 0.5 }, type: 'support' };
    expect(describeConnection(w, els, [base, w])).toBe('Warrantclaim 3 → line');
  });
});

describe('describeAnchor / resolveAnchor', () => {
  const els = [data('1'), claim('2')];
  const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support' }];
  it('labels element and connection anchors', () => {
    expect(describeAnchor({ kind: 'element', id: '2' }, els, conns)).toBe('Claim 2');
    expect(describeAnchor({ kind: 'connection', id: 'c' }, els, conns)).toBe('Data 1 → Claim 2');
  });
  it('returns null for a missing item', () => {
    expect(describeAnchor({ kind: 'element', id: 'nope' }, els, conns)).toBeNull();
    expect(describeAnchor({ kind: 'connection', id: 'nope' }, els, conns)).toBeNull();
  });
  it('resolves general, attached and detached notes', () => {
    expect(resolveAnchor(note('g'), els, conns)).toEqual({ status: 'general' });
    expect(resolveAnchor(note('a', { kind: 'element', id: '2' }), els, conns)).toEqual({ status: 'attached', anchor: { kind: 'element', id: '2' }, label: 'Claim 2' });
    expect(resolveAnchor(note('d', { kind: 'element', id: 'gone' }), els, conns)).toEqual({ status: 'detached', anchor: { kind: 'element', id: 'gone' } });
    expect(DETACHED_LABEL).toBe('Detached — item deleted');
  });
});

describe('selectionAnchor', () => {
  const els = [claim('1')];
  const conns: Connection[] = [{ id: 'c', from: '1', to: '1', type: 'support' }];
  it('returns the single selected element or connection', () => {
    expect(selectionAnchor(['1'], els, conns)).toEqual({ kind: 'element', id: '1' });
    expect(selectionAnchor(['c'], els, conns)).toEqual({ kind: 'connection', id: 'c' });
  });
  it('returns null for nothing, multi-selection, or an unknown id', () => {
    expect(selectionAnchor([], els, conns)).toBeNull();
    expect(selectionAnchor(['1', 'c'], els, conns)).toBeNull();
    expect(selectionAnchor(['zzz'], els, conns)).toBeNull();
  });
});

describe('countNotesByAnchor', () => {
  it('counts anchored notes per item id and ignores general notes', () => {
    const counts = countNotesByAnchor([
      note('a', { kind: 'element', id: 'e1' }),
      note('b', { kind: 'element', id: 'e1' }),
      note('c', { kind: 'connection', id: 'c1' }),
      note('d'),
    ]);
    expect(counts.get('e1')).toBe(2);
    expect(counts.get('c1')).toBe(1);
    expect(counts.has('d')).toBe(false);
    expect(counts.size).toBe(2);
  });
});
