import { describe, it, expect } from 'vitest';
import {
  CONTAINER_MIN_SIZE, containerAt, retestMembership, retestAroundContainer,
  makeContainer, unmakeContainer, normalizeContainers, containerDragIds,
  linkCandidates, duplicateWithMembers, splitForRender, membersOf,
} from './containers';
import type { ArgumentElement, SupportElement, DiagramElement, Connection } from '../types';

function arg(id: string, x = 0, y = 0, extra: Partial<ArgumentElement> = {}, w = 100, h = 60): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim', content: '',
    position: { x, y }, size: { width: w, height: h }, ...extra,
  };
}
function sup(id: string, x = 0, y = 0, extra: Partial<SupportElement> = {}): SupportElement {
  return {
    id, type: 'support', contributor: 'teacher', supportType: 'question', content: '',
    position: { x, y }, size: { width: 80, height: 40 }, ...extra,
  };
}
const box = (id: string, x = 0, y = 0, w = 500, h = 300) =>
  arg(id, x, y, { isContainer: true }, w, h);
const byId = (els: DiagramElement[], id: string) => els.find((e) => e.id === id)!;

describe('containerAt', () => {
  it('returns the container id when the center is inside', () => {
    expect(containerAt([box('c'), arg('a', 100, 100)], arg('a', 100, 100))).toBe('c');
  });
  it('returns null when only the box overlaps', () => {
    const a = arg('a', 480, 100); // center x 530 > 500
    expect(containerAt([box('c'), a], a)).toBeNull();
  });
  it('returns null for a container itself', () => {
    const c = box('c');
    expect(containerAt([box('o', 0, 0, 900, 900), c], c)).toBeNull();
  });
  it('returns null for an attached qualifier', () => {
    const q = arg('q', 100, 100, { argumentType: 'qualifier', attachedTo: { connectionId: 'x', position: 0.5 } });
    expect(containerAt([box('c'), q], q)).toBeNull();
  });
  it('returns the later container when two overlap', () => {
    const a = arg('a', 100, 100);
    expect(containerAt([box('c1'), box('c2'), a], a)).toBe('c2');
  });
});

describe('retestMembership', () => {
  it('sets containerId for an element moved in', () => {
    const els = [box('c'), arg('a', 100, 100)];
    const out = retestMembership(els, new Set(['a']));
    expect((byId(out, 'a') as ArgumentElement).containerId).toBe('c');
    expect(els[1]).not.toHaveProperty('containerId');
  });
  it('clears containerId for an element moved out', () => {
    const els = [box('c'), arg('a', 900, 900, { containerId: 'c' })];
    const out = retestMembership(els, new Set(['a']));
    expect(byId(out, 'a').containerId).toBeUndefined();
  });
  it('returns the same array when nothing changes', () => {
    const els = [box('c'), arg('a', 100, 100, { containerId: 'c' }), arg('b', 900, 900)];
    expect(retestMembership(els, new Set(['a', 'b', 'c']))).toBe(els);
  });
});

describe('retestAroundContainer', () => {
  it('takes in a non-member that is now inside', () => {
    const els = [box('c'), arg('a', 100, 100)];
    expect(byId(retestAroundContainer(els, 'c'), 'a').containerId).toBe('c');
  });
  it('drops a member that is now outside', () => {
    const els = [box('c', 0, 0, 100, 100), arg('a', 300, 300, { containerId: 'c' })];
    expect(byId(retestAroundContainer(els, 'c'), 'a').containerId).toBeUndefined();
  });
  it('does not steal from a later container', () => {
    const els = [box('c1'), box('c2'), arg('a', 100, 100, { containerId: 'c2' })];
    expect(byId(retestAroundContainer(els, 'c1'), 'a').containerId).toBe('c2');
  });
  it('steals when this container is later in the array', () => {
    const els = [box('c1'), box('c2'), arg('a', 100, 100, { containerId: 'c1' })];
    expect(byId(retestAroundContainer(els, 'c2'), 'a').containerId).toBe('c2');
  });
});

describe('makeContainer', () => {
  it('grows 200x100 to the minimum size, keeping top-left', () => {
    const out = makeContainer([arg('c', 30, 40, {}, 200, 100)], 'c');
    const c = byId(out, 'c') as ArgumentElement;
    expect(c.isContainer).toBe(true);
    expect(c.size).toEqual(CONTAINER_MIN_SIZE);
    expect(c.size).toEqual({ width: 400, height: 250 });
    expect(c.position).toEqual({ x: 30, y: 40 });
  });
  it('keeps a size already larger than the minimum', () => {
    const out = makeContainer([arg('c', 0, 0, {}, 500, 300)], 'c');
    expect(byId(out, 'c').size).toEqual({ width: 500, height: 300 });
  });
  it('sweeps elements already inside', () => {
    const out = makeContainer([arg('c', 0, 0, {}, 200, 100), sup('s', 50, 50)], 'c');
    expect(byId(out, 's').containerId).toBe('c');
  });
  it('returns the same reference for a support', () => {
    const els = [sup('s')];
    expect(makeContainer(els, 's')).toBe(els);
  });
  it('clears the containerId of a member first', () => {
    const els = [box('o', 0, 0, 900, 900), arg('m', 10, 10, { containerId: 'o' })];
    const m = byId(makeContainer(els, 'm'), 'm');
    expect(m.containerId).toBeUndefined();
    expect((m as ArgumentElement).isContainer).toBe(true);
  });
});

describe('unmakeContainer', () => {
  it('clears members and keeps size', () => {
    const els = [box('c'), arg('a', 100, 100, { containerId: 'c' })];
    const out = unmakeContainer(els, 'c');
    expect(byId(out, 'a').containerId).toBeUndefined();
    expect((byId(out, 'c') as ArgumentElement).isContainer).toBeUndefined();
    expect(byId(out, 'c').size).toEqual({ width: 500, height: 300 });
  });
});

describe('normalizeContainers', () => {
  it('clears a dangling containerId', () => {
    const out = normalizeContainers([arg('a', 0, 0, { containerId: 'gone' })]);
    expect(byId(out, 'a').containerId).toBeUndefined();
  });
  it('clears containerId on a container', () => {
    const out = normalizeContainers([box('o'), { ...box('c'), containerId: 'o' }]);
    expect(byId(out, 'c').containerId).toBeUndefined();
  });
  it('clears isContainer on a support', () => {
    const bad = { ...sup('s'), isContainer: true } as unknown as DiagramElement;
    const out = normalizeContainers([bad]);
    expect(out[0]).not.toHaveProperty('isContainer');
  });
  it('returns the same reference for a valid diagram', () => {
    const els = [box('c'), arg('a', 100, 100, { containerId: 'c' })];
    expect(normalizeContainers(els)).toBe(els);
  });
});

describe('containerDragIds', () => {
  it('includes members and hanging supports, excludes unrelated', () => {
    const els: DiagramElement[] = [
      box('c'), arg('m', 100, 100, { containerId: 'c' }),
      sup('ms', 200, 100, { containerId: 'c' }),
      sup('hang', 480, 100), // center x 520 outside, overlaps border
      arg('far', 2000, 2000),
    ];
    const ids = containerDragIds(els, 'c');
    expect(ids).toEqual(expect.arrayContaining(['c', 'm', 'ms', 'hang']));
    expect(ids).not.toContain('far');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('linkCandidates', () => {
  it('drops the container, keeping the member claim', () => {
    const els = [box('c'), arg('claim', 100, 100, { containerId: 'c' })];
    const s = sup('s', 90, 90);
    const map = new Map<string, DiagramElement>(els.map((e) => [e.id, e]));
    expect(linkCandidates(s, new Set(['c', 'claim']), map)).toEqual(new Set(['claim']));
  });
});

describe('duplicateWithMembers', () => {
  const els: DiagramElement[] = [
    box('c'), arg('m1', 50, 50, { containerId: 'c' }), arg('m2', 250, 50, { containerId: 'c' }),
    arg('out', 900, 900),
  ];
  const conns: Connection[] = [
    { id: 'k1', from: 'm1', to: 'm2', type: 'support' },
    { id: 'k2', from: 'm1', to: 'out', type: 'support' },
  ];
  it('copies a container with members and inner connections', () => {
    let n = 0;
    const r = duplicateWithMembers(els, conns, ['c'], () => `n${++n}`, { x: 10, y: 10 });
    expect(r.elements).toHaveLength(3);
    expect(r.newIds).toHaveLength(3);
    expect(r.connections).toHaveLength(1);
    const newC = r.elements.find((e) => (e as ArgumentElement).isContainer)!;
    const members = r.elements.filter((e) => e.id !== newC.id);
    expect(members.every((m) => m.containerId === newC.id)).toBe(true);
    expect(newC.position).toEqual({ x: 10, y: 10 });
    const cn = r.connections[0];
    expect(r.newIds).toContain(cn.from);
    expect(r.newIds).toContain(cn.to as string);
    expect(cn.id).not.toBe('k1');
  });
  it('keeps containerId for a lone member still inside', () => {
    const r = duplicateWithMembers(els, conns, ['m1'], () => 'n1', { x: 20, y: 0 });
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0].containerId).toBe('c');
  });
});

describe('splitForRender', () => {
  it('separates containers preserving order', () => {
    const els = [arg('a'), box('c1'), arg('b'), box('c2')];
    const { containers, others } = splitForRender(els);
    expect(containers.map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(others.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('membersOf', () => {
  it('lists elements pointing at the container', () => {
    const els = [box('c'), arg('a', 1, 1, { containerId: 'c' }), arg('b')];
    expect(membersOf(els, 'c').map((e) => e.id)).toEqual(['a']);
  });
});

describe('fix round 1', () => {
  const qual = (id: string, extra: Partial<ArgumentElement> = {}) =>
    arg(id, 100, 100, { argumentType: 'qualifier', attachedTo: { connectionId: 'k1', position: 0.5 }, ...extra });

  it('normalize clears containerId pointing at a flagged attached qualifier', () => {
    const q = qual('q', { isContainer: true });
    const out = normalizeContainers([q, arg('a', 0, 0, { containerId: 'q' })]);
    expect(byId(out, 'a').containerId).toBeUndefined();
    expect((byId(out, 'q') as ArgumentElement).isContainer).toBeUndefined();
  });
  it('normalize is idempotent by reference', () => {
    const q = qual('q', { isContainer: true });
    const once = normalizeContainers([q, arg('a', 0, 0, { containerId: 'q' })]);
    expect(normalizeContainers(once)).toBe(once);
  });
  it('normalize clears a self containerId', () => {
    const out = normalizeContainers([box('c'), arg('a', 0, 0, { containerId: 'a' })]);
    expect(byId(out, 'a').containerId).toBeUndefined();
  });
  it('normalize clears isContainer on an attached qualifier', () => {
    const out = normalizeContainers([qual('q', { isContainer: true })]);
    expect(out[0]).not.toHaveProperty('isContainer');
  });

  it('duplicate copies qualifiers attached to copied connections', () => {
    const els: DiagramElement[] = [
      box('c'), arg('A', 50, 50, { containerId: 'c' }), arg('B', 250, 50, { containerId: 'c' }), qual('q'),
    ];
    const conns: Connection[] = [{ id: 'k1', from: 'A', to: 'B', type: 'support' }];
    let n = 0;
    const r = duplicateWithMembers(els, conns, ['c'], () => `n${++n}`, { x: 5, y: 5 });
    expect(r.elements).toHaveLength(4);
    const q = r.elements.find((e) => (e as ArgumentElement).argumentType === 'qualifier') as ArgumentElement;
    expect(q.attachedTo!.connectionId).toBe(r.connections[0].id);
    expect(q.attachedTo!.connectionId).not.toBe('k1');
  });
  it('duplicate copies connections from/to a copied qualifier', () => {
    const els: DiagramElement[] = [arg('A', 0, 0), arg('B', 300, 0), qual('q')];
    const conns: Connection[] = [
      { id: 'k1', from: 'A', to: 'B', type: 'support' },
      { id: 'k2', from: 'q', to: 'B', type: 'support' },
    ];
    let n = 0;
    const r = duplicateWithMembers(els, conns, ['A', 'B'], () => `n${++n}`, { x: 5, y: 5 });
    expect(r.connections).toHaveLength(2);
  });

  it('makeContainer returns the same reference when already a big container', () => {
    const els = [box('c')];
    expect(makeContainer(els, 'c')).toBe(els);
  });
  it('unmakeContainer returns the same reference for non-container or missing id', () => {
    const els = [arg('a'), sup('s')];
    expect(unmakeContainer(els, 'a')).toBe(els);
    expect(unmakeContainer(els, 'nope')).toBe(els);
  });

  it('containerDragIds excludes supports belonging to another container', () => {
    const els: DiagramElement[] = [
      box('c'), box('o', 2000, 2000), sup('hang', 480, 100, { containerId: 'o' }), sup('free', 490, 100),
    ];
    const ids = containerDragIds(els, 'c');
    expect(ids).not.toContain('hang');
    expect(ids).toContain('free');
  });

  it('linkCandidates keeps a container when the support center is outside it', () => {
    const c = box('c');
    const s = sup('s', 480, 100); // center x 520 > 500
    const map = new Map<string, DiagramElement>([['c', c]]);
    expect(linkCandidates(s, new Set(['c']), map)).toEqual(new Set(['c']));
  });
  it('duplicate remaps associatedWith when the target was copied', () => {
    const els: DiagramElement[] = [arg('a', 0, 0), sup('s', 10, 10, { associatedWith: 'a' })];
    let n = 0;
    const r = duplicateWithMembers(els, [], ['a', 's'], () => `n${++n}`, { x: 5, y: 5 });
    const s = r.elements.find((e) => e.type === 'support') as SupportElement;
    expect(s.associatedWith).toBe(r.newIds[0]);
  });
  it('duplicate keeps associatedWith unchanged when the target was not copied', () => {
    const els: DiagramElement[] = [arg('a', 0, 0), sup('s', 10, 10, { associatedWith: 'a' })];
    const r = duplicateWithMembers(els, [], ['s'], () => 'n1', { x: 5, y: 5 });
    expect((r.elements[0] as SupportElement).associatedWith).toBe('a');
  });
  it('lone copied member landing outside loses containerId', () => {
    const els = [box('c'), arg('m', 350, 100, { containerId: 'c' })];
    const r = duplicateWithMembers(els, [], ['m'], () => 'n1', { x: 200, y: 0 });
    expect(r.elements[0].containerId).toBeUndefined();
  });
  it('copied connection waypoints are offset', () => {
    const els = [arg('a', 0, 0), arg('b', 300, 0)];
    const conns: Connection[] = [{ id: 'k', from: 'a', to: 'b', type: 'support', waypoints: [{ x: 10, y: 20 }] }];
    let n = 0;
    const r = duplicateWithMembers(els, conns, ['a', 'b'], () => `n${++n}`, { x: 5, y: 7 });
    expect(r.connections[0].waypoints).toEqual([{ x: 15, y: 27 }]);
  });
});

describe('qualifiers never contain', () => {
  const looseQual = (id: string, extra: Partial<ArgumentElement> = {}) =>
    arg(id, 0, 0, { argumentType: 'qualifier', ...extra }, 200, 100);

  it('makeContainer on an unattached qualifier returns the same reference', () => {
    const els = [looseQual('q'), sup('s', 50, 50)];
    expect(makeContainer(els, 'q')).toBe(els);
  });
  it('normalize clears isContainer on an unattached qualifier and releases its members', () => {
    const els = [looseQual('q', { isContainer: true }), arg('a', 20, 20, { containerId: 'q' })];
    const out = normalizeContainers(els);
    expect(byId(out, 'q')).not.toHaveProperty('isContainer');
    expect(byId(out, 'a')).not.toHaveProperty('containerId');
    expect(normalizeContainers(out)).toBe(out);
  });
});
