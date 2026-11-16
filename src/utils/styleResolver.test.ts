import { describe, expect, it } from 'vitest';
import type { Subtype } from '../types/styleConfig';
import type { StyleConfig } from '../types/styleConfig';
import { findSubtype, visibleSubtypes } from './styleResolver';

describe('visibleSubtypes', () => {
  const list: Subtype[] = [
    { id: 'old', label: 'Old', retired: true },
    { id: 'displays', label: 'Displays' },
    { id: 'merged', label: 'Displays', retired: true }, // merged into displays
    { id: 'asks', label: 'Asks' },
  ];

  it('hides retired and merged kinds, so the first choice is never retired', () => {
    expect(visibleSubtypes(list).map((s) => s.id)).toEqual(['displays', 'asks']);
  });

  it('keeps the current kind even when retired', () => {
    expect(visibleSubtypes(list, 'old').map((s) => [s.id, s.label])).toEqual([
      ['old', 'Old'], ['displays', 'Displays'], ['asks', 'Asks'],
    ]);
  });

  it('a current merged kind does not repeat its label', () => {
    const out = visibleSubtypes(list, 'merged');
    expect(out.map((s) => s.id)).toEqual(['displays', 'merged', 'asks']);
    expect(new Set(out.map((s) => s.label)).size).toBe(out.length);
    expect(out[1].label).toBe('Displays (merged)');
  });
});

describe('findSubtype', () => {
  const sc = {
    subtypes: {
      question: [{ id: 'q', label: 'Q' }, { id: 'both', label: 'In question' }],
      other: [{ id: 'moved', label: 'Moved kind', style: { backgroundColor: '#fff' } }, { id: 'both', label: 'In other' }],
      action: [],
    },
  } as unknown as StyleConfig;

  it("finds the id in the element's own bucket first", () => {
    expect(findSubtype(sc, 'question', 'both')?.label).toBe('In question');
    expect(findSubtype(sc, 'other', 'both')?.label).toBe('In other');
  });

  it("falls back to the other bucket when the kind's type changed", () => {
    expect(findSubtype(sc, 'question', 'moved')?.label).toBe('Moved kind');
    expect(findSubtype(sc, 'other', 'q')?.label).toBe('Q');
  });

  it('returns undefined for an unknown id or no id', () => {
    expect(findSubtype(sc, 'question', 'gone')).toBeUndefined();
    expect(findSubtype(sc, 'other', undefined)).toBeUndefined();
  });
});
