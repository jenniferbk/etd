import type { DiagramElement, Connection, ArgumentElement, TeacherSupportElement, InfoBoxElement } from '../types';
import { getContributorColor, getTeacherSupportColors } from './colors';

interface SvgExportOptions {
  padding?: number;
}

export function exportToSvg(
  elements: DiagramElement[],
  connections: Connection[],
  options: SvgExportOptions = {}
): string {
  const { padding = 50 } = options;

  if (elements.length === 0) {
    return '';
  }

  // Calculate bounds
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  elements.forEach((el) => {
    minX = Math.min(minX, el.position.x);
    minY = Math.min(minY, el.position.y);
    maxX = Math.max(maxX, el.position.x + el.size.width);
    maxY = Math.max(maxY, el.position.y + el.size.height);
  });

  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const offsetX = -minX + padding;
  const offsetY = -minY + padding;

  // Build SVG content
  const svgContent: string[] = [];

  // Add connections first (behind elements)
  connections.forEach((conn) => {
    const svg = renderConnectionSvg(conn, elements, connections, offsetX, offsetY);
    if (svg) svgContent.push(svg);
  });

  // Add elements
  elements.forEach((el) => {
    const svg = renderElementSvg(el, offsetX, offsetY);
    if (svg) svgContent.push(svg);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .label { font-family: system-ui, sans-serif; font-weight: bold; text-decoration: underline; }
      .content { font-family: system-ui, sans-serif; }
      .attribution { font-family: system-ui, sans-serif; font-style: italic; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  ${svgContent.join('\n  ')}
</svg>`;
}

function renderElementSvg(element: DiagramElement, offsetX: number, offsetY: number): string {
  const x = element.position.x + offsetX;
  const y = element.position.y + offsetY;
  const { width, height } = element.size;

  if (element.type === 'argument') {
    return renderArgumentSvg(element as ArgumentElement, x, y, width, height);
  } else if (element.type === 'teacherSupport') {
    return renderTeacherSupportSvg(element as TeacherSupportElement, x, y, width, height);
  } else if (element.type === 'infoBox') {
    return renderInfoBoxSvg(element as InfoBoxElement, x, y, width, height);
  }
  return '';
}

function renderArgumentSvg(el: ArgumentElement, x: number, y: number, width: number, height: number): string {
  const color = getContributorColor(el.contributor);
  const isDashed = el.contributor === 'student' || el.contributor === 'joint';
  const isCloud = el.contributor === 'implicit';
  const fill = el.contributor === 'given' ? '#F0FFF0' : '#FFFFFF';
  const strokeWidth = isCloud ? 2 : 3;
  const dashArray = isDashed ? 'stroke-dasharray="10 5"' : '';

  const padding = 10;
  const labelY = y + padding + 14;
  const contentY = y + padding + 30;

  // Build image element if present
  let imageElement = '';
  if (el.image) {
    const imgMaxWidth = width - padding * 2;
    const imgMaxHeight = 100;
    const imgX = x + padding;
    const imgY = y + height - 110 - (el.attribution?.speaker || el.attribution?.timestamp ? 16 : 0);

    // Apply crop if present
    if (el.imageSettings?.cropArea) {
      // TODO: Apply crop values to clipPath using el.imageSettings.cropArea
      const clipId = `clip-${el.id.replace(/[^a-zA-Z0-9]/g, '')}`;
      imageElement = `
      <defs>
        <clipPath id="${clipId}">
          <rect x="${imgX}" y="${imgY}" width="${imgMaxWidth}" height="${imgMaxHeight}"/>
        </clipPath>
      </defs>
      <image
        href="${el.image}"
        x="${imgX}"
        y="${imgY}"
        width="${imgMaxWidth}"
        height="${imgMaxHeight}"
        preserveAspectRatio="xMidYMid meet"
        clip-path="url(#${clipId})"
      />`;
    } else {
      imageElement = `<image
        href="${el.image}"
        x="${imgX}"
        y="${imgY}"
        width="${imgMaxWidth}"
        height="${imgMaxHeight}"
        preserveAspectRatio="xMidYMid meet"
      />`;
    }
  }

  // Build attribution element if present
  let attributionElement = '';
  const attributionText = el.attribution?.speaker || el.attribution?.timestamp
    ? `${el.attribution.speaker || ''}${el.attribution.speaker && el.attribution.timestamp ? ' @ ' : ''}${el.attribution.timestamp || ''}`
    : '';
  if (attributionText) {
    attributionElement = `<text x="${x + width - padding}" y="${y + height - 6}" class="attribution" font-size="10" fill="#666666" text-anchor="end">${escapeXml(attributionText)}</text>`;
  }

  if (isCloud) {
    // Cloud shape
    const cloudPath = generateCloudPath(x, y, width, height);
    return `<g>
      <path d="${cloudPath}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"/>
      <text x="${x + padding}" y="${labelY}" class="label" font-size="14" fill="#000000">${escapeXml(el.label)}</text>
      <text x="${x + padding}" y="${contentY}" class="content" font-size="12" fill="#000000">${escapeXml(el.content)}</text>
      ${imageElement}
      ${attributionElement}
    </g>`;
  }

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}" ${dashArray}/>
    <text x="${x + padding}" y="${labelY}" class="label" font-size="14" fill="${color}">${escapeXml(el.label)}</text>
    <text x="${x + padding}" y="${contentY}" class="content" font-size="12" fill="#000000">${escapeXml(el.content)}</text>
    ${imageElement}
    ${attributionElement}
  </g>`;
}

function renderTeacherSupportSvg(el: TeacherSupportElement, x: number, y: number, width: number, height: number): string {
  const { border, fill } = getTeacherSupportColors(el.supportType);
  const padding = 8;
  const labelY = y + padding + 10;
  const contentY = y + padding + 24;

  if (el.supportType === 'action') {
    // Ellipse
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    return `<g>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${border}" stroke-width="2"/>
      <text x="${cx}" y="${cy}" class="content" font-size="11" fill="${border}" text-anchor="middle" dominant-baseline="middle">${escapeXml(el.content)}</text>
    </g>`;
  }

  // Rounded rectangle
  const label = el.supportType === 'question' ? 'Question' : `Other Support: ${el.subtype || ''}`;
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${border}" stroke-width="2" rx="8" ry="8"/>
    <text x="${x + padding}" y="${labelY}" class="label" font-size="10" fill="${border}">${escapeXml(label)}</text>
    <text x="${x + padding}" y="${contentY}" class="content" font-size="11" fill="#000000">${escapeXml(el.content)}</text>
  </g>`;
}

function renderInfoBoxSvg(el: InfoBoxElement, x: number, y: number, width: number, height: number): string {
  const padding = 8;
  const labelY = y + padding + 10;
  const contentY = y + padding + 20;

  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#FFFFFF" stroke="#000000" stroke-width="2"/>
    <text x="${x + padding}" y="${labelY}" class="label" font-size="12" fill="#000000">${escapeXml(el.label)}</text>
    <text x="${x + padding}" y="${contentY}" class="content" font-size="11" fill="#333333">${escapeXml(el.content)}</text>
  </g>`;
}

function renderConnectionSvg(
  conn: Connection,
  elements: DiagramElement[],
  _connections: Connection[],
  offsetX: number,
  offsetY: number
): string {
  const fromEl = elements.find((e) => e.id === conn.from);
  if (!fromEl) return '';

  // Handle connection to element
  if (typeof conn.to === 'string') {
    const toEl = elements.find((e) => e.id === conn.to);
    if (!toEl) return '';

    const fromX = fromEl.position.x + fromEl.size.width / 2 + offsetX;
    const fromY = fromEl.position.y + fromEl.size.height / 2 + offsetY;
    const toX = toEl.position.x + toEl.size.width / 2 + offsetX;
    const toY = toEl.position.y + toEl.size.height / 2 + offsetY;

    return `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="#333333" stroke-width="2" marker-end="url(#arrowhead)"/>`;
  }

  return '';
}

function generateCloudPath(x: number, y: number, width: number, height: number): string {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2 - 5;
  const ry = height / 2 - 5;
  const bumps = 8;
  const points: string[] = [];

  for (let i = 0; i <= bumps * 4; i++) {
    const angle = (i / (bumps * 4)) * Math.PI * 2;
    const bumpOffset = Math.sin(i * Math.PI / 2) * 5;
    const px = cx + (rx + bumpOffset) * Math.cos(angle);
    const py = cy + (ry + bumpOffset) * Math.sin(angle);
    if (i === 0) {
      points.push(`M ${px} ${py}`);
    } else {
      points.push(`L ${px} ${py}`);
    }
  }
  points.push('Z');
  return points.join(' ');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadSvg(svgContent: string, filename: string = 'toulmin-diagram.svg'): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
