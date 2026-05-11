import { describe, it, expect } from 'vitest';
import { resolveAnchor, computeRule1Path } from './orthogonalRouting';
import type { DiagramElement, EdgeAnchor } from '../types';

function box(x: number, y: number, w: number, h: number): DiagramElement {
  return {
    id: 'el', type: 'argument', argumentType: 'data', contributor: 'given',
    label: '', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

describe('resolveAnchor', () => {
  it('resolves left-edge anchor to (left, top + t*height)', () => {
    const a: EdgeAnchor = { edge: 'left', t: 0.5 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 10, y: 60 });
  });

  it('resolves right-edge anchor to (right, top + t*height)', () => {
    const a: EdgeAnchor = { edge: 'right', t: 0.25 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 110, y: 40 });
  });

  it('resolves top-edge anchor to (left + t*width, top)', () => {
    const a: EdgeAnchor = { edge: 'top', t: 0.75 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 85, y: 20 });
  });

  it('resolves bottom-edge anchor to (left + t*width, bottom)', () => {
    const a: EdgeAnchor = { edge: 'bottom', t: 0 };
    expect(resolveAnchor(box(10, 20, 100, 80), a)).toEqual({ x: 10, y: 100 });
  });
});

function dataBox(x: number, y: number, w: number, h: number): DiagramElement {
  return {
    id: 'd', type: 'argument', argumentType: 'data', contributor: 'given',
    label: '', content: '', position: { x, y }, size: { width: w, height: h },
  };
}
function claimBox(x: number, y: number, w = 100, h = 60): DiagramElement {
  return {
    id: 'c', type: 'argument', argumentType: 'claim', contributor: 'student',
    label: '', content: '', position: { x, y }, size: { width: w, height: h },
  };
}

describe('computeRule1Path', () => {
  it('returns a horizontal 2-point line when target.y is inside tall data source extent, target to right', () => {
    const d = dataBox(0, 0, 100, 500);
    const c = claimBox(300, 200, 100, 60);
    const result = computeRule1Path(d, c);
    expect(result).not.toBeNull();
    expect(result).toEqual([100, 230, 300, 230]);
  });

  it('returns a horizontal 2-point line for target-to-left case', () => {
    const d = dataBox(500, 0, 100, 500);
    const c = claimBox(100, 200, 100, 60);
    expect(computeRule1Path(d, c)).toEqual([500, 230, 200, 230]);
  });

  it('returns a vertical 2-point line when target.x is inside wide data source extent, target below', () => {
    const d = dataBox(0, 0, 500, 80);
    const c = claimBox(200, 200, 60, 60);
    expect(computeRule1Path(d, c)).toEqual([230, 80, 230, 200]);
  });

  it('returns null when target.y is outside source extent', () => {
    const d = dataBox(0, 0, 100, 100);
    const c = claimBox(300, 500, 100, 60);
    expect(computeRule1Path(d, c)).toBeNull();
  });

  it('returns null when source is not data', () => {
    const c1 = { ...claimBox(0, 0, 100, 500), id: 'c1' };
    const c2 = claimBox(300, 200);
    expect(computeRule1Path(c1, c2)).toBeNull();
  });

  it('returns null when target is not claim', () => {
    const d = dataBox(0, 0, 100, 500);
    const otherTarget: DiagramElement = {
      ...claimBox(300, 200), argumentType: 'warrant',
    };
    expect(computeRule1Path(d, otherTarget)).toBeNull();
  });

  it('returns null when source and target overlap on x (no clear side)', () => {
    const d = dataBox(0, 0, 200, 500);
    const c = claimBox(150, 200, 100, 60);
    expect(computeRule1Path(d, c)).toBeNull();
  });

  it('treats target.center.y exactly on source.top as inside (inclusive)', () => {
    const d = dataBox(0, 100, 100, 100);
    const c = claimBox(300, 70, 100, 60);
    const r = computeRule1Path(d, c);
    expect(r).not.toBeNull();
    expect(r?.[1]).toBe(100);
  });
});
