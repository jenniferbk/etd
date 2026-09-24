import { describe, it, expect } from 'vitest';
import { computeSpawnPosition } from './spawnPosition';

const size = { width: 200, height: 100 };

describe('computeSpawnPosition', () => {
  it('centers the element in an unpanned, unzoomed viewport', () => {
    const out = computeSpawnPosition(
      { zoom: 1, panX: 0, panY: 0, viewportWidth: 800, viewportHeight: 600 },
      size,
    );
    expect(out).toEqual({ x: 300, y: 250 });
  });

  it('follows the pan so the element lands where the user is looking', () => {
    const out = computeSpawnPosition(
      { zoom: 1, panX: -2000, panY: -1000, viewportWidth: 800, viewportHeight: 600 },
      size,
    );
    expect(out).toEqual({ x: 2300, y: 1250 });
  });

  it('accounts for zoom when converting the screen center to canvas coords', () => {
    const out = computeSpawnPosition(
      { zoom: 2, panX: 100, panY: 50, viewportWidth: 800, viewportHeight: 600 },
      size,
    );
    // center in canvas coords: ((400-100)/2, (300-50)/2) = (150, 125)
    expect(out).toEqual({ x: 50, y: 75 });
  });

  it('applies jitter offset', () => {
    const out = computeSpawnPosition(
      { zoom: 1, panX: 0, panY: 0, viewportWidth: 800, viewportHeight: 600 },
      size,
      { x: 10, y: -5 },
    );
    expect(out).toEqual({ x: 310, y: 245 });
  });
});
