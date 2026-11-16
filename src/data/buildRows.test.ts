import { describe, it, expect } from 'vitest';
import { buildGroups, buildDataset, clipSuggestion, parseTimeSeconds, toRows } from './buildRows';
import { DATA_COLUMNS } from './columns';
import type { Codebook, DiagramDocInput } from './types';
import type { LiveDoc } from '../live/ops';

type E = Record<string, unknown> & { id: string };

const arg = (id: string, argumentType: string, o: Record<string, unknown> = {}): E => ({
  id, type: 'argument', argumentType, contributor: 'student', label: id, content: `content ${id}`,
  position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, ...o,
});
const move = (id: string, supportType: string, assoc: string | undefined, o: Record<string, unknown> = {}): E => ({
  id, type: 'support', supportType, contributor: 'teacher', content: `move ${id}`,
  position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, ...(assoc ? { associatedWith: assoc } : {}), ...o,
});
const at = (timestamp: string, speaker = '') => ({ attribution: { speaker, timestamp } });
const doc = (elements: E[], connections: E[] = [], notes: E[] = [], extra: Record<string, unknown> = {}): LiveDoc =>
  ({ name: 'Doc', elements, connections, notes, ...extra }) as LiveDoc;
const input = (d: LiveDoc, title = 'Episode A', diagramId: number | null = 1): DiagramDocInput =>
  ({ diagramId, title, versionId: 1, folderId: null, doc: d });

describe('parseTimeSeconds', () => {
  it('handles ranges, h:mm:ss, and blank', () => {
    expect(parseTimeSeconds('75:07-75:58')).toBe(4507);
    expect(parseTimeSeconds('1:21:38')).toBe(4898);
    expect(parseTimeSeconds('')).toBeNull();
  });
});

describe('buildGroups', () => {
  it('orders given first then by time, blank last', () => {
    const d = doc([
      arg('a', 'claim', { attribution: { speaker: '', timestamp: '53:18' } }),
      arg('b', 'claim', { attribution: { speaker: '', timestamp: '1:21:38' } }),
      arg('c', 'claim', { attribution: { speaker: '', timestamp: '75:07-75:58' } }),
      arg('d', 'claim'),
      arg('e', 'claim', { attribution: { speaker: '', timestamp: '0:41:32' } }),
      arg('g', 'data', { contributor: 'given', position: { x: 0, y: 500 } }),
    ]);
    expect(buildGroups(input(d), null).map((g) => g.key)).toEqual(['g', 'e', 'a', 'c', 'b', 'd']);
  });

  it('pairs moves across slots by index', () => {
    const d = doc([
      arg('c1', 'claim'),
      move('u1', 'action', 'c1', at('1:00')), move('u2', 'action', 'c1', at('2:00')),
      move('q1', 'question', 'c1'),
      move('o1', 'other', 'c1', at('3:00')), move('o2', 'other', 'c1', at('1:00')), move('o3', 'other', 'c1', at('2:00')),
    ]);
    const rows = toRows(buildGroups(input(d), null));
    expect(rows).toHaveLength(3);
    expect(rows[0].untyped && rows[0].question && rows[0].other).toBeTruthy();
    expect(rows[2].other?.id).toBe('o1');
    expect(rows[2].untyped).toBeUndefined();
    expect(rows[2].question).toBeUndefined();
    expect(rows.map((r) => r.firstOfGroup)).toEqual([true, false, false]);
  });

  it('shares slots between student and teacher moves; by drops Student- prefix', () => {
    const d = doc([
      arg('c1', 'claim'),
      move('m1', 'action', 'c1', { contributor: 'student', ...at('1:00', 'Student-Ana') }),
      move('m2', 'action', 'c1', { contributor: 'teacher', ...at('2:00') }),
    ]);
    const [g] = buildGroups(input(d), null);
    expect(g.moves.untyped.map((m) => m.by)).toEqual(['Ana', 'teacher']);
    expect(g.moves.untyped[0].text).toBe('move m1 (1:00)');
    expect(g.moves.untyped[1].text).toBe('move m2 (2:00)');
  });

  it('folds attached qualifier into its claim and moves its moves there', () => {
    const d = doc(
      [
        arg('d1', 'data'), arg('c1', 'claim'),
        arg('q1', 'qualifier', { content: 'probably', attachedTo: { connectionId: 'k1', position: 0.5 } }),
        arg('q2', 'qualifier', { content: 'orphan' }),
        move('m1', 'question', 'q1'),
      ],
      [{ id: 'k1', from: 'd1', to: 'c1', type: 'support' }],
    );
    const groups = buildGroups(input(d), null);
    expect(groups.map((g) => g.key).sort()).toEqual(['c1', 'd1', 'q2']);
    const c1 = groups.find((g) => g.key === 'c1')!;
    expect(c1.component?.qualifier).toBe('probably');
    expect(c1.moves.question.map((m) => m.id)).toEqual(['m1']);
    expect(groups.find((g) => g.key === 'q2')!.component?.part).toBe('Q');
  });

  it('collects unlinked and dangling moves into a trailing component-null group', () => {
    const d = doc([arg('c1', 'claim'), move('m1', 'action', undefined), move('m2', 'other', 'gone'), move('m3', 'action', 'c1')]);
    const groups = buildGroups(input(d, 'T', 7), null);
    expect(groups).toHaveLength(2);
    const last = groups[1];
    expect(last.component).toBeNull();
    expect(last.key).toBe('unlinked:7');
    expect(last.moves.untyped.map((m) => m.id)).toEqual(['m1']);
    expect(last.moves.other.map((m) => m.id)).toEqual(['m2']);
    expect(buildGroups(input(d, 'T', null), null)[1].key).toBe('unlinked:local');
  });

  it('gives a component with no moves one row', () => {
    expect(toRows(buildGroups(input(doc([arg('c1', 'claim')])), null))).toHaveLength(1);
  });

  it('does not alter the title and leaves status blank', () => {
    const [g] = buildGroups(input(doc([arg('c1', 'claim')]), 'Y2_X not vetted'), null);
    expect(g.episodeTitle).toBe('Y2_X not vetted');
    expect(g.episode.status).toBeUndefined();
  });

  it('builds links, notes, and resolves kinds only with a codebook', () => {
    const cb: Codebook = { groupId: 1, kinds: [{ id: 'k', label: 'Probe', category: 'Elicit', type: 'question', status: 'active', position: 0 }] };
    const d = doc(
      [arg('d1', 'data', { label: 'Data 1' }), arg('c1', 'claim', { label: 'Claim 1' }), move('m1', 'question', 'c1', { subtype: 'k' })],
      [
        { id: 'k1', from: 'd1', to: 'c1', type: 'support' },
        { id: 'k2', from: 'c1', to: { connectionId: 'k1', position: 0.5 }, type: 'counterclaim' },
      ],
      [{ id: 'n1', text: 'one', anchor: { kind: 'element', id: 'd1' } }, { id: 'n2', text: 'two', anchor: { kind: 'element', id: 'd1' } }],
    );
    const groups = buildGroups(input(d), cb);
    const d1 = groups.find((g) => g.key === 'd1')!.component!;
    expect(d1.links).toBe('→ Claim 1');
    expect(d1.note).toBe('one | two');
    expect(groups.find((g) => g.key === 'c1')!.component!.links).toBe('→ link Data 1→Claim 1');
    expect(groups.find((g) => g.key === 'c1')!.moves.question[0].kind?.label).toBe('Probe');
    expect(buildGroups(input(d), null).find((g) => g.key === 'c1')!.moves.question[0].kind).toBeUndefined();
  });
});

describe('clipSuggestion', () => {
  it('reads bracketed range from infoBox', () => {
    const d = doc([{ id: 'i', type: 'infoBox', content: 'Lesson notes [12:00-14:30] more' } as E]);
    expect(clipSuggestion(d)).toBe('12:00-14:30');
    expect(clipSuggestion(doc([]))).toBeUndefined();
  });
});

describe('buildDataset and toRows', () => {
  it('orders episodes by title numerically and flags first rows of episodes', () => {
    const mk = (t: string, id: number) => input(doc([arg('c1', 'claim')]), t, id);
    const groups = buildDataset([mk('Ep 10', 1), mk('Ep 2', 2)], null);
    expect(groups.map((g) => g.episodeTitle)).toEqual(['Ep 2', 'Ep 10']);
    expect(groups.map((g) => g.order)).toEqual([0, 1]);
    const rows = toRows(groups);
    expect(rows.map((r) => r.firstOfEpisode)).toEqual([true, true]);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });
});

describe('DATA_COLUMNS', () => {
  it('matches spec 3.1', () => {
    expect(DATA_COLUMNS[8].header).toBe('Content of component');
    expect(DATA_COLUMNS.filter((c) => !c.hidden).map((c) => c.header)).toEqual([
      '#', 'Episode', 'Clip', 'Status', 'SG/WC', 'Discipline', 'Part', 'Contributor', 'Content of component', 'Who', 'Time', 'Qualifier',
      'Move', 'By', 'Type', 'Kind', 'Category', 'Question', 'By', 'Kind', 'Category', 'Other', 'By', 'Kind', 'Category', 'Links to', 'Note',
    ]);
    expect(DATA_COLUMNS.filter((c) => c.hidden).map((c) => c.key)).toEqual([
      'component_id', 'move_id_untyped', 'move_id_question', 'move_id_other', 'diagram_id', 'first_row_of_component',
    ]);
  });
});
