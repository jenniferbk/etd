import { describe, it, expect } from 'vitest';
import { generateCloudPath, computeCloudGeometry, MAX_LOBES, MIN_LOBES } from './cloudPath';

function countCommand(path: string, cmd: string): number {
  return (path.match(new RegExp(cmd, 'g')) ?? []).length;
}

describe('generateCloudPath', () => {
  it('returns a non-empty string starting with M and ending with Z', () => {
    const path = generateCloudPath(140, 60);
    expect(path.length).toBeGreaterThan(0);
    expect(path.trim().startsWith('M')).toBe(true);
    expect(path.trim().endsWith('Z')).toBe(true);
  });

  it('produces a single subpath (one M command)', () => {
    expect(countCommand(generateCloudPath(140, 60), 'M')).toBe(1);
  });

  it('emits one arc per lobe (totalLobes) at default 140x60', () => {
    const geom = computeCloudGeometry(140, 60);
    expect(countCommand(generateCloudPath(140, 60), 'A')).toBe(geom.totalLobes);
  });

  it('emits the right arc count for square 80x80 and tall 60x140', () => {
    const square = computeCloudGeometry(80, 80);
    expect(countCommand(generateCloudPath(80, 80), 'A')).toBe(square.totalLobes);
    const tall = computeCloudGeometry(60, 140);
    expect(countCommand(generateCloudPath(60, 140), 'A')).toBe(tall.totalLobes);
  });

  it('is rotationally symmetric: 140x60 and 60x140 swap top/side lobe counts', () => {
    const wide = computeCloudGeometry(140, 60);
    const tall = computeCloudGeometry(60, 140);
    expect(wide.inset).toBeCloseTo(tall.inset, 6);
    expect(wide.topLobes).toBe(tall.leftLobes);
    expect(wide.leftLobes).toBe(tall.topLobes);
    expect(wide.totalLobes).toBe(tall.totalLobes);
  });

  it('clamps lobe counts within [MIN_LOBES, MAX_LOBES]', () => {
    const tiny = computeCloudGeometry(40, 30);
    expect(tiny.topLobes).toBeGreaterThanOrEqual(MIN_LOBES);
    expect(tiny.leftLobes).toBeGreaterThanOrEqual(MIN_LOBES);
    const huge = computeCloudGeometry(2000, 2000);
    expect(huge.topLobes).toBeLessThanOrEqual(MAX_LOBES);
    expect(huge.leftLobes).toBeLessThanOrEqual(MAX_LOBES);
  });

  it('keeps every arc endpoint (valley) within the bounding box', () => {
    const w = 140, h = 60;
    const path = generateCloudPath(w, h);
    const tokens = path.split(/\s+/);
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t === 'M') {
        i += 3;
      } else if (t === 'A') {
        const ex = parseFloat(tokens[i + 6]);
        const ey = parseFloat(tokens[i + 7]);
        expect(ex).toBeGreaterThanOrEqual(0);
        expect(ex).toBeLessThanOrEqual(w);
        expect(ey).toBeGreaterThanOrEqual(0);
        expect(ey).toBeLessThanOrEqual(h);
        i += 8;
      } else if (t === 'Z' || t === '') {
        i += 1;
      } else {
        throw new Error(`unexpected token in path at index ${i}: ${JSON.stringify(t)}`);
      }
    }
  });

  it('uses fat (large-arc) lobes for typical sizes', () => {
    // With lobe width ≈ 1.5·inset, inset > chord/2, so large-arc flag is 1.
    const path = generateCloudPath(140, 60);
    // arc params: "A r r 0 <largeArc> 1 x y" — every large-arc flag should be 1.
    const arcs = path.match(/A [^A]+/g) ?? [];
    expect(arcs.length).toBeGreaterThan(0);
    for (const arc of arcs) {
      const parts = arc.trim().split(/\s+/);
      expect(parts[4]).toBe('1'); // large-arc flag
      expect(parts[5]).toBe('1'); // sweep flag (outward)
    }
  });
});
