import { describe, it, expect } from 'vitest';
import { resolveAnchor, computeRule1Path, groupSiblingsByApproachSide, computeSharedTrunkX } from './orthogonalRouting';
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

describe('groupSiblingsByApproachSide', () => {
  it('groups sources by left/right based on center.x', () => {
    const target = claimBox(500, 200);  // center x = 550
    const leftA = dataBox(100, 200, 80, 60);   // center x = 140 < 550 → left
    const leftB = dataBox(200, 350, 80, 60);   // center x = 240 < 550 → left
    const rightA = dataBox(800, 200, 80, 60);  // center x = 840 > 550 → right
    const groups = groupSiblingsByApproachSide(
      [{ conn: { id:'1', from:'a', to:'t', type:'support' }, fromEl: leftA },
       { conn: { id:'2', from:'b', to:'t', type:'support' }, fromEl: leftB },
       { conn: { id:'3', from:'c', to:'t', type:'support' }, fromEl: rightA }],
      target,
    );
    expect(groups.left.length).toBe(2);
    expect(groups.right.length).toBe(1);
    expect(groups.above.length).toBe(0);
    expect(groups.below.length).toBe(0);
  });

  it('groups sources by above/below when center.y differs and center.x matches (excluded if same x)', () => {
    const target = claimBox(500, 500);   // center (550, 530)
    const above = dataBox(510, 100, 80, 60);   // center (550, 130) — same x, above
    const below = dataBox(510, 900, 80, 60);   // center (550, 930) — same x, below
    const groups = groupSiblingsByApproachSide(
      [{ conn: { id:'1', from:'a', to:'t', type:'support' }, fromEl: above },
       { conn: { id:'2', from:'b', to:'t', type:'support' }, fromEl: below }],
      target,
    );
    // Equal-x case: tied; spec says exclude from Rule 2 grouping (fall through to default Z).
    expect(groups.left.length + groups.right.length + groups.above.length + groups.below.length).toBe(0);
    expect(groups.excluded.length).toBe(2);
  });

  it('prefers horizontal grouping when both horizontal and vertical separations exist', () => {
    // If a source is both clearly-left AND clearly-above, classify as left (horizontal wins).
    const target = claimBox(500, 500);  // center (550, 530)
    const leftAndAbove = dataBox(100, 100, 80, 60);  // center (140, 130)
    const groups = groupSiblingsByApproachSide(
      [{ conn: { id:'1', from:'a', to:'t', type:'support' }, fromEl: leftAndAbove }],
      target,
    );
    expect(groups.left.length).toBe(1);
    expect(groups.above.length).toBe(0);
  });
});

describe('computeSharedTrunkX (left-side sources)', () => {
  it('places trunk 30% of the way from maxSourceRight to target.left', () => {
    const target = claimBox(1000, 200);   // left = 1000
    const sources = [
      dataBox(100, 200, 80, 60),   // right = 180
      dataBox(300, 200, 100, 60),  // right = 400 (max)
    ];
    // maxSourceRight = 400. trunkX = 400 + 0.3 * (1000 - 400) = 580.
    const groups = [
      { conn: { id:'1', from:'a', to:'t', type:'support' as const }, fromEl: sources[0] },
      { conn: { id:'2', from:'b', to:'t', type:'support' as const }, fromEl: sources[1] },
    ];
    expect(computeSharedTrunkX(groups, target, 'left')).toBe(580);
  });

  it('clamps to maxSourceRight + 20 if sources are too close to target', () => {
    const target = claimBox(420, 200);    // left = 420
    const sources = [dataBox(300, 200, 100, 60)];  // right = 400
    const groups = [
      { conn: { id:'1', from:'a', to:'t', type:'support' as const }, fromEl: sources[0] },
    ];
    // 30% of (420 - 400) = 6 < 20px clamp.
    // Both clamps (lower=maxSourceRight+20=420, upper=target.left-20=400) cross over.
    // When they cross, prefer the lower bound clamped to within [target.left-20, target.left].
    const result = computeSharedTrunkX(groups, target, 'left');
    expect(result).toBeGreaterThanOrEqual(400);
    expect(result).toBeLessThanOrEqual(420);
  });
});
