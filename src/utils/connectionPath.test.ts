import { describe, expect, it } from 'vitest';
import { COUNTERCLAIM_SLASH_LENGTH, counterclaimSlash } from './connectionPath';

function centre(s: [number, number, number, number]) {
  return { x: (s[0] + s[2]) / 2, y: (s[1] + s[3]) / 2 };
}
function length(s: [number, number, number, number]) {
  return Math.hypot(s[2] - s[0], s[3] - s[1]);
}

describe('counterclaimSlash', () => {
  it('returns null for fewer than two points', () => {
    expect(counterclaimSlash([])).toBeNull();
    expect(counterclaimSlash([10, 10])).toBeNull();
  });

  it('draws a "/" centred on a left→right horizontal run', () => {
    const s = counterclaimSlash([0, 100, 200, 100])!;
    expect(centre(s).x).toBeCloseTo(100);
    expect(centre(s).y).toBeCloseTo(100);
    expect(length(s)).toBeCloseTo(COUNTERCLAIM_SLASH_LENGTH);
    // Screen coordinates (y grows downward): "/" runs bottom-left → top-right.
    const [x1, y1, x2, y2] = s;
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeLessThan(y1);
    // 60° from horizontal → the slash is taller than it is wide.
    expect(Math.abs(y2 - y1)).toBeGreaterThan(Math.abs(x2 - x1));
  });

  it('is the same mark on a right→left horizontal run', () => {
    const forward = counterclaimSlash([0, 100, 200, 100])!;
    const backward = counterclaimSlash([200, 100, 0, 100])!;
    // Same two endpoints, possibly swapped.
    const asSet = (s: number[]) => [[s[0], s[1]], [s[2], s[3]]].sort((a, b) => a[0] - b[0]).flat();
    expect(asSet(backward).map((v) => +v.toFixed(6))).toEqual(asSet(forward).map((v) => +v.toFixed(6)));
  });

  it('rotates with a vertical run (60° off vertical → wider than tall)', () => {
    const s = counterclaimSlash([100, 0, 100, 200])!;
    expect(centre(s).x).toBeCloseTo(100);
    expect(centre(s).y).toBeCloseTo(100);
    expect(length(s)).toBeCloseTo(COUNTERCLAIM_SLASH_LENGTH);
    expect(Math.abs(s[2] - s[0])).toBeGreaterThan(Math.abs(s[3] - s[1]));
  });

  it('sits on the segment that contains the midpoint of a Z-elbow', () => {
    // 20 right, 200 down, 20 right → total 240; midpoint (120) is on the vertical run at (20, 100).
    const s = counterclaimSlash([0, 0, 20, 0, 20, 200, 40, 200])!;
    expect(centre(s).x).toBeCloseTo(20);
    expect(centre(s).y).toBeCloseTo(100);
    expect(Math.abs(s[2] - s[0])).toBeGreaterThan(Math.abs(s[3] - s[1]));
  });
});
