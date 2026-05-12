import { describe, it, expect, vi } from 'vitest';
import { parseImportedDiagram } from './importedDiagramSchema';

const validResponse = {
  version: '1.4',
  name: 'IMG_3630',
  elements: [
    {
      id: 'import-1', type: 'argument', argumentType: 'data', contributor: 'given',
      label: 'Data 1', content: 'foo',
      position: { x: 0, y: 0 }, size: { width: 100, height: 60 },
    },
    {
      id: 'import-2', type: 'argument', argumentType: 'claim', contributor: 'student',
      label: 'Claim 1', content: 'bar',
      position: { x: 200, y: 0 }, size: { width: 100, height: 60 },
    },
  ],
  connections: [
    { id: 'conn-1', from: 'import-1', to: 'import-2', type: 'support' },
  ],
};

describe('parseImportedDiagram', () => {
  it('returns success for a valid response', () => {
    const result = parseImportedDiagram(validResponse);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.elements).toHaveLength(2);
      expect(result.diagram.connections).toHaveLength(1);
    }
  });

  it('returns empty_diagram error when elements array is empty', () => {
    const empty = { ...validResponse, elements: [] };
    const result = parseImportedDiagram(empty);
    expect(result.kind).toBe('empty_diagram');
  });

  it('returns schema_invalid error when response is malformed', () => {
    const result = parseImportedDiagram({ not: 'a diagram' });
    expect(result.kind).toBe('schema_invalid');
  });

  it('drops connections whose endpoints do not exist in elements', () => {
    const withDangling = {
      ...validResponse,
      connections: [
        ...validResponse.connections,
        { id: 'conn-2', from: 'import-1', to: 'no-such-element', type: 'support' },
      ],
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseImportedDiagram(withDangling);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.connections).toHaveLength(1);
      expect(result.diagram.connections[0].id).toBe('conn-1');
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops elements with duplicate ids, keeping the first', () => {
    const withDupes = {
      ...validResponse,
      elements: [
        ...validResponse.elements,
        { ...validResponse.elements[0] },
      ],
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseImportedDiagram(withDupes);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.diagram.elements).toHaveLength(2);
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
