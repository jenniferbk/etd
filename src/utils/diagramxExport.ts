/**
 * DiagramMix `.diagramx` exporter (Level A — MVP).
 *
 * Spec: docs/superpowers/specs/2026-04-19-json-to-diagramx-design.md
 * Reference file: a hand-crafted `.diagramx` sample shared by the user.
 *
 * Level A intentionally approximates several things (see spec "Known limitations"):
 *   - All argument/support shapes export as GraphicStyle rectangles.
 *   - Element→element connectors are straight lines between nearest edge midpoints.
 *   - Warrant→connection attachments are straight lines to the interpolated
 *     point on the target connection (no true tee).
 *   - Embedded images are dropped.
 */
import type {
  Connection,
  ContributorType,
  DiagramElement,
  Position,
  StyleConfig,
} from '../types';
import {
  isArgumentElement,
  isArrowAttachment,
  isInfoBoxElement,
  isSupportElement,
  isTeacherSupportElement,
} from '../types';
import { getContributorColor, getSupportColors } from './colors';
import { saveFile } from './saveFile';

// Shape symbolIds. Rectangle is a UUID from the GraphicStyle pack; textbox / oval /
// hexagon are DiagramMix short-string built-ins that render alongside GraphicStyle.
const RECTANGLE_SYMBOL_ID = 'DC1D4341-F0D2-4524-81EC-6061602C6C3A';
const TEXTBOX_SYMBOL_ID = '_textbox';
const OVAL_SYMBOL_ID = 'e300';
const HEXAGON_SYMBOL_ID = 'eGR84FC';

// Normalized 32-point ellipse approximation used by DiagramMix for oval contours.
// Copied from a DiagramMix-produced `.diagramx` oval sample. Because the points are
// in [0,1] ratio-of-frame coordinates, the same list works for any oval size.
const OVAL_CONTOUR_POINTS: Array<[number, number]> = [
  [0.9924656381486675, 0.5014901776462674],
  [0.9824827122632735, 0.5983684912370071],
  [0.9538512166397786, 0.6886012711587534],
  [0.9085470743272146, 0.7702554977783579],
  [0.8485462083746128, 0.8413981514626712],
  [0.7758245418310047, 0.900096212578544],
  [0.6923579977454224, 0.9444166614928282],
  [0.600122499166897, 0.9724264785723747],
  [0.50109396914446, 0.9821926441840345],
  [0.4020654391220233, 0.9724264785723747],
  [0.30982994054349755, 0.9444166614928282],
  [0.22636339645791492, 0.900096212578544],
  [0.15364172991430747, 0.8413981514626712],
  [0.09364086396170573, 0.7702554977783579],
  [0.04833672164914146, 0.6886012711587534],
  [0.019705226025646765, 0.5983684912370071],
  [0.009722300140252478, 0.5014901776462674],
  [0.019705226025646446, 0.4046118640555277],
  [0.04833672164914146, 0.31437908413378135],
  [0.09364086396170541, 0.2327248575141768],
  [0.15364172991430747, 0.1615822038298636],
  [0.22636339645791526, 0.10288414271399071],
  [0.30982994054349755, 0.05856369379970653],
  [0.4020654391220233, 0.030553876720160026],
  [0.50109396914446, 0.02078771110850017],
  [0.600122499166897, 0.030553876720160026],
  [0.6923579977454224, 0.05856369379970653],
  [0.7758245418310047, 0.10288414271399071],
  [0.8485462083746128, 0.1615822038298636],
  [0.9085470743272146, 0.2327248575141768],
  [0.9538512166397786, 0.31437908413378135],
  [0.9824827122632732, 0.4046118640555277],
  [0.9924656381486675, 0.5014901776462674],
];

const RECTANGLE_CONTOUR_POINTS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

interface Rgba {
  a: number;
  b: number;
  g: number;
  r: number;
}

function hexToRgba(hex: string, alpha = 1): Rgba {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return { a: alpha, b, g, r };
}

function transparentRgba(): Rgba {
  return { a: 0, b: 0, g: 0, r: 0 };
}

// Mirror of scripts/convert-drawing.py's mapping, inverted.
function contributorToColorSchemeId(contributor: ContributorType): number {
  switch (contributor) {
    case 'given':
      return 1;
    case 'teacher':
      return 2;
    case 'joint':
      return 3;
    case 'implicit':
      return 4;
    case 'student':
      return 10;
  }
}

interface ElementStyle {
  colorSchemeId: number;
  fillColor: Rgba | null; // null = transparent / no fill
  lineType: 'solid' | 'dashed';
  stroke: Rgba;
  symbolId: string;
}

function getElementStyle(element: DiagramElement): ElementStyle {
  if (isInfoBoxElement(element)) {
    return {
      colorSchemeId: 0,
      fillColor: null,
      lineType: 'solid',
      stroke: transparentRgba(),
      symbolId: TEXTBOX_SYMBOL_ID,
    };
  }
  if (isArgumentElement(element)) {
    const stroke = hexToRgba(getContributorColor(element.contributor));
    const lineType: 'solid' | 'dashed' =
      element.contributor === 'student' || element.contributor === 'joint'
        ? 'dashed'
        : 'solid';
    // Implicit warrants render as the "preparation" hexagon — a visual stand-in
    // for the cloud shape that ETD uses natively, since DiagramMix has no cloud.
    const symbolId =
      element.contributor === 'implicit' ? HEXAGON_SYMBOL_ID : RECTANGLE_SYMBOL_ID;
    return {
      colorSchemeId: contributorToColorSchemeId(element.contributor),
      fillColor: null,
      lineType,
      stroke,
      symbolId,
    };
  }
  if (isSupportElement(element) || isTeacherSupportElement(element)) {
    const contributor: 'teacher' | 'student' = isSupportElement(element)
      ? element.contributor
      : 'teacher';
    const colors = getSupportColors(element.supportType, contributor);
    return {
      colorSchemeId: contributorToColorSchemeId(contributor),
      fillColor: element.supportType === 'action' ? null : hexToRgba(colors.fill),
      lineType: 'solid',
      stroke: hexToRgba(colors.border),
      symbolId: OVAL_SYMBOL_ID,
    };
  }
  return {
    colorSchemeId: 1,
    fillColor: null,
    lineType: 'solid',
    stroke: hexToRgba('#000000'),
    symbolId: RECTANGLE_SYMBOL_ID,
  };
}

function formatAttribution(element: DiagramElement): string {
  const a = element.attribution;
  if (!a) return '';
  const speaker = a.speaker?.trim() ?? '';
  const timestamp = a.timestamp?.trim() ?? '';
  if (!speaker && !timestamp) return '';
  if (speaker && timestamp) return `${speaker} @ ${timestamp}`;
  return speaker || timestamp;
}

function getElementText(element: DiagramElement): string {
  const parts: string[] = [];
  if (isArgumentElement(element) || isInfoBoxElement(element)) {
    if (element.label) parts.push(element.label);
  }
  if (element.content) parts.push(element.content);
  const attribution = formatAttribution(element);
  if (attribution) parts.push(attribution);
  return parts.join('\n\n');
}

function getElementCenter(element: DiagramElement): Position {
  return {
    x: element.position.x + element.size.width / 2,
    y: element.position.y + element.size.height / 2,
  };
}

// Nearest of the four edge midpoints to a target point. Cheap proxy for
// ETD's orthogonal routing — good enough for Level A.
function getEdgeMidpointNearestTo(
  element: DiagramElement,
  target: Position,
): Position {
  const left = element.position.x;
  const right = element.position.x + element.size.width;
  const top = element.position.y;
  const bottom = element.position.y + element.size.height;
  const cx = left + element.size.width / 2;
  const cy = top + element.size.height / 2;

  const candidates: Position[] = [
    { x: left, y: cy },
    { x: right, y: cy },
    { x: cx, y: top },
    { x: cx, y: bottom },
  ];

  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = (c.x - target.x) ** 2 + (c.y - target.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// UTF-8-safe base64 for the `pathData` field.
function base64Encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function buildPathData(points: Position[]): string {
  return base64Encode(
    JSON.stringify({
      isClosed: false,
      nodes: points.map((p) => ({ position: [p.x, p.y] })),
    }),
  );
}

function buildStickySpots(): Array<Record<string, unknown>> {
  const base = crypto.randomUUID().toUpperCase();
  const mk = (suffix: number, rel: [number, number]) => ({
    id: `${base}_${suffix}`,
    isUserDefined: false,
    positionKind: 'fixed',
    relativePosition: rel,
  });
  return [
    mk(32768, [0, 0.5]),
    mk(32769, [1, 0.5]),
    mk(32770, [0.5, 1]),
    mk(32771, [0.5, 0]),
  ];
}

function buildTextStyle(color: Rgba, fontName: string): Record<string, unknown> {
  return {
    alignment: 'center',
    autosize: false,
    color,
    fixedWidth: false,
    fontName,
    fontScale: 1,
    fontSize: 12,
    indentFirst: 0,
    indentLeft: 0,
    indentRight: 0,
    isBold: false,
    isDblUnderline: false,
    isItalic: false,
    isOverline: false,
    isStrikethrough: false,
    isUnderline: false,
    letterSpacing: 0,
    paddingBottom: 5,
    paddingLeft: 0,
    paddingMode: 'absolute',
    paddingRight: 0,
    paddingTop: 5,
    spacingAfter: 0,
    spacingBefore: 0,
    superscriptMode: 0,
    textAngle: 0,
    textCase: 0,
    verticalAlignment: 1,
  };
}

function buildSymbolItem(element: DiagramElement, uuid: string): Record<string, unknown> {
  const style = getElementStyle(element);
  const text = getElementText(element);
  const isTextbox = style.symbolId === TEXTBOX_SYMBOL_ID;
  const isHexagon = style.symbolId === HEXAGON_SYMBOL_ID;
  const isOval = style.symbolId === OVAL_SYMBOL_ID;

  const frame = [
    [element.position.x, element.position.y],
    [element.size.width, element.size.height],
  ];
  const textColor = isTextbox || isHexagon ? hexToRgba('#000000') : style.stroke;
  const fontName = isTextbox ? 'CourierNewPSMT' : 'Helvetica';

  const symbol: Record<string, unknown> = {
    connectedConnectorsCount: 0,
    contourBounds: frame,
    frame,
    hasShadow: false,
    id: { uuid },
    isHidden: false,
    isLocked: false,
    opacity: 1,
    rotationRadians: 0,
    // Hexagons and ovals in DiagramMix samples ship with empty sticky spots;
    // rectangles and textboxes use four edge-midpoint anchors.
    stickySpots: isHexagon || isOval ? [] : buildStickySpots(),
    symbolId: style.symbolId,
  };

  // Contour geometry. Hexagon has none (DiagramMix draws it from symbolId alone).
  if (isOval) {
    symbol.contourPoints = OVAL_CONTOUR_POINTS;
  } else if (!isHexagon) {
    symbol.contourPoints = RECTANGLE_CONTOUR_POINTS;
  }

  // Border / fill / stroke are only emitted for shapes that have user-facing strokes.
  // Hexagon renders with DiagramMix defaults (no explicit styling). Textbox has none.
  if (!isTextbox && !isHexagon) {
    symbol.contourStyle = {
      color: style.stroke,
      drawOnlyContour: false,
      lineType: style.lineType,
      opacity: 1,
      width: 3,
    };
    symbol.fill = {
      color: style.fillColor ?? transparentRgba(),
      fillType: 'solid',
      opacity: style.fillColor ? 1 : 0,
    };
    symbol.stroke = { color: style.stroke, width: 3 };
  }

  // Text + textStyle if anything to show. All shape types can hold text.
  if (text) {
    symbol.text = text;
    symbol.textStyle = buildTextStyle(textColor, fontName);
  }

  return { symbol: { _0: symbol } };
}

interface ConnectorEndpoints {
  from: Position;
  to: Position;
}

function computeConnectorEndpoints(
  fromEl: DiagramElement,
  toEl: DiagramElement,
): ConnectorEndpoints {
  const fromCenter = getElementCenter(fromEl);
  const toCenter = getElementCenter(toEl);
  return {
    from: getEdgeMidpointNearestTo(fromEl, toCenter),
    to: getEdgeMidpointNearestTo(toEl, fromCenter),
  };
}

function buildConnectorItem(
  uuid: string,
  endpoints: ConnectorEndpoints,
  colorSchemeId: number,
  hasEndArrow: boolean,
): Record<string, unknown> {
  const arrowSize = hasEndArrow ? 12.6 : 0;
  const connectorStyle: Record<string, unknown> = {
    bodyId: 'Style One',
    colorHex: '#000000',
    colorSchemeId,
    endArrowSizeHeight: arrowSize,
    endArrowSizeWidth: arrowSize,
    lineCap: 'butt',
    lineJoin: 'round',
    startArrowSizeHeight: 0,
    startArrowSizeWidth: 0,
    thickness: 3,
  };
  if (hasEndArrow) connectorStyle.endArrowheadKind = 1;

  return {
    connector: {
      _0: {
        checkpoints: [],
        colorSchemeId,
        connectorStyle,
        endAttachment: { free: { point: [endpoints.to.x, endpoints.to.y] } },
        fromPoint: [endpoints.from.x, endpoints.from.y],
        id: { uuid },
        intermediatePoints: [],
        isHidden: false,
        isLocked: false,
        labelOffset: [0, 0],
        labelPosition: 0.5,
        opacity: 1,
        pathData: buildPathData([endpoints.from, endpoints.to]),
        routingMode: 'straight',
        startAttachment: { free: { point: [endpoints.from.x, endpoints.from.y] } },
        stroke: { color: hexToRgba('#000000'), width: 3 },
        textLayoutMode: 'alongPath',
        toPoint: [endpoints.to.x, endpoints.to.y],
      },
    },
  };
}

/** True if any argument element has an embedded image. Used for the dropped-images warning. */
export function hasEmbeddedImages(elements: DiagramElement[]): boolean {
  return elements.some((el) => isArgumentElement(el) && !!el.image);
}

export function hasAttachedQualifiers(elements: DiagramElement[]): boolean {
  return elements.some(
    (el) =>
      isArgumentElement(el) &&
      el.argumentType === 'qualifier' &&
      el.attachedTo !== undefined,
  );
}

/** True if any connection is a counterclaim. Used for the dropped-slash warning. */
export function hasCounterclaims(connections: Connection[]): boolean {
  return connections.some((c) => c.type === 'counterclaim');
}

// ETD generates element/connection IDs like `"elem-1776639276555-a8r76gsgj"` which
// are not RFC 4122 UUIDs. DiagramMix decodes `id.uuid` into Swift's `UUID` type and
// rejects anything that isn't in 8-4-4-4-12 hex format. So we mint a proper UUID
// per ETD id and use it consistently throughout the file.
function normalizeId(etdId: string, cache: Map<string, string>): string {
  const existing = cache.get(etdId);
  if (existing) return existing;
  const uuid = crypto.randomUUID().toUpperCase();
  cache.set(etdId, uuid);
  return uuid;
}

/** Serialize ETD diagram state to a `.diagramx` JSON string. */
export function exportToDiagramx(
  elements: DiagramElement[],
  connections: Connection[],
  diagramName: string,
  // styleConfig is accepted for forward-compatibility (renamed type labels).
  // At Level A, all element text comes from el.label / el.content — no
  // type-derived strings are emitted — so the body does not use it yet.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _styleConfig?: StyleConfig,
): string {
  const elementsById = new Map(elements.map((e) => [e.id, e]));
  const idMap = new Map<string, string>();

  // Pass 1: compute endpoints for every element→element connection so that
  // warrant attachments (ConnectionTargets) can interpolate along them.
  const endpointsById = new Map<string, ConnectorEndpoints>();
  for (const conn of connections) {
    if (isArrowAttachment(conn.to)) continue;
    const fromEl = elementsById.get(conn.from);
    const toEl = elementsById.get(conn.to);
    if (fromEl && toEl) {
      endpointsById.set(conn.id, computeConnectorEndpoints(fromEl, toEl));
    }
  }

  const symbolUuids: string[] = [];
  const symbolItems: Record<string, unknown>[] = [];
  for (const el of elements) {
    const uuid = normalizeId(el.id, idMap);
    symbolUuids.push(uuid);
    symbolItems.push(buildSymbolItem(el, uuid));
  }

  const connectorUuids: string[] = [];
  const connectorItems: Record<string, unknown>[] = [];
  for (const conn of connections) {
    const fromEl = elementsById.get(conn.from);
    if (!fromEl) continue;

    let endpoints: ConnectorEndpoints | null = null;
    // Counterclaims are symmetric — no arrowhead. Their slash has no
    // DiagramMix equivalent and is dropped (Toolbar warns).
    let hasEndArrow = conn.type !== 'counterclaim';

    if (isArrowAttachment(conn.to)) {
      const target = endpointsById.get(conn.to.connectionId);
      if (!target) continue; // skip nested / unresolved attachments
      const t = Math.max(0, Math.min(1, conn.to.position));
      const attachPoint: Position = {
        x: target.from.x + (target.to.x - target.from.x) * t,
        y: target.from.y + (target.to.y - target.from.y) * t,
      };
      endpoints = {
        from: getEdgeMidpointNearestTo(fromEl, attachPoint),
        to: attachPoint,
      };
      hasEndArrow = false;
    } else {
      const toEl = elementsById.get(conn.to);
      if (!toEl) continue;
      endpoints = computeConnectorEndpoints(fromEl, toEl);
    }

    const colorSchemeId = isArgumentElement(fromEl)
      ? contributorToColorSchemeId(fromEl.contributor)
      : 1;

    const uuid = normalizeId(conn.id, idMap);
    connectorUuids.push(uuid);
    connectorItems.push(buildConnectorItem(uuid, endpoints, colorSchemeId, hasEndArrow));
  }

  // Interleave uuid stubs with full definitions; symbols first, then connectors.
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < symbolItems.length; i++) {
    items.push({ uuid: symbolUuids[i] });
    items.push(symbolItems[i]);
  }
  for (let i = 0; i < connectorItems.length; i++) {
    items.push({ uuid: connectorUuids[i] });
    items.push(connectorItems[i]);
  }

  const layerItemIDs = [...symbolUuids, ...connectorUuids].map((id) => ({ uuid: id }));
  const activeLayerId = crypto.randomUUID().toUpperCase();
  const tabId = crypto.randomUUID().toUpperCase();

  const doc = {
    activeTabIndex: 0,
    printSettings: {
      bottomMargin: 90,
      customScale: 1,
      leftMargin: 72,
      orientation: 'portrait',
      paperSize: [612, 792],
      rightMargin: 72,
      scaling: 'fitToPage',
      topMargin: 90,
    },
    tabs: [
      {
        id: tabId,
        model: {
          activeLayerId,
          items,
          layers: [
            {
              id: activeLayerId,
              isLocked: false,
              isVisible: true,
              itemIDs: layerItemIDs,
              name: 'Drawing Layer',
            },
          ],
          schemaVersion: 1,
          selection: [],
          settings: {
            gridSize: 28.346456692913,
            showGrid: true,
            smartRouteAutoCheckpointOffsetFactor: 1.05,
            smartRouteCrossingPenalty: 40,
            smartRouteIdealNudgingDistance: 8,
            smartRoutePortDirectionPenalty: 100,
            smartRouteSegmentPenalty: 5,
            smartRouteShapeBufferDistance: 0,
            snapToGrid: false,
            theme: 'clean',
          },
        },
        name: diagramName || 'Page 1',
        pageKind: 'freeform',
      },
    ],
    templateReference: {
      displayName: 'Graphic Style',
      packId: 'GraphicStyle',
      sourcePath:
        '/Applications/Diagrammix.app/Contents/Resources/Notations/Misc/GraphicStyle.db',
      sourceType: 'sqlite',
      usesStyledConnector: false,
    },
  };

  return JSON.stringify(doc, null, 2);
}

/** Browser save helper — matches the pattern used by Save / SVG / PDF exports. */
export async function downloadDiagramx(json: string, filename: string): Promise<void> {
  await saveFile({
    data: new Blob([json], { type: 'application/json' }),
    suggestedName: filename,
    mimeType: 'application/json',
    extension: '.diagramx',
    description: 'DiagramMix file',
  });
}
