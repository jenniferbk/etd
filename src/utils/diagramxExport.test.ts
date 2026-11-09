import { describe, expect, it } from 'vitest';
import { exportToDiagramx, hasCounterclaims } from './diagramxExport';
import type { ArgumentElement, Connection, SupportElement } from '../types';
import { createCurrentDefaults } from './styleConfigDefaults';

function claim(id: string, x: number): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: `Claim ${id}`, content: '',
    position: { x, y: 0 }, size: { width: 180, height: 80 },
  };
}

type ConnectorItem = { connector: { _0: { connectorStyle: Record<string, unknown> } } };

function connectorStyles(json: string): Record<string, unknown>[] {
  const doc = JSON.parse(json) as { tabs: { model: { items: unknown[] } }[] };
  return doc.tabs[0].model.items
    .filter((it): it is ConnectorItem => typeof it === 'object' && it !== null && 'connector' in it)
    .map((it) => it.connector._0.connectorStyle);
}

describe('exportToDiagramx connectors', () => {
  const els = [claim('1', 0), claim('2', 400)];

  it('support connections get an end arrowhead', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support' }];
    const styles = connectorStyles(exportToDiagramx(els, conns, 'd'));
    expect(styles).toHaveLength(1);
    expect(styles[0].endArrowheadKind).toBe(1);
    expect(styles[0].endArrowSizeWidth).toBeGreaterThan(0);
  });

  it('counterclaim connections get no arrowhead (slash has no DiagramMix equivalent)', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'counterclaim' }];
    const styles = connectorStyles(exportToDiagramx(els, conns, 'd'));
    expect(styles).toHaveLength(1);
    expect(styles[0].endArrowheadKind).toBeUndefined();
    expect(styles[0].endArrowSizeWidth).toBe(0);
  });
});

describe('exportToDiagramx arrowhead override', () => {
  const els = [claim('1', 0), claim('2', 400)];

  it('support with arrowhead:false exports without end arrow', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support', arrowhead: false }];
    const styles = connectorStyles(exportToDiagramx(els, conns, 'd'));
    expect(styles[0].endArrowheadKind).toBeUndefined();
  });

  it('rebuttal→attached qualifier exports without end arrow', () => {
    const qual: ArgumentElement = {
      id: 'q', type: 'argument', argumentType: 'qualifier', contributor: 'student',
      label: 'Q', content: '',
      position: { x: 240, y: 20 }, size: { width: 100, height: 40 },
      attachedTo: { connectionId: 'base', position: 0.5 },
    };
    const src = { ...claim('r', 200), position: { x: 200, y: -300 } };
    const conns: Connection[] = [
      { id: 'base', from: '1', to: '2', type: 'support', arrowhead: false },
      { id: 'r1', from: 'r', to: 'q', type: 'rebuttal' },
    ];
    const styles = connectorStyles(exportToDiagramx([...els, qual, src], conns, 'd'));
    expect(styles).toHaveLength(2);
    expect(styles.every((s) => s.endArrowheadKind === undefined)).toBe(true);
  });
});

describe('hasCounterclaims', () => {
  it('is true only when at least one connection is a counterclaim', () => {
    expect(hasCounterclaims([])).toBe(false);
    expect(hasCounterclaims([{ id: 'a', from: '1', to: '2', type: 'support' }])).toBe(false);
    expect(hasCounterclaims([
      { id: 'a', from: '1', to: '2', type: 'support' },
      { id: 'b', from: '2', to: '1', type: 'counterclaim' },
    ])).toBe(true);
  });
});

describe('exportToDiagramx support fills', () => {
  type SymbolItem = { symbol: { _0: { fill?: { opacity: number } } } };
  function fills(json: string) {
    const doc = JSON.parse(json) as { tabs: { model: { items: unknown[] } }[] };
    return doc.tabs[0].model.items
      .filter((it): it is SymbolItem => typeof it === 'object' && it !== null && 'symbol' in it)
      .map((it) => it.symbol._0.fill?.opacity);
  }
  const support = (id: string, subtype: string): SupportElement => ({
    id, type: 'support', contributor: 'teacher', supportType: 'other', subtype,
    content: 'x', position: { x: 0, y: 0 }, size: { width: 160, height: 60 },
  });

  it('Displays exports unfilled (white); other subtypes keep the yellow fill', () => {
    const json = exportToDiagramx(
      [support('a', 'displays'), support('b', 'suggests')], [], 'd', createCurrentDefaults(),
    );
    expect(fills(json)).toEqual([0, 1]);
  });
});
