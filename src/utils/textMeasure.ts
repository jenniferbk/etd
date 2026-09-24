/**
 * Text measurement utilities for auto-sizing elements
 */

import { IMAGE_BASE_HEIGHT } from './imageLayout';

interface MeasureOptions {
  fontSize: number;
  fontFamily?: string;
  fontStyle?: string;
  lineHeight?: number;
  maxWidth: number;
}

interface TextMeasurement {
  width: number;
  height: number;
  lines: number;
}

// Cache for canvas context
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
    measureCtx = measureCanvas.getContext('2d');
  }
  return measureCtx!;
}

/**
 * Measure wrapped text dimensions
 */
export function measureText(text: string, options: MeasureOptions): TextMeasurement {
  const {
    fontSize,
    fontFamily = 'Arial, sans-serif',
    fontStyle = 'normal',
    lineHeight = 1.2,
    maxWidth,
  } = options;

  const ctx = getMeasureContext();
  ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}`;

  if (!text || text.trim() === '') {
    return { width: 0, height: 0, lines: 0 };
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const lineHeightPx = fontSize * lineHeight;
  const totalHeight = lines.length * lineHeightPx;

  // Find the widest line
  let maxLineWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    maxLineWidth = Math.max(maxLineWidth, metrics.width);
  }

  return {
    width: Math.min(maxLineWidth, maxWidth),
    height: totalHeight,
    lines: lines.length,
  };
}

/**
 * Calculate required element size based on content
 */
export interface ElementSizeInput {
  label: string;
  content: string;
  hasAttribution: boolean;
  hasImage: boolean;
  imageScale?: number;
  isImplicit?: boolean;
  currentWidth: number;
}

export interface CalculatedSize {
  width: number;
  height: number;
}

const PADDING = 10;
const CLOUD_PADDING = 25; // Cloud shapes need more padding for elliptical boundary
const LABEL_HEIGHT = 20;
const LABEL_FONT_SIZE = 14;
const CONTENT_FONT_SIZE = 12;
const ATTRIBUTION_HEIGHT = 16;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 60;
const MAX_WIDTH = 400;

export function calculateElementSize(input: ElementSizeInput): CalculatedSize {
  const {
    label,
    content,
    hasAttribution,
    hasImage,
    imageScale = 1,
    isImplicit = false,
    currentWidth,
  } = input;

  // Cloud shapes need more padding because of elliptical boundary
  const padding = isImplicit ? CLOUD_PADDING : PADDING;

  // Use current width as the content width constraint, with min/max bounds
  const targetWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, currentWidth));
  const contentWidth = targetWidth - padding * 2;

  // Measure label
  const labelMeasure = measureText(label, {
    fontSize: LABEL_FONT_SIZE,
    fontStyle: 'bold',
    maxWidth: contentWidth,
  });

  // Measure content
  const contentMeasure = measureText(content, {
    fontSize: CONTENT_FONT_SIZE,
    maxWidth: contentWidth,
    lineHeight: 1.3,
  });

  // Calculate total height
  let totalHeight = padding; // Top padding
  totalHeight += Math.max(LABEL_HEIGHT, labelMeasure.height); // Label
  totalHeight += contentMeasure.height > 0 ? contentMeasure.height + 8 : 0; // Content with gap

  if (hasImage) {
    totalHeight += IMAGE_BASE_HEIGHT * imageScale + 10; // Image with gap
  }

  if (hasAttribution) {
    totalHeight += ATTRIBUTION_HEIGHT; // Attribution
  }

  totalHeight += padding; // Bottom padding

  // Ensure minimum dimensions
  const finalHeight = Math.max(MIN_HEIGHT, totalHeight);
  const finalWidth = targetWidth;

  return {
    width: finalWidth,
    height: finalHeight,
  };
}
