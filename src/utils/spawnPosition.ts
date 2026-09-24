// Where a newly created element should land: centered in the part of the
// canvas the user is currently looking at, so palette clicks never drop
// elements offscreen after panning or zooming.
//
// Pure function — no DOM, no Konva. Stage transform convention matches
// canvasWheel.ts: canvas = (screen - pan) / zoom.

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function computeSpawnPosition(
  view: ViewportTransform,
  size: { width: number; height: number },
  jitter: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const centerX = (view.viewportWidth / 2 - view.panX) / view.zoom;
  const centerY = (view.viewportHeight / 2 - view.panY) / view.zoom;
  return {
    x: centerX - size.width / 2 + jitter.x,
    y: centerY - size.height / 2 + jitter.y,
  };
}

/** Random offset in [-range/2, range/2] on each axis. */
export function randomJitter(range: number): { x: number; y: number } {
  return { x: (Math.random() - 0.5) * range, y: (Math.random() - 0.5) * range };
}
