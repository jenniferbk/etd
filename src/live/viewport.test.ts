import { describe, expect, it } from 'vitest';
import { currentView, centerOn, fitView } from './viewport';

describe('currentView', () => {
  it('is the visible region in diagram coordinates', () => {
    expect(currentView({ zoom: 2, panX: -200, panY: 100, viewportSize: { width: 800, height: 600 } }))
      .toEqual({ x: 100, y: -50, width: 400, height: 300 });
  });
});

describe('fitView', () => {
  it('shows the same region on a same-size screen exactly', () => {
    const view = { x: 100, y: -50, width: 400, height: 300 };
    expect(fitView(view, { width: 800, height: 600 })).toEqual({ zoom: 2, panX: -200, panY: 100 });
  });

  it('fits the whole region on a smaller screen, centered', () => {
    // 400x300 region into 400x400: zoom limited by width (1), centered vertically.
    const r = fitView({ x: 0, y: 0, width: 400, height: 300 }, { width: 400, height: 400 });
    expect(r.zoom).toBe(1);
    expect(r.panX).toBe(0);
    expect(r.panY).toBe(50);
  });

  it('clamps zoom to the canvas limits', () => {
    expect(fitView({ x: 0, y: 0, width: 10, height: 10 }, { width: 800, height: 600 }).zoom).toBe(4);
    expect(fitView({ x: 0, y: 0, width: 100000, height: 100000 }, { width: 800, height: 600 }).zoom).toBe(0.25);
  });
});

describe('centerOn', () => {
  it('pans so the point is in the middle of the screen at the current zoom', () => {
    expect(centerOn({ x: 500, y: 300 }, 2, { width: 800, height: 600 })).toEqual({ panX: -600, panY: -300 });
  });
});
