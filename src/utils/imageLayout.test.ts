import { describe, it, expect } from 'vitest';
import { imageAreaHeight, requiredWidthForImage, MAX_AUTO_IMAGE_ELEMENT_WIDTH } from './imageLayout';

describe('imageAreaHeight', () => {
  it('keeps the legacy 100px box at or below 100%', () => {
    expect(imageAreaHeight(0.5)).toBe(100);
    expect(imageAreaHeight(1)).toBe(100);
  });

  it('grows proportionally above 100%', () => {
    expect(imageAreaHeight(2)).toBe(200);
    expect(imageAreaHeight(3)).toBe(300);
  });
});

describe('requiredWidthForImage', () => {
  it('needs no widening at or below 100%', () => {
    expect(requiredWidthForImage(16 / 9, 1, 10)).toBeNull();
    expect(requiredWidthForImage(16 / 9, 0.5, 10)).toBeNull();
  });

  it('widens so a 16:9 image fills a 200px-tall box at 200%', () => {
    // 200 * 16/9 = 355.6 → +20 padding → 376
    expect(requiredWidthForImage(16 / 9, 2, 10)).toBe(376);
  });

  it('caps the auto width', () => {
    expect(requiredWidthForImage(10, 3, 10)).toBe(MAX_AUTO_IMAGE_ELEMENT_WIDTH);
  });

  it('ignores a bad aspect ratio', () => {
    expect(requiredWidthForImage(0, 2, 10)).toBeNull();
    expect(requiredWidthForImage(NaN, 2, 10)).toBeNull();
  });
});
