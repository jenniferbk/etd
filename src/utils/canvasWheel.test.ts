import { describe, it, expect } from 'vitest';
import { computeWheelTransform, MIN_ZOOM, MAX_ZOOM } from './canvasWheel';

const base = { pointer: { x: 100, y: 100 }, zoom: 1, panX: 0, panY: 0 };

describe('computeWheelTransform', () => {
  it('pans (not zooms) on a two-finger swipe (ctrlKey false)', () => {
    const out = computeWheelTransform({ ...base, ctrlKey: false, deltaX: 30, deltaY: -20 });
    expect(out.zoom).toBe(1); // zoom unchanged
    expect(out.panX).toBe(-30); // panX - deltaX
    expect(out.panY).toBe(20); // panY - deltaY
  });

  it('pans horizontally and vertically from current pan offset', () => {
    const out = computeWheelTransform({
      ctrlKey: false,
      deltaX: 5,
      deltaY: 5,
      pointer: { x: 0, y: 0 },
      zoom: 2,
      panX: 100,
      panY: -50,
    });
    expect(out).toEqual({ zoom: 2, panX: 95, panY: -55 });
  });

  it('zooms in on pinch/ctrl+scroll with deltaY < 0', () => {
    const out = computeWheelTransform({ ...base, ctrlKey: true, deltaX: 0, deltaY: -10 });
    expect(out.zoom).toBeCloseTo(1.1);
  });

  it('zooms out on pinch/ctrl+scroll with deltaY > 0', () => {
    const out = computeWheelTransform({ ...base, ctrlKey: true, deltaX: 0, deltaY: 10 });
    expect(out.zoom).toBeCloseTo(1 / 1.1);
  });

  it('clamps zoom to [MIN_ZOOM, MAX_ZOOM]', () => {
    const zoomedOut = computeWheelTransform({ ...base, ctrlKey: true, deltaX: 0, deltaY: 10, zoom: MIN_ZOOM });
    expect(zoomedOut.zoom).toBe(MIN_ZOOM);
    const zoomedIn = computeWheelTransform({ ...base, ctrlKey: true, deltaX: 0, deltaY: -10, zoom: MAX_ZOOM });
    expect(zoomedIn.zoom).toBe(MAX_ZOOM);
  });

  it('keeps the point under the pointer fixed while zooming', () => {
    const out = computeWheelTransform({ ctrlKey: true, deltaX: 0, deltaY: -10, pointer: { x: 200, y: 150 }, zoom: 1, panX: 0, panY: 0 });
    // world point under pointer before == after
    const worldBeforeX = (200 - 0) / 1;
    const worldAfterX = (200 - out.panX) / out.zoom;
    expect(worldAfterX).toBeCloseTo(worldBeforeX);
  });
});
