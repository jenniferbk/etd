import { describe, it, expect } from 'vitest';
import { resolveAnchor } from './orthogonalRouting';
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
