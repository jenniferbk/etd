import { describe, it, expect } from 'vitest';
import { computeExportBounds } from './exportBounds';
import type { ArgumentElement, Connection, DiagramElement } from '../types';

function arg(id: string, x: number, y: number, w = 100, h = 60): ArgumentElement {
  return {
    id, type: 'argument', argumentType: 'claim', contributor: 'student',
    label: 'Claim', content: '',
    position: { x, y }, size: { width: w, height: h },
  };
}

function conn(id: string, from: string, to: string, waypoints?: { x: number; y: number }[]): Connection {
  return { id, from, to, type: 'support', ...(waypoints ? { waypoints } : {}) };
}

describe('computeExportBounds', () => {
  it('returns 200x200 fallback for empty diagram', () => {
    expect(computeExportBounds([], [])).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it('covers all elements with default 40px margin', () => {
    const elements: DiagramElement[] = [
      arg('a', 100, 50, 80, 40),
      arg('b', 300, 200, 100, 60),
    ];
    const b = computeExportBounds(elements, []);
    expect(b.x).toBe(100 - 40);
    expect(b.y).toBe(50 - 40);
    expect(b.width).toBe((300 + 100) - 100 + 80);
    expect(b.height).toBe((200 + 60) - 50 + 80);
  });

  it('extends bbox to cover connection waypoints beyond element extents', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0), arg('b', 200, 0)];
    const connections: Connection[] = [conn('c1', 'a', 'b', [{ x: 100, y: -500 }, { x: 100, y: 0 }])];
    const b = computeExportBounds(elements, connections);
    expect(b.y).toBeLessThanOrEqual(-500 - 40);
  });

  it('honors a custom margin', () => {
    const elements: DiagramElement[] = [arg('a', 0, 0, 100, 100)];
    const b = computeExportBounds(elements, [], 10);
    expect(b.x).toBe(-10);
    expect(b.width).toBe(120);
  });

  it('handles a single-element diagram', () => {
    const elements: DiagramElement[] = [arg('a', 50, 50, 40, 30)];
    const b = computeExportBounds(elements, []);
    expect(b).toEqual({ x: 50 - 40, y: 50 - 40, width: 40 + 80, height: 30 + 80 });
  });

  it('runs under 50ms for 200 elements + 150 connections (perf smoke)', () => {
    const elements: DiagramElement[] = [];
    for (let i = 0; i < 200; i++) elements.push(arg(`e${i}`, i * 50, (i % 10) * 80));
    const connections: Connection[] = [];
    for (let i = 0; i < 150; i++) connections.push(conn(`c${i}`, `e${i}`, `e${i + 1}`));
    const t0 = performance.now();
    computeExportBounds(elements, connections);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});
