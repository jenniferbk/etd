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
});
