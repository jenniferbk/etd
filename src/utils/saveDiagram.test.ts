import { describe, it, expect } from 'vitest';
import { toFilename } from './saveDiagram';

describe('toFilename', () => {
  it('slugifies a normal title', () => {
    expect(toFilename('Harper D2 Square')).toBe('harper-d2-square');
  });

  it('collapses runs of non-alphanumerics and trims edges', () => {
    expect(toFilename('  My__Diagram!! (v2) ')).toBe('my-diagram-v2');
  });

  it('falls back to "diagram" when nothing usable remains', () => {
    expect(toFilename('')).toBe('diagram');
    expect(toFilename('!!!')).toBe('diagram');
  });
});
