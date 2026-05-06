import { describe, it, expect } from 'vitest';
import { generateCloudPath, computeCloudGeometry } from './cloudPath';

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
    const path = generateCloudPath(140, 60);
    expect(countCommand(path, 'M')).toBe(1);
  });

  it('emits 2 * (longBumps + shortBumps) arc commands at default 140x60', () => {
    const geom = computeCloudGeometry(140, 60);
    const path = generateCloudPath(140, 60);
    expect(countCommand(path, 'A')).toBe(2 * (geom.longBumps + geom.shortBumps));
  });

  it('emits the right arc count for square 80x80', () => {
    const geom = computeCloudGeometry(80, 80);
    const path = generateCloudPath(80, 80);
    expect(countCommand(path, 'A')).toBe(2 * (geom.longBumps + geom.shortBumps));
  });

  it('emits the right arc count for tall 60x140', () => {
    const geom = computeCloudGeometry(60, 140);
    const path = generateCloudPath(60, 140);
    expect(countCommand(path, 'A')).toBe(2 * (geom.longBumps + geom.shortBumps));
  });

  it('produces structurally equivalent paths for 140x60 and 60x140 (rotational symmetry)', () => {
    const wide = computeCloudGeometry(140, 60);
    const tall = computeCloudGeometry(60, 140);
    expect(wide.longBumps).toBe(tall.longBumps);
    expect(wide.shortBumps).toBe(tall.shortBumps);
    expect(wide.longRadius).toBeCloseTo(tall.longRadius, 6);
    expect(wide.shortRadius).toBeCloseTo(tall.shortRadius, 6);
    expect(wide.isWide).toBe(true);
    expect(tall.isWide).toBe(false);
  });

  it('clamps long-side bump count at floor (4) for small sizes', () => {
    const geom = computeCloudGeometry(60, 30);
    expect(geom.longBumps).toBe(4);
    expect(geom.shortBumps).toBe(1);
  });

  it('clamps long-side bump count at ceiling (12) for very wide sizes', () => {
    const geom = computeCloudGeometry(400, 100);
    expect(geom.longBumps).toBe(12);
  });

  it('clamps short-side bump count at ceiling (4) for tall+wide sizes', () => {
    const geom = computeCloudGeometry(400, 200);
    expect(geom.shortBumps).toBe(4);
  });

  it('keeps arc endpoints within the bbox plus 3px tolerance', () => {
    // Walk the path and check that every arc's endpoint stays within [-3, width+3] x [-3, height+3]. (Endpoints are necessary-but-not-sufficient for full bbox containment, but the construction guarantees apexes by simultaneous-equation solution.)
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
        expect(ex).toBeGreaterThanOrEqual(-3);
        expect(ex).toBeLessThanOrEqual(w + 3);
        expect(ey).toBeGreaterThanOrEqual(-3);
        expect(ey).toBeLessThanOrEqual(h + 3);
        i += 8;
      } else if (t === 'Z' || t === '') {
        i += 1;
      } else {
        throw new Error(`unexpected token in path at index ${i}: ${JSON.stringify(t)}`);
      }
    }
  });
});
