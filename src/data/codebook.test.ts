import { describe, it, expect } from 'vitest';
import type { Codebook, CodebookKind } from './types';
import type { StyleConfig } from '../types/styleConfig';
import type { LiveDoc } from '../live/ops';
import {
  resolveKind, mirrorIntoStyleConfig, discoverKinds, findKindByLabel, activeKinds, unknownSubtypes, planCodebookAdditions,
} from './codebook';

const kind = (o: Partial<CodebookKind> & { id: string }): CodebookKind => ({
  label: o.id, category: 'cat', type: 'question', status: 'active', position: 0, ...o,
});
const cb = (kinds: CodebookKind[]): Codebook => ({ groupId: 1, kinds });

const emptySc = (q: StyleConfig['subtypes']['question'] = [], o: StyleConfig['subtypes']['other'] = []): StyleConfig =>
  ({ argumentTypes: {}, supportTypes: {}, subtypes: { question: q, other: o, action: [{ id: 'a', label: 'A' }] } }) as unknown as StyleConfig;

const docWith = (question: { id: string; label: string }[], other: { id: string; label: string }[] = []): LiveDoc =>
  ({ name: 'd', elements: [], connections: [], notes: [], styleConfig: emptySc(question, other) });

describe('codebook', () => {
  it('resolveKind follows merge chain to final label and category', () => {
    const c = cb([
      kind({ id: 'a', label: 'A', category: 'c1', status: 'retired', mergedInto: 'b' }),
      kind({ id: 'b', label: 'B', category: 'c2', status: 'retired', mergedInto: 'c' }),
      kind({ id: 'c', label: 'C', category: 'c3' }),
    ]);
    expect(resolveKind(c, 'a')).toEqual({ id: 'c', label: 'C', category: 'c3', type: 'question', retired: false, missing: false });
  });

  it('resolveKind marks unknown id missing', () => {
    expect(resolveKind(cb([]), 'zzz')).toEqual({ id: 'zzz', label: 'zzz', category: '', type: 'other', retired: false, missing: true });
  });

  it('activeKinds filters by type and status, ordered by position', () => {
    const c = cb([
      kind({ id: 'x', position: 2 }), kind({ id: 'y', position: 1 }),
      kind({ id: 'r', status: 'retired' }), kind({ id: 'o', type: 'other' }),
    ]);
    expect(activeKinds(c, 'question').map((k) => k.id)).toEqual(['y', 'x']);
  });

  it('mirrorIntoStyleConfig preserves style by id and marks retired', () => {
    const c = cb([
      kind({ id: 'displays', label: 'Displays', category: 'k', type: 'other' }),
      kind({ id: 'old', label: 'Old', category: 'k', type: 'other', status: 'retired' }),
      kind({ id: 'merged', label: 'Merged', category: 'k', type: 'other', status: 'retired', mergedInto: 'displays' }),
    ]);
    const sc = emptySc([], [{ id: 'displays', label: 'Displays', style: { borderShape: 'ellipse' } }]);
    const out = mirrorIntoStyleConfig(sc, c);
    expect(out.subtypes.other[0]).toEqual({ id: 'displays', label: 'Displays', category: 'k', style: { borderShape: 'ellipse' } });
    expect(out.subtypes.other[1].retired).toBe(true);
    expect(out.subtypes.other[2]).toMatchObject({ id: 'merged', label: 'Displays', retired: true });
    expect(out.subtypes.action).toBe(sc.subtypes.action);
  });

  it('mirrorIntoStyleConfig returns same reference when unchanged', () => {
    const c = cb([kind({ id: 'q1', label: 'Q1', category: 'k' })]);
    const once = mirrorIntoStyleConfig(emptySc(), c);
    expect(mirrorIntoStyleConfig(once, c)).toBe(once);
  });

  it('discoverKinds dedupes by id keeping most common label', () => {
    const docs = [
      docWith([{ id: 'a', label: 'Why' }]),
      docWith([{ id: 'a', label: 'Why?' }], [{ id: 'o', label: 'Other' }]),
      docWith([{ id: 'a', label: 'Why?' }]),
    ];
    expect(discoverKinds(docs)).toEqual([
      { id: 'a', label: 'Why?', type: 'question' },
      { id: 'o', label: 'Other', type: 'other' },
    ]);
  });

  it('unknownSubtypes returns discovered kinds not in the codebook', () => {
    const docs = [docWith([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])];
    expect(unknownSubtypes(docs, cb([kind({ id: 'a' })])).map((k) => k.id)).toEqual(['b']);
  });

  it('findKindByLabel ignores case and whitespace, skips merged', () => {
    const c = cb([
      kind({ id: 'a', label: 'Why' }),
      kind({ id: 'm', label: 'Gone', status: 'retired', mergedInto: 'a' }),
      kind({ id: 'r', label: 'Retired', status: 'retired', type: 'other' }),
    ]);
    expect(findKindByLabel(c, '  wHy ')?.id).toBe('a');
    expect(findKindByLabel(c, 'gone')).toBeUndefined();
    expect(findKindByLabel(c, 'retired')?.id).toBe('r');
    expect(findKindByLabel(c, 'retired', 'question')).toBeUndefined();
  });

  describe('planCodebookAdditions', () => {
    const q = (id: string, label: string) => ({ id, label, type: 'question' as const });

    it('init sends one kind per label and merges the other ids into it', () => {
      const plan = planCodebookAdditions(null, [q('aaaaaaaa-1', 'Why'), q('bbbbbbbb-2', 'Why'), q('c', 'Other')]);
      expect(plan.init.map((k) => k.id)).toEqual(['aaaaaaaa-1', 'c']);
      expect(plan.add).toEqual([q('bbbbbbbb-2', 'Why (bbbbbbbb)')]);
      expect(plan.mergeInto).toEqual([{ id: 'bbbbbbbb-2', into: 'aaaaaaaa-1' }]);
    });

    it('unknown whose label matches an existing kind is added disambiguated and merged', () => {
      const plan = planCodebookAdditions(cb([kind({ id: 'a', label: 'Why' })]), [q('a', 'Why'), q('newid-123456', 'Why')]);
      expect(plan.init).toEqual([]);
      expect(plan.add).toEqual([q('newid-123456', 'Why (newid-12)')]);
      expect(plan.mergeInto).toEqual([{ id: 'newid-123456', into: 'a' }]);
    });

    it('matches labels case-insensitively and ignoring whitespace', () => {
      const plan = planCodebookAdditions(cb([kind({ id: 'a', label: 'Why' })]), [q('b', '  wHY ')]);
      expect(plan.mergeInto).toEqual([{ id: 'b', into: 'a' }]);
    });

    it('a distinct unknown label is a plain add', () => {
      const plan = planCodebookAdditions(cb([kind({ id: 'a', label: 'Why' })]), [q('b', 'How')]);
      expect(plan).toEqual({ init: [], add: [q('b', 'How')], mergeInto: [] });
    });

    it('plans no merge when the same-label kind is retired', () => {
      const plan = planCodebookAdditions(cb([kind({ id: 'a', label: 'Why', status: 'retired' })]), [q('newid-123456', 'why')]);
      expect(plan.add).toEqual([q('newid-123456', 'why (newid-12)')]);
      expect(plan.mergeInto).toEqual([]);
    });

    it('empty label uses the id', () => {
      const plan = planCodebookAdditions(null, [q('xyz', '  ')]);
      expect(plan.init).toEqual([q('xyz', 'xyz')]);
    });
  });
});
