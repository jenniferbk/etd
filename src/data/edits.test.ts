import { describe, it, expect } from 'vitest';
import { editsToOps, type CellEdit } from './edits';
import type { LiveDoc } from '../live/ops';

const doc = (elements: Array<Record<string, unknown> & { id: string }>, extra: Record<string, unknown> = {}): LiveDoc =>
  ({ name: 'Doc', elements, connections: [], notes: [], ...extra }) as LiveDoc;

const mv = (id: string, supportType: string, o: Record<string, unknown> = {}) =>
  ({ id, type: 'support', supportType, contributor: 'teacher', content: 'm', ...o });
const comp = (id: string, o: Record<string, unknown> = {}) =>
  ({ id, type: 'argument', argumentType: 'claim', contributor: 'student', content: 'c', ...o });

describe('editsToOps', () => {
  it('moveType then moveKind in one batch yields patch supportType then patch subtype', () => {
    const d = doc([mv('m1', 'action')]);
    const edits: CellEdit[] = [
      { kind: 'moveType', moveId: 'm1', supportType: 'question' },
      { kind: 'moveKind', moveId: 'm1', kindId: 'k1' },
    ];
    expect(editsToOps(edits, d)).toEqual([
      { t: 'patch', c: 'elements', id: 'm1', fields: { supportType: 'question', subtype: null } },
      { t: 'patch', c: 'elements', id: 'm1', fields: { subtype: 'k1' } },
    ]);
  });

  it('moveKind on an action move yields no op', () => {
    const d = doc([mv('m1', 'action')]);
    expect(editsToOps([{ kind: 'moveKind', moveId: 'm1', kindId: 'k1' }], d)).toEqual([]);
  });

  it('moveKind null clears the subtype', () => {
    const d = doc([mv('m1', 'other', { subtype: 'k1' })]);
    expect(editsToOps([{ kind: 'moveKind', moveId: 'm1', kindId: null }], d)).toEqual([
      { t: 'patch', c: 'elements', id: 'm1', fields: { subtype: null } },
    ]);
  });

  it('episode null sends only that field as null', () => {
    const d = doc([], { episode: { status: 'vetted', sgwc: 'SG' } });
    expect(editsToOps([{ kind: 'episode', field: 'status', value: null }], d)).toEqual([
      { t: 'set', k: 'episode', value: { status: null } },
    ]);
  });

  it('episode edits send only the edited field, never the whole object', () => {
    const d = doc([], { episode: { status: 'vetted' } });
    const ops = editsToOps(
      [
        { kind: 'episode', field: 'discipline', value: 'math' },
        { kind: 'episode', field: 'clip', value: 'x' },
      ],
      d,
    );
    expect(ops).toEqual([
      { t: 'set', k: 'episode', value: { discipline: 'math' } },
      { t: 'set', k: 'episode', value: { clip: 'x' } },
    ]);
  });

  it('title sets name', () => {
    expect(editsToOps([{ kind: 'title', value: 'New' }], doc([]))).toEqual([{ t: 'set', k: 'name', value: 'New' }]);
  });

  it('attribution merges', () => {
    const d = doc([comp('a', { attribution: { speaker: 'Ana', timestamp: '1:00' } })]);
    expect(editsToOps([{ kind: 'attribution', elementId: 'a', field: 'timestamp', value: '2:00' }], d)).toEqual([
      { t: 'patch', c: 'elements', id: 'a', fields: { attribution: { speaker: 'Ana', timestamp: '2:00' } } },
    ]);
  });

  it('attribution on an element with none fills the other field with empty text', () => {
    const d = doc([comp('a')]);
    expect(editsToOps([{ kind: 'attribution', elementId: 'a', field: 'speaker', value: 'Bo' }], d)).toEqual([
      { t: 'patch', c: 'elements', id: 'a', fields: { attribution: { speaker: 'Bo', timestamp: '' } } },
    ]);
  });

  it('content, part and contributor patch the element', () => {
    const d = doc([comp('a')]);
    expect(
      editsToOps(
        [
          { kind: 'elementContent', elementId: 'a', value: 'hi' },
          { kind: 'part', elementId: 'a', argumentType: 'warrant' },
          { kind: 'contributor', elementId: 'a', value: 'teacher' },
        ],
        d,
      ),
    ).toEqual([
      { t: 'patch', c: 'elements', id: 'a', fields: { content: 'hi' } },
      { t: 'patch', c: 'elements', id: 'a', fields: { argumentType: 'warrant' } },
      { t: 'patch', c: 'elements', id: 'a', fields: { contributor: 'teacher' } },
    ]);
  });

  it('edits naming a missing element yield no op', () => {
    const d = doc([]);
    expect(
      editsToOps(
        [
          { kind: 'elementContent', elementId: 'zz', value: 'x' },
          { kind: 'attribution', elementId: 'zz', field: 'speaker', value: 'x' },
          { kind: 'moveType', moveId: 'zz', supportType: 'other' },
          { kind: 'moveKind', moveId: 'zz', kindId: 'k' },
        ],
        d,
      ),
    ).toEqual([]);
  });
});
