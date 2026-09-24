// Layout rules for screenshots embedded in argument elements.
//
// Scale ≤ 1 (legacy behavior, unchanged): the image is fit into an
// (inner width × 100px) box, then shrunk by `scale`.
// Scale > 1: the image box grows to 100px × scale tall, and the element is
// widened (see requiredWidthForImage) so the image can actually fill it.

export const IMAGE_BASE_HEIGHT = 100;
export const MIN_IMAGE_SCALE = 0.2;
export const MAX_IMAGE_SCALE = 3;
// Upper bound on auto-widening so a very wide screenshot at 300% can't
// produce an absurdly wide element.
export const MAX_AUTO_IMAGE_ELEMENT_WIDTH = 1200;

/** Height of the reserved image box inside the element. */
export function imageAreaHeight(scale: number): number {
  return IMAGE_BASE_HEIGHT * Math.max(1, scale);
}

/**
 * Element width needed so an image with the given aspect ratio (w/h) fills
 * the scaled image box's full height. Returns null when no widening is
 * needed (scale ≤ 1).
 */
export function requiredWidthForImage(
  aspectRatio: number,
  scale: number,
  padding: number,
): number | null {
  if (scale <= 1 || !(aspectRatio > 0)) return null;
  const imageWidth = aspectRatio * imageAreaHeight(scale);
  return Math.min(MAX_AUTO_IMAGE_ELEMENT_WIDTH, Math.ceil(imageWidth + padding * 2));
}
