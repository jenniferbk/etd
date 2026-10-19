import { MAX_ZOOM, MIN_ZOOM } from '../utils/canvasWheel';

export interface ViewRect { x: number; y: number; width: number; height: number }
interface Size { width: number; height: number }

// The stage draws diagram point p at screen point p * zoom + pan.

/** The part of the diagram this tab can see, in diagram coordinates. */
export function currentView(
  { zoom, panX, panY, viewportSize }: { zoom: number; panX: number; panY: number; viewportSize: Size },
): ViewRect {
  return { x: -panX / zoom, y: -panY / zoom, width: viewportSize.width / zoom, height: viewportSize.height / zoom };
}

/** Zoom and pan that fit a teammate's view onto this screen, centered. */
export function fitView(view: ViewRect, viewportSize: Size): { zoom: number; panX: number; panY: number } {
  const fit = Math.min(viewportSize.width / view.width, viewportSize.height / view.height);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
  return { zoom, ...centerOn({ x: view.x + view.width / 2, y: view.y + view.height / 2 }, zoom, viewportSize) };
}

/** Pan that puts a diagram point in the middle of the screen. */
export function centerOn(point: { x: number; y: number }, zoom: number, viewportSize: Size): { panX: number; panY: number } {
  return { panX: viewportSize.width / 2 - point.x * zoom, panY: viewportSize.height / 2 - point.y * zoom };
}
