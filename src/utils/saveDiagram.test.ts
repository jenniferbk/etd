import { describe, it, expect } from 'vitest';
import { toFilename, buildDiagramFile } from './saveDiagram';
import { SAVE_SCHEMA_VERSION } from './schema';

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

describe('buildDiagramFile', () => {
  it('produces the exact local save-file shape', () => {
    const file = buildDiagramFile({
      diagramName: 'My Argument',
      elements: [],
      connections: [],
      styleConfig: {} as never,
      transcript: null,
      notes: [],
    });
    expect(file).toEqual({
      version: SAVE_SCHEMA_VERSION,
      name: 'My Argument',
      elements: [],
      connections: [],
      styleConfig: {},
      transcript: null,
      notes: [],
    });
  });
});
