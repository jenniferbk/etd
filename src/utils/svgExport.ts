import type { DiagramElement, Connection, ArgumentElement, SupportElement, TeacherSupportElement, InfoBoxElement } from '../types';
import { imageAreaHeight } from './imageLayout';
import type { StyleConfig } from '../types';
import { isArrowAttachment } from '../types';
import { resolveArgumentStyle, resolveSupportStyle, dashArrayForBorderStyle } from './styleResolver';
import { generateCloudPath } from './cloudPath';
import {
  getEffectiveWaypoints,
  getOrthogonalPath,
  getVerticalAttachmentPath,
  getPointOnPolyline,
} from './orthogonalRouting';
import { computeExportBounds } from './exportBounds';
import { getClaimRole, deriveClaimLabel } from './claimRoleDerivation';
import { computePolylineFor, counterclaimSlash } from './connectionPath';
import { saveFile } from './saveFile';

interface SvgExportOptions {
  padding?: number;
}

export function exportToSvg(
  elements: DiagramElement[],
  connections: Connection[],
  styleConfig: StyleConfig,
  options: SvgExportOptions = {}
): string {
  const { padding = 50 } = options;

  if (elements.length === 0) {
    return '';
  }

  const bounds = computeExportBounds(elements, connections, padding);
  const width = bounds.width;
  const height = bounds.height;
  const offsetX = -bounds.x;
  const offsetY = -bounds.y;

  // Build SVG content
  const svgContent: string[] = [];

  // Add connections first (behind elements)
  connections.forEach((conn) => {
    const svg = renderConnectionSvg(conn, elements, connections, offsetX, offsetY);
    if (svg) svgContent.push(svg);
  });

  // Pre-build the elements-by-id map once for claim-role derivation.
  const elementsById = new Map(elements.map((el) => [el.id, el]));

  // Add elements
  elements.forEach((el) => {
    const svg = renderElementSvg(el, offsetX, offsetY, styleConfig, connections, elementsById, elements);
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
    <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#333333"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  ${svgContent.join('\n  ')}
</svg>`;
}

function renderElementSvg(
  element: DiagramElement,
  offsetX: number,
  offsetY: number,
  styleConfig: StyleConfig,
  connections: readonly Connection[],
  elementsById: ReadonlyMap<string, DiagramElement>,
  elements: DiagramElement[],
): string {
  const x = element.position.x + offsetX;
  const y = element.position.y + offsetY;
  const { width, height } = element.size;

  if (element.type === 'argument') {
    return renderArgumentSvg(element as ArgumentElement, x, y, width, height, styleConfig, connections, elementsById, elements, offsetX, offsetY);
  } else if (element.type === 'support') {
    return renderSupportSvg(element as SupportElement, x, y, width, height, styleConfig);
  } else if (element.type === 'teacherSupport') {
    return renderTeacherSupportSvg(element as TeacherSupportElement, x, y, width, height, styleConfig);
  } else if (element.type === 'infoBox') {
    return renderInfoBoxSvg(element as InfoBoxElement, x, y, width, height);
  }
  return '';
}

function renderArgumentSvg(
  el: ArgumentElement,
  x: number,
  y: number,
  width: number,
  height: number,
  styleConfig: StyleConfig,
  connections: readonly Connection[],
  elementsById: ReadonlyMap<string, DiagramElement>,
  elements: DiagramElement[],
  offsetX: number,
  offsetY: number,
): string {
  // Attached qualifier: render as small auto-sized box centered on the parent
  // polyline at attachedTo.position. Mirrors the canvas-side ArgumentShape
  // rendering for the same case.
  if (el.argumentType === 'qualifier' && el.attachedTo) {
    const parentConn = connections.find((c) => c.id === el.attachedTo!.connectionId);
    const parentPolyline = parentConn ? computePolylineFor(parentConn, elements, [...connections]) : null;
    if (parentPolyline) {
      const center = getPointOnPolyline(parentPolyline, el.attachedTo.position);
      const text = el.content || el.label || 'qualifier';
      const w = Math.max(40, text.length * 7 + 16);
      const h = 24;
      const cx = center.x + offsetX;
      const cy = center.y + offsetY;
      const style = resolveArgumentStyle(el, styleConfig);
      const dashArrayValues = dashArrayForBorderStyle(style.borderStyle);
      const dashAttr = dashArrayValues ? `stroke-dasharray="${dashArrayValues.join(' ')}"` : '';
      return `<g>
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="2" ${dashAttr}/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-style="italic" fill="#000000">${escapeXml(text)}</text>
  </g>`;
    }
    // Parent polyline missing → fall through to standard render so the
    // element still appears somewhere.
  }

  const style = resolveArgumentStyle(el, styleConfig);
  // Live-derived label: same rule as ArgumentShape (see claimRoleDerivation.ts).
  const displayLabel = el.argumentType === 'claim'
    ? deriveClaimLabel(el.label, getClaimRole(el, connections, elementsById))
    : el.label;
  const dashArrayValues = dashArrayForBorderStyle(style.borderStyle);
  const dashAttr = dashArrayValues ? `stroke-dasharray="${dashArrayValues.join(' ')}"` : '';

  const padding = 10;
  const labelY = y + padding + 14;
  const contentY = y + padding + 30;

  // Build image element if present
  let imageElement = '';
  if (el.image) {
    const imgMaxWidth = width - padding * 2;
    const imgMaxHeight = imageAreaHeight(el.imageSettings?.scale ?? 1);
    const imgX = x + padding;
    const imgY = y + height - imgMaxHeight - 10 - (el.attribution?.speaker || el.attribution?.timestamp ? 16 : 0);

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

  let shapeElement: string;
  if (style.borderShape === 'cloud') {
    const cloudPath = generateCloudPath(width, height);
    shapeElement = `<path d="${cloudPath}" transform="translate(${x},${y})" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr} />`;
  } else if (style.borderShape === 'ellipse') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    shapeElement = `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr}/>`;
  } else {
    const rx = style.borderShape === 'rounded' ? 8 : 0;
    shapeElement = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr}/>`;
  }

  return `<g>
    ${shapeElement}
    <text x="${x + padding}" y="${labelY}" class="label" font-size="14" fill="${style.borderColor}">${escapeXml(displayLabel)}</text>
    <text x="${x + padding}" y="${contentY}" class="content" font-size="12" fill="#000000">${escapeXml(el.content)}</text>
    ${imageElement}
    ${attributionElement}
  </g>`;
}

function renderSupportSvg(el: SupportElement, x: number, y: number, width: number, height: number, styleConfig: StyleConfig): string {
  const style = resolveSupportStyle(el, styleConfig);
  const dashArrayValues = dashArrayForBorderStyle(style.borderStyle);
  const dashAttr = dashArrayValues ? `stroke-dasharray="${dashArrayValues.join(' ')}"` : '';

  // Orphan detection: any non-'action' supportType with a subtype that no longer exists.
  const subtypeList = styleConfig.subtypes[el.supportType];
  const isOrphan = el.supportType !== 'action' && el.subtype !== undefined &&
    !subtypeList.some((s) => s.id === el.subtype);
  const subtypeLabel = el.supportType !== 'action' && el.subtype
    ? (subtypeList.find((s) => s.id === el.subtype)?.label ?? '[deleted subtype]')
    : null;
  const supportTypeLabel = styleConfig.supportTypes[el.supportType].label;
  const contributorLabel = el.contributor === 'teacher' ? 'T' : 'S';
  const headerText =
    el.supportType === 'action' ? '' :
    `[${contributorLabel}] ${subtypeLabel ?? supportTypeLabel}`;

  let shapeElement: string;
  if (style.borderShape === 'ellipse') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    shapeElement = `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr}/>`;
  } else {
    const rx = style.borderShape === 'rounded' ? 8 : 0;
    shapeElement = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr}/>`;
  }

  const headerEl = headerText
    ? `<text x="${x + 8}" y="${y + 18}" class="label" font-size="10" fill="${style.borderColor}">${escapeXml(headerText)}</text>`
    : '';
  const contentEl = el.content
    ? `<text x="${x + 8}" y="${y + (headerText ? 32 : 20)}" class="content" font-size="11" fill="#000000">${escapeXml(el.content)}</text>`
    : '';
  const orphanMarker = isOrphan
    ? `<text x="${x + width - 16}" y="${y + 14}" fill="#CC0000" font-size="14">&#9888;</text>`
    : '';

  return `<g>
    ${shapeElement}
    ${headerEl}
    ${contentEl}
    ${orphanMarker}
  </g>`;
}

function renderTeacherSupportSvg(el: TeacherSupportElement, x: number, y: number, width: number, height: number, styleConfig: StyleConfig): string {
  // Synthesize as a teacher SupportElement to reuse resolveSupportStyle
  const synthesized: SupportElement = { ...el, type: 'support', contributor: 'teacher' };
  const style = resolveSupportStyle(synthesized, styleConfig);
  const dashArrayValues = dashArrayForBorderStyle(style.borderStyle);
  const dashAttr = dashArrayValues ? `stroke-dasharray="${dashArrayValues.join(' ')}"` : '';

  const padding = 8;
  const labelY = y + padding + 10;
  const contentY = y + padding + 24;

  if (el.supportType === 'action') {
    // Ellipse — action type has no header label
    const cx = x + width / 2;
    const cy = y + height / 2;
    return `<g>
      <ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr}/>
      <text x="${cx}" y="${cy}" class="content" font-size="11" fill="${style.borderColor}" text-anchor="middle" dominant-baseline="middle">${escapeXml(el.content)}</text>
    </g>`;
  }

  // Action returned above, so el.supportType is 'question' | 'other' here.
  const subtypeList = styleConfig.subtypes[el.supportType];
  const isOrphan = el.subtype !== undefined &&
    !subtypeList.some((s) => s.id === el.subtype);
  const subtypeLabel = el.subtype
    ? (subtypeList.find((s) => s.id === el.subtype)?.label ?? '[deleted subtype]')
    : null;

  // Rounded rectangle — header is type label, with subtype suffix when one is set.
  const baseLabel = styleConfig.supportTypes[el.supportType].label;
  const label = subtypeLabel ? `${baseLabel}: ${subtypeLabel}` : baseLabel;

  let shapeElement: string;
  if (style.borderShape === 'ellipse') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    shapeElement = `<ellipse cx="${cx}" cy="${cy}" rx="${width / 2}" ry="${height / 2}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr}/>`;
  } else {
    const rx = style.borderShape === 'rounded' ? 8 : 0;
    shapeElement = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${rx}" fill="${style.backgroundColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${dashAttr}/>`;
  }

  const orphanMarker = isOrphan
    ? `<text x="${x + width - 16}" y="${y + 14}" fill="#CC0000" style="font-size: 14px;">&#9888;</text>`
    : '';

  return `<g>
    ${shapeElement}
    <text x="${x + padding}" y="${labelY}" class="label" font-size="10" fill="${style.borderColor}">${escapeXml(label)}</text>
    <text x="${x + padding}" y="${contentY}" class="content" font-size="11" fill="#000000">${escapeXml(el.content)}</text>
    ${orphanMarker}
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

// Resolve a connection to its rendered polyline points + optional attachment style.
// Mirrors getConnectionPathPoints in Arrow.tsx so SVG export produces the same
// shapes as the canvas.
//
// Element-to-element: orthogonal polyline via getEffectiveWaypoints + getOrthogonalPath.
// Warrant-attachment: vertical line at warrant.center.x to the closest horizontal
// parent segment (or 'warning' fallback when no horizontal segment intersects x).
function resolveConnectionPoints(
  conn: Connection,
  elements: DiagramElement[],
  connections: Connection[],
): { points: number[]; attachmentStyle?: 'normal' | 'warning' } | null {
  const fromEl = elements.find((e) => e.id === conn.from);
  if (!fromEl) return null;

  if (isArrowAttachment(conn.to)) {
    const attachment = conn.to;
    const parentConn = connections.find((c) => c.id === attachment.connectionId);
    if (!parentConn) return null;
    const parent = resolveConnectionPoints(parentConn, elements, connections);
    if (!parent || parent.points.length < 4) return null;
    const result = getVerticalAttachmentPath(fromEl, parent.points, attachment.position);
    return { points: result.points, attachmentStyle: result.style };
  }

  const toEl = elements.find((e) => e.id === conn.to);
  if (!toEl) return null;

  const waypoints = getEffectiveWaypoints(conn, fromEl, toEl);
  return { points: getOrthogonalPath(fromEl, toEl, waypoints) };
}

function renderConnectionSvg(
  conn: Connection,
  elements: DiagramElement[],
  connections: Connection[],
  offsetX: number,
  offsetY: number
): string {
  // Rebuttal-to-qualifier special case (mirrors Arrow.tsx ConnectionArrow):
  // when the target is an attached qualifier, render a vertical line from the
  // source down through the qualifier to the parent connection's y at the
  // qualifier's x. No arrowhead. Misaligned x → faint dashed gray hint.
  if (typeof conn.to === 'string') {
    const targetEl = elements.find((e) => e.id === conn.to);
    const sourceEl = elements.find((e) => e.id === conn.from);
    if (
      targetEl && sourceEl &&
      targetEl.type === 'argument' &&
      (targetEl as ArgumentElement).argumentType === 'qualifier' &&
      (targetEl as ArgumentElement).attachedTo !== undefined
    ) {
      const qual = targetEl as ArgumentElement;
      const parentConn = connections.find((c) => c.id === qual.attachedTo!.connectionId);
      const parentPolyline = parentConn ? computePolylineFor(parentConn, elements, connections) : null;
      if (!parentPolyline) return '';

      const qualCenter = {
        x: qual.position.x + qual.size.width / 2,
        y: qual.position.y + qual.size.height / 2,
      };
      const sourceCenter = {
        x: sourceEl.position.x + sourceEl.size.width / 2,
        y: sourceEl.position.y + sourceEl.size.height / 2,
      };
      const X_TOLERANCE = 4;
      const aligned = Math.abs(sourceCenter.x - qualCenter.x) <= X_TOLERANCE;
      if (!aligned) {
        return `<line x1="${sourceCenter.x + offsetX}" y1="${sourceCenter.y + offsetY}" x2="${qualCenter.x + offsetX}" y2="${qualCenter.y + offsetY}" stroke="#999" stroke-width="1" stroke-dasharray="4,4"/>`;
      }
      const sourceBottom = sourceEl.position.y + sourceEl.size.height;
      return `<line x1="${qualCenter.x + offsetX}" y1="${sourceBottom + offsetY}" x2="${qualCenter.x + offsetX}" y2="${qualCenter.y + offsetY}" stroke="#000000" stroke-width="1.5"/>`;
    }
  }

  const result = resolveConnectionPoints(conn, elements, connections);
  if (!result || result.points.length < 4) return '';
  const { points, attachmentStyle } = result;

  // Apply export offset to each (x, y) pair.
  const offsetPoints: string[] = [];
  for (let i = 0; i < points.length; i += 2) {
    offsetPoints.push(`${points[i] + offsetX},${points[i + 1] + offsetY}`);
  }
  const pointsAttr = offsetPoints.join(' ');

  const isCounterclaim = conn.type === 'counterclaim';
  const slash = isCounterclaim ? counterclaimSlash(points) : null;
  const slashSvg = slash
    ? `<line x1="${slash[0] + offsetX}" y1="${slash[1] + offsetY}" x2="${slash[2] + offsetX}" y2="${slash[3] + offsetY}" stroke="#333333" stroke-width="2" stroke-linecap="round"/>`
    : '';

  // Warrant-attachment connections render no arrowhead (matches Arrow.tsx).
  // Warning-state attachments render dashed and faint to signal "no valid attachment".
  if (isArrowAttachment(conn.to)) {
    if (attachmentStyle === 'warning') {
      return `<polyline points="${pointsAttr}" stroke="#A0A0A0" stroke-width="1" stroke-dasharray="4,4" opacity="0.6" fill="none"/>`;
    }
    return `<polyline points="${pointsAttr}" stroke="#333333" stroke-width="2" fill="none"/>${slashSvg}`;
  }

  // Counterclaims are symmetric: no arrowhead, slash at the midpoint.
  const markerEnd = isCounterclaim ? '' : ' marker-end="url(#arrowhead)"';
  return `<polyline points="${pointsAttr}" stroke="#333333" stroke-width="2" fill="none"${markerEnd}/>${slashSvg}`;
}


function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function downloadSvg(svgContent: string, filename: string = 'toulmin-diagram.svg'): Promise<void> {
  await saveFile({
    data: new Blob([svgContent], { type: 'image/svg+xml' }),
    suggestedName: filename,
    mimeType: 'image/svg+xml',
    extension: '.svg',
    description: 'SVG image',
  });
}
