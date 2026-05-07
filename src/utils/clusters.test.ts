import { describe, it, expect } from 'vitest';
import {
  bboxesOverlap,
  computeCluster,
  unionBbox,
} from './clusters';
import type {
  ArgumentElement,
  SupportElement,
  DiagramElement,
} from '../types';

function arg(id: string, x: number, y: number, w = 100, h = 60): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

function sup(id: string, x: number, y: number, w = 80, h = 40): SupportElement {
  return {
    id, type: 'support', contributor: 'teacher',
    supportType: 'question', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

describe('bboxesOverlap', () => {
  it('returns false for fully disjoint rects', () => {
    expect(bboxesOverlap(arg('a', 0, 0, 50, 50), arg('b', 100, 100, 50, 50))).toBe(false);
  });
  it('returns true for overlapping rects', () => {
    expect(bboxesOverlap(arg('a', 0, 0, 100, 100), arg('b', 50, 50, 100, 100))).toBe(true);
  });
  it('returns true when one rect contains another', () => {
    expect(bboxesOverlap(arg('a', 0, 0, 200, 200), arg('b', 50, 50, 50, 50))).toBe(true);
  });
  it('treats edge-touching as no overlap', () => {
    // rect a ends at x=100; rect b starts at x=100 — share zero area
    expect(bboxesOverlap(arg('a', 0, 0, 100, 100), arg('b', 100, 0, 100, 100))).toBe(false);
  });
  it('returns true for identical rects', () => {
    expect(bboxesOverlap(arg('a', 10, 20, 30, 40), arg('b', 10, 20, 30, 40))).toBe(true);
  });
});

describe('computeCluster', () => {
  it('returns null when argumentId is not found', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0)];
    expect(computeCluster(elements, 'nonexistent')).toBeNull();
  });

  it('returns null when argumentId refers to a non-argument element', () => {
    const elements: DiagramElement[] = [sup('s', 0, 0)];
    expect(computeCluster(elements, 's')).toBeNull();
  });

  it('returns the argument with empty supports when nothing overlaps', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0), sup('s', 500, 500)];
    const cluster = computeCluster(elements, 'a');
    expect(cluster).not.toBeNull();
    expect(cluster!.argument.id).toBe('a');
    expect(cluster!.supports).toEqual([]);
  });

  it('includes a directly-overlapping support', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0, 100, 100), sup('s', 50, 50)];
    const cluster = computeCluster(elements, 'a')!;
    expect(cluster.supports.map(s => s.id)).toEqual(['s']);
  });

  it('walks transitively: support B overlaps support A which overlaps argument', () => {
    const elements: DiagramElement[] = [
      arg('a', 0, 0, 100, 100),
      sup('sA', 80, 50, 80, 40),    // overlaps a
      sup('sB', 150, 60, 80, 40),   // overlaps sA only, not a
    ];
    const cluster = computeCluster(elements, 'a')!;
    expect(cluster.supports.map(s => s.id).sort()).toEqual(['sA', 'sB']);
  });

  it('respects argument walls — does not cross through another argument', () => {
    const elements: DiagramElement[] = [
      arg('a1', 0, 0, 100, 100),
      sup('sBridge', 80, 50, 100, 40),   // overlaps both a1 and a2
      arg('a2', 160, 50, 100, 100),
      sup('sIsland', 250, 60, 80, 40),   // overlaps a2 only
    ];
    const c1 = computeCluster(elements, 'a1')!;
    expect(c1.supports.map(s => s.id).sort()).toEqual(['sBridge']);
    expect(c1.supports.find(s => s.id === 'sIsland')).toBeUndefined();

    const c2 = computeCluster(elements, 'a2')!;
    expect(c2.supports.map(s => s.id).sort()).toEqual(['sBridge', 'sIsland']);
  });

  it('terminates on cycles in the overlap graph', () => {
    const elements: DiagramElement[] = [
      arg('a', 0, 0, 100, 100),
      sup('s1', 90, 50),
      sup('s2', 95, 55),  // overlaps s1 and s3
      sup('s3', 100, 60), // overlaps s2 and s1 (back to s1 from a different angle)
    ];
    const cluster = computeCluster(elements, 'a')!;
    expect(cluster.supports.map(s => s.id).sort()).toEqual(['s1', 's2', 's3']);
  });
});

describe('unionBbox', () => {
  it('returns the element rect for a single element', () => {
    const result = unionBbox([arg('a', 10, 20, 30, 40)]);
    expect(result).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('returns the smallest enclosing rect for multiple elements', () => {
    const result = unionBbox([
      arg('a', 0, 0, 50, 50),
      arg('b', 100, 80, 30, 30),
    ]);
    expect(result).toEqual({ x: 0, y: 0, width: 130, height: 110 });
  });
});
