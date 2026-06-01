// Decide what a wheel event does to the canvas transform.
//
// Browsers/trackpads disambiguate the two gestures via the wheel event's
// ctrlKey flag:
//   - ctrlKey === true  → pinch-to-zoom (or Ctrl+scroll) → zoom toward pointer
//   - ctrlKey === false → two-finger swipe → pan the canvas
//
// Pure function — no DOM, no Konva. Returns the next {zoom, panX, panY}.
// Pan is the stage's absolute offset (same convention as setPan elsewhere).

export interface WheelInput {
  ctrlKey: boolean;
  deltaX: number;
  deltaY: number;
  pointer: { x: number; y: number };
  zoom: number;
  panX: number;
  panY: number;
}

export interface CanvasTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
const SCALE_BY = 1.1;

export function computeWheelTransform(input: WheelInput): CanvasTransform {
  const { ctrlKey, deltaX, deltaY, pointer, zoom, panX, panY } = input;

  // Two-finger swipe: pan only, zoom unchanged. Subtracting the delta makes the
  // canvas scroll in the direction of the gesture (document-style panning).
  if (!ctrlKey) {
    return { zoom, panX: panX - deltaX, panY: panY - deltaY };
  }

  // Pinch / Ctrl+scroll: zoom toward the pointer (preserves existing zoom feel).
  const mousePointTo = {
    x: (pointer.x - panX) / zoom,
    y: (pointer.y - panY) / zoom,
  };
  const direction = deltaY > 0 ? -1 : 1;
  const newScale = direction > 0 ? zoom * SCALE_BY : zoom / SCALE_BY;
  const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

  return {
    zoom: clampedScale,
    panX: pointer.x - mousePointTo.x * clampedScale,
    panY: pointer.y - mousePointTo.y * clampedScale,
  };
}
