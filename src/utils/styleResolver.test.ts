import { describe, expect, it } from 'vitest';
import type { Subtype } from '../types/styleConfig';
import { visibleSubtypes } from './styleResolver';

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
