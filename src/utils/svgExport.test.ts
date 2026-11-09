import { describe, expect, it } from 'vitest';
import { exportToSvg } from './svgExport';
import { createCurrentDefaults } from './styleConfigDefaults';
import type { ArgumentElement, Connection } from '../types';

function claim(id: string, x: number): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: `Claim ${id}`, content: '',
    position: { x, y: 0 }, size: { width: 180, height: 80 },
  };
}

const slashCount = (svg: string) =>
  (svg.match(/<line x1="[-\d.]+" y1="[-\d.]+" x2="[-\d.]+" y2="[-\d.]+" stroke="#333333" stroke-width="2" stroke-linecap="round"\/>/g) ?? []).length;

describe('exportToSvg connections', () => {
  const els = [claim('1', 0), claim('2', 400)];

  it('support connections keep the arrowhead marker and draw no slash', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support' }];
    const svg = exportToSvg(els, conns, createCurrentDefaults());
    expect(svg).toContain('marker-end="url(#arrowhead)"');
    expect(slashCount(svg)).toBe(0);
  });

  it('counterclaim connections drop the arrowhead and add exactly one slash line', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'counterclaim' }];
    const svg = exportToSvg(els, conns, createCurrentDefaults());
    expect(svg).not.toContain('marker-end=');
    expect(slashCount(svg)).toBe(1);
  });

  it('a counterclaim attached to another line also gets the slash', () => {
    const w = claim('w', 200);
    const conns: Connection[] = [
      { id: 'base', from: '1', to: '2', type: 'support' },
      { id: 'cc', from: 'w', to: { connectionId: 'base', position: 0.5 }, type: 'counterclaim' },
    ];
    const svg = exportToSvg([...els, w], conns, createCurrentDefaults());
    expect(slashCount(svg)).toBe(1);
  });

  it('support connector with arrowhead:false has no marker-end', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'support', arrowhead: false }];
    const svg = exportToSvg(els, conns, createCurrentDefaults());
    expect(svg).not.toContain('marker-end=');
  });

  it('counterclaim with arrowhead:true has marker-end and still has slash line', () => {
    const conns: Connection[] = [{ id: 'c', from: '1', to: '2', type: 'counterclaim', arrowhead: true }];
    const svg = exportToSvg(els, conns, createCurrentDefaults());
    expect(svg).toContain('marker-end="url(#arrowhead)"');
    expect(slashCount(svg)).toBe(1);
  });

  it('warrant attachment with arrowhead:true has marker-end', () => {
    const w = claim('w', 200);
    const conns: Connection[] = [
      { id: 'base', from: '1', to: '2', type: 'counterclaim' },
      { id: 'att', from: 'w', to: { connectionId: 'base', position: 0.5 }, type: 'support', arrowhead: true },
    ];
    const svg = exportToSvg([...els, w], conns, createCurrentDefaults());
    expect(svg.match(/marker-end=/g)).toHaveLength(1);
  });

  it('diagram with no overrides renders identical SVG to before', () => {
    const w = claim('w', 200);
    const conns: Connection[] = [
      { id: 'base', from: '1', to: '2', type: 'support' },
      { id: 'cc', from: 'w', to: { connectionId: 'base', position: 0.5 }, type: 'counterclaim' },
      { id: 'att', from: 'w', to: { connectionId: 'base', position: 0.3 }, type: 'support' },
    ];
    const svg = exportToSvg([...els, w], conns, createCurrentDefaults());
    expect(svg.match(/marker-end=/g)).toHaveLength(1);
    expect(svg).toMatch(/<polyline [^>]*marker-end/);
    expect(slashCount(svg)).toBe(1);
  });

  describe('rebuttal to attached qualifier', () => {
    const qual: ArgumentElement = {
      id: 'q', type: 'argument', argumentType: 'qualifier', contributor: 'student',
      label: 'Q', content: '',
      position: { x: 240, y: 20 }, size: { width: 100, height: 40 },
      attachedTo: { connectionId: 'base', position: 0.5 },
    };
    const src: ArgumentElement = { ...claim('r', 200), position: { x: 200, y: -300 } };
    const base: Connection = { id: 'base', from: '1', to: '2', type: 'support' };
    const verticalLine = (svg: string) => {
      const m = svg.match(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#000000" stroke-width="1.5"([^>]*)\/>/);
      return m ? { y1: Number(m[2]), y2: Number(m[4]), rest: m[5] } : null;
    };

    it('aligned rebuttal→qualifier with arrowhead:true ends at qualifier top edge with marker-end', () => {
      const conns: Connection[] = [base, { id: 'r1', from: 'r', to: 'q', type: 'rebuttal', arrowhead: true }];
      const svg = exportToSvg([...els, qual, src], conns, createCurrentDefaults());
      const line = verticalLine(svg)!;
      expect(line).not.toBeNull();
      expect(line.rest).toContain('marker-end="url(#arrowhead)"');
      expect(line.y2 - line.y1).toBe(qual.position.y - (src.position.y + src.size.height));
    });

    it('rebuttal→qualifier without override keeps the old line and no marker', () => {
      const conns: Connection[] = [base, { id: 'r1', from: 'r', to: 'q', type: 'rebuttal' }];
      const svg = exportToSvg([...els, qual, src], conns, createCurrentDefaults());
      const line = verticalLine(svg)!;
      expect(line.rest).not.toContain('marker-end');
      expect(line.y2 - line.y1).toBe(qual.position.y + qual.size.height / 2 - (src.position.y + src.size.height));
    });
  });
});
