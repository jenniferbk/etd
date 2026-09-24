import { describe, it, expect } from 'vitest';
import { toFilename, buildDiagramFile, nameForLoadedFile } from './saveDiagram';
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

describe('nameForLoadedFile', () => {
  it('keeps a real stored title', () => {
    expect(nameForLoadedFile('Cora_Y2_D2_trapezoid', 'cora-y2-d2_trapezoid.json')).toBe('Cora_Y2_D2_trapezoid');
  });

  it('falls back to the filename when the stored title is the default', () => {
    expect(nameForLoadedFile('Untitled Diagram', 'Y2_4M_Harper_Day2_triangle.json')).toBe('Y2_4M_Harper_Day2_triangle');
  });

  it('falls back to the filename when the title is missing or blank', () => {
    expect(nameForLoadedFile(undefined, 'Daisy.JSON')).toBe('Daisy');
    expect(nameForLoadedFile('   ', 'Daisy.json')).toBe('Daisy');
  });

  it('uses the default when neither is usable', () => {
    expect(nameForLoadedFile(undefined, '.json')).toBe('Untitled Diagram');
  });
});
