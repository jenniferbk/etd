import { describe, it, expect } from 'vitest';
import { sortGroups, filterGroups } from './groupView';
import type { ComponentCell, ComponentGroup, MoveCell, ResolvedKind } from './types';

const kind = (id: string, type: 'question' | 'other', category = 'cat'): ResolvedKind =>
  ({ id, label: id, category, type, retired: false, missing: false });
const mc = (id: string, supportType: MoveCell['supportType'], k?: ResolvedKind, content = `move ${id}`): MoveCell =>
  ({ id, text: content, content, time: '', by: 't', supportType, ...(k ? { kind: k } : {}) });
const cell = (id: string, o: Partial<ComponentCell> = {}): ComponentCell => ({
  id, part: 'C', argumentType: 'claim', contributor: 'student', content: `content ${id}`,
  who: '', time: '', qualifier: '', links: '', note: '', ...o,
});
const grp = (
  key: string, order: number, component: ComponentCell | null,
  moves: Partial<Record<'untyped' | 'question' | 'other', MoveCell[]>> = {},
  o: Partial<ComponentGroup> = {},
): ComponentGroup => ({
  key, diagramKey: '1', diagramId: 1, episodeTitle: 'Ep 1', episode: {}, component, order,
  moves: { untyped: [], question: [], other: [], ...moves }, ...o,
});

describe('sortGroups', () => {
  const groups = [
    grp('a', 0, cell('a', { time: '5:00', who: 'Zed' }), { question: [mc('m1', 'question'), mc('m2', 'question')] }),
    grp('b', 1, cell('b', { time: '1:00', who: 'Amy' }), { other: [mc('m3', 'other')] }),
    grp('u', 2, null, { untyped: [mc('m4', 'action')] }),
    grp('c', 3, cell('c', { time: '', who: 'Bob' })),
  ];

  it('never splits a group', () => {
    const out = sortGroups(groups, 'time', 'asc');
    expect(out.map((g) => g.key)).toEqual(['b', 'a', 'c', 'u']);
    for (const g of out) expect(g).toBe(groups.find((x) => x.key === g.key));
    expect(out.find((g) => g.key === 'a')!.moves.question).toHaveLength(2);
  });

  it('keeps blanks and the unlinked group last when descending', () => {
    expect(sortGroups(groups, 'who', 'desc').map((g) => g.key)).toEqual(['a', 'c', 'b', 'u']);
  });

  it('ties keep order and the input is not mutated', () => {
    const tied = [grp('x', 2, cell('x', { part: 'C' })), grp('y', 1, cell('y', { part: 'C' }))];
    expect(sortGroups(tied, 'part', 'asc').map((g) => g.key)).toEqual(['y', 'x']);
    expect(tied.map((g) => g.key)).toEqual(['x', 'y']);
  });

  it('sorts by episode title numerically and status with blank last', () => {
    const gs = [
      grp('p', 0, null, {}, { episodeTitle: 'Ep 10', episode: { status: 'vetted' } }),
      grp('q', 1, null, {}, { episodeTitle: 'Ep 2' }),
      grp('r', 2, null, {}, { episodeTitle: 'Ep 3', episode: { status: 'not vetted' } }),
    ];
    expect(sortGroups(gs, 'episode', 'asc').map((g) => g.key)).toEqual(['q', 'r', 'p']);
    expect(sortGroups(gs, 'status', 'asc').map((g) => g.key)).toEqual(['r', 'p', 'q']);
    expect(sortGroups(gs, 'status', 'desc').map((g) => g.key)).toEqual(['p', 'r', 'q']);
  });
});

describe('filterGroups', () => {
  const g1 = grp('g1', 0, cell('a'), { question: [mc('m1', 'question', kind('k1', 'question', 'probing')), mc('m2', 'question', kind('k2', 'question'))] });
  const g2 = grp('g2', 1, cell('b', { content: 'Fraction Of Pizza' }), { untyped: [mc('m3', 'action')], other: [mc('m4', 'other', kind('k3', 'other'))] }, { episode: { status: 'vetted' } });
  const g3 = grp('g3', 2, null, { untyped: [mc('m5', 'action')] }, { episode: { status: 'not vetted' } });
  const all = [g1, g2, g3];

  it('by kindId keeps whole group', () => {
    const out = filterGroups(all, { kindId: 'k1' });
    expect(out).toEqual([g1]);
    expect(out[0].moves.question).toHaveLength(2);
  });

  it('by category', () => {
    expect(filterGroups(all, { category: 'probing' })).toEqual([g1]);
  });

  it('untypedOnly keeps groups with an untyped move', () => {
    expect(filterGroups(all, { untypedOnly: true })).toEqual([g2, g3]);
  });

  it('mismatchOnly flags a question slot with an other kind, and vice versa', () => {
    const bad = grp('bad', 3, cell('z'), { question: [mc('m6', 'question', kind('ko', 'other'))] });
    const bad2 = grp('bad2', 4, cell('y'), { other: [mc('m7', 'other', kind('kq', 'question'))] });
    expect(filterGroups([...all, bad, bad2], { mismatchOnly: true })).toEqual([bad, bad2]);
  });

  it('status filter, including blank', () => {
    expect(filterGroups(all, { status: 'vetted' })).toEqual([g2]);
    expect(filterGroups(all, { status: 'not vetted' })).toEqual([g3]);
    expect(filterGroups(all, { status: 'blank' })).toEqual([g1]);
  });

  it('unlinkedOnly', () => {
    expect(filterGroups(all, { unlinkedOnly: true })).toEqual([g3]);
  });

  it('text searches component content and move text, case-insensitive', () => {
    expect(filterGroups(all, { text: 'pizza' })).toEqual([g2]);
    expect(filterGroups(all, { text: 'MOVE M5' })).toEqual([g3]);
  });

  it('combines filters with AND and empty filter keeps all', () => {
    expect(filterGroups(all, { status: 'vetted', untypedOnly: true })).toEqual([g2]);
    expect(filterGroups(all, {})).toEqual(all);
  });
});
