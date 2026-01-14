/**
 * DiagramMix .drawing file importer
 *
 * Parses Apple binary plist (NSKeyedArchiver) format from DiagramMix app
 * and converts to ETD diagram elements and connections.
 */

import { Buffer } from 'buffer';
import bplist from 'bplist-parser';
import type { DiagramElement, ArgumentElement, InfoBoxElement, Connection, ContributorType } from '../types';

// Make Buffer available globally for bplist-parser
if (typeof window !== 'undefined') {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

interface PlistUID {
  UID: number;
}

type PlistObject = Record<string, unknown> | string | number | boolean | null | Buffer | PlistUID | unknown[];

interface StyleInfo {
  strokeColor: { r: number; g: number; b: number } | null;
  hasDash: boolean;
}

interface ParsedElement {
  id: string;
  index: number;
  text: string | null;
  styleInfo: StyleInfo;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface ImportResult {
  elements: DiagramElement[];
  connections: Connection[];
  name: string;
}

// Map stroke color + dash to ETD contributor types
function mapStyleToContributor(styleInfo: StyleInfo): ContributorType {
  const { strokeColor, hasDash } = styleInfo;

  if (!strokeColor) {
    return 'student'; // Default
  }

  const { r, g, b } = strokeColor;

  // Red stroke = teacher (r=1, g=0, b=0)
  if (r > 0.8 && g < 0.2 && b < 0.2) {
    return 'teacher';
  }

  // Green stroke = given (r=0, g=1, b=0)
  if (r < 0.2 && g > 0.8 && b < 0.2) {
    return 'given';
  }

  // Blue stroke with dash = student (r=0, g=0, b=1)
  if (r < 0.2 && g < 0.2 && b > 0.8) {
    return hasDash ? 'student' : 'student';
  }

  // Purple/magenta = could be student or joint
  if (r > 0.4 && g < 0.2 && b > 0.4) {
    return hasDash ? 'student' : 'joint';
  }

  // Gray or other = implicit
  if (Math.abs(r - g) < 0.1 && Math.abs(g - b) < 0.1 && r > 0.3 && r < 0.7) {
    return 'implicit';
  }

  // Default based on dash
  return hasDash ? 'student' : 'given';
}

// Determine argument type from text content (heuristics)
function inferArgumentType(text: string): 'data' | 'claim' | 'warrant' | 'backing' | 'qualifier' | 'rebuttal' {
  const lower = text.toLowerCase();

  if (lower.includes('claim')) return 'claim';
  if (lower.includes('warrant')) return 'warrant';
  if (lower.includes('backing')) return 'backing';
  if (lower.includes('qualifier') || lower.includes('probably') || lower.includes('likely')) return 'qualifier';
  if (lower.includes('rebuttal') || lower.includes('unless')) return 'rebuttal';

  return 'data';
}

// Parse point string like "{x, y}"
function parsePointString(s: unknown): { x: number; y: number } | null {
  if (typeof s === 'string' && s.startsWith('{')) {
    const parts = s.replace(/[{}]/g, '').split(',');
    if (parts.length === 2) {
      return { x: parseFloat(parts[0].trim()), y: parseFloat(parts[1].trim()) };
    }
  }
  return null;
}

// Decode NSBezierPath binary segments to get start/end points
function decodeBezierPath(pathObj: PlistObject): { start: { x: number; y: number } | null; end: { x: number; y: number } | null } {
  if (!pathObj || typeof pathObj !== 'object' || Array.isArray(pathObj)) {
    return { start: null, end: null };
  }

  const segments = (pathObj as Record<string, unknown>)['NSSegments'];
  if (!segments || !Buffer.isBuffer(segments)) {
    return { start: null, end: null };
  }

  const data = segments;
  if (data.length < 9) {
    return { start: null, end: null };
  }

  try {
    // Parse first point (skip type byte, read big-endian float32 pair)
    const x1 = data.readFloatBE(1);
    const y1 = data.readFloatBE(5);
    const start = { x: x1, y: y1 };

    // Parse last point if we have enough data
    let end = start;
    if (data.length >= 18) {
      const x2 = data.readFloatBE(10);
      const y2 = data.readFloatBE(14);
      end = { x: x2, y: y2 };
    }

    return { start, end };
  } catch {
    return { start: null, end: null };
  }
}

// Calculate minimum distance from a point to an element's bounding box edge
function distanceToElementBounds(
  point: { x: number; y: number },
  elem: ParsedElement
): number {
  const { x, y } = point;
  const { position, size } = elem;
  const left = position.x;
  const right = position.x + size.width;
  const top = position.y;
  const bottom = position.y + size.height;

  // Check if point is inside element bounds
  if (x >= left && x <= right && y >= top && y <= bottom) {
    return 0;
  }

  // Calculate horizontal distance
  let dx = 0;
  if (x < left) dx = left - x;
  else if (x > right) dx = x - right;

  // Calculate vertical distance
  let dy = 0;
  if (y < top) dy = top - y;
  else if (y > bottom) dy = y - bottom;

  return Math.sqrt(dx * dx + dy * dy);
}

// Find element nearest to a point using distance to bounds (not centers)
function findNearestElement(
  point: { x: number; y: number } | null,
  elements: ParsedElement[],
  threshold = 300
): string | null {
  if (!point || (point.x === 0 && point.y === 0)) {
    return null;
  }

  let bestMatch: string | null = null;
  let bestDist = Infinity;

  for (const elem of elements) {
    const dist = distanceToElementBounds(point, elem);

    if (dist < bestDist && dist <= threshold) {
      bestDist = dist;
      bestMatch = elem.id;
    }
  }

  return bestMatch;
}

// Main import function
export async function importDrawingFile(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Parse binary plist
  let plistData: Record<string, unknown>;
  try {
    const parsed = bplist.parseBuffer(buffer);
    if (!parsed || !parsed[0]) {
      throw new Error('Empty plist');
    }
    plistData = parsed[0] as Record<string, unknown>;
  } catch (err) {
    console.error('Failed to parse plist:', err);
    throw new Error('Failed to parse .drawing file. The file may be corrupted or in an unsupported format.');
  }

  const objects = plistData['$objects'] as PlistObject[];
  if (!objects || !Array.isArray(objects)) {
    throw new Error('Invalid .drawing file: missing $objects array');
  }

  // Helper to resolve UID references
  const resolveUID = (obj: unknown): PlistObject => {
    if (obj && typeof obj === 'object' && 'UID' in (obj as Record<string, unknown>)) {
      const uid = (obj as PlistUID).UID;
      return objects[uid];
    }
    return obj as PlistObject;
  };

  // Helper to get class name
  const getClassName = (obj: unknown): string | null => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && !Buffer.isBuffer(obj)) {
      const dict = obj as Record<string, unknown>;
      if ('$class' in dict) {
        const classRef = resolveUID(dict['$class']);
        if (classRef && typeof classRef === 'object' && !Array.isArray(classRef) && !Buffer.isBuffer(classRef)) {
          return (classRef as Record<string, unknown>)['$classname'] as string || null;
        }
      }
    }
    return null;
  };

  // Helper to get text through the adornment reference chain
  const getTextFromAdornmentChain = (textObj: Record<string, unknown>): string | null => {
    try {
      const adorn = resolveUID(textObj['DKTextShape_textAdornment']);
      if (!adorn || typeof adorn !== 'object' || Array.isArray(adorn) || Buffer.isBuffer(adorn)) return null;

      const subst = resolveUID((adorn as Record<string, unknown>)['DKTextAdornment_substitutor']);
      if (!subst || typeof subst !== 'object' || Array.isArray(subst) || Buffer.isBuffer(subst)) return null;

      const attrStr = resolveUID((subst as Record<string, unknown>)['DKOTextSubstitutor_attributedString']);
      if (!attrStr || typeof attrStr !== 'object' || Array.isArray(attrStr) || Buffer.isBuffer(attrStr)) return null;

      const nsStr = resolveUID((attrStr as Record<string, unknown>)['NSString']);
      if (typeof nsStr === 'string') return nsStr;
      if (nsStr && typeof nsStr === 'object' && !Array.isArray(nsStr) && !Buffer.isBuffer(nsStr)) {
        const strDict = nsStr as Record<string, unknown>;
        if ('NS.string' in strDict) {
          return strDict['NS.string'] as string;
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  // Helper to get element text through the reference chain
  const getElementText = (elemObj: Record<string, unknown>): string | null => {
    try {
      const textObj = resolveUID(elemObj['text']);
      if (!textObj || typeof textObj !== 'object' || Array.isArray(textObj) || Buffer.isBuffer(textObj)) return null;
      return getTextFromAdornmentChain(textObj as Record<string, unknown>);
    } catch {
      return null;
    }
  };

  // Helper to extract style info (stroke color and dash) from element
  const getStyleInfo = (elemObj: Record<string, unknown>): StyleInfo => {
    const defaultStyle: StyleInfo = { strokeColor: null, hasDash: false };

    try {
      const styleObj = resolveUID(elemObj['style']);
      if (!styleObj || typeof styleObj !== 'object' || Array.isArray(styleObj) || Buffer.isBuffer(styleObj)) {
        return defaultStyle;
      }

      const renderlistObj = resolveUID((styleObj as Record<string, unknown>)['renderlist']);
      if (!renderlistObj || typeof renderlistObj !== 'object' || Array.isArray(renderlistObj) || Buffer.isBuffer(renderlistObj)) {
        return defaultStyle;
      }

      // Get array of renderers from NS.objects
      const renderers = (renderlistObj as Record<string, unknown>)['NS.objects'];
      if (!Array.isArray(renderers)) {
        return defaultStyle;
      }

      // Find DKStroke in renderlist
      for (const rendererRef of renderers) {
        const renderer = resolveUID(rendererRef);
        const cn = getClassName(renderer);

        if (cn === 'DKStroke' && renderer && typeof renderer === 'object' && !Array.isArray(renderer) && !Buffer.isBuffer(renderer)) {
          const strokeObj = renderer as Record<string, unknown>;

          // Check for dash
          const dashRef = strokeObj['dash'];
          const hasDash = dashRef && typeof dashRef === 'object' && 'UID' in (dashRef as Record<string, unknown>) && (dashRef as PlistUID).UID !== 0;

          // Get color
          const colorObj = resolveUID(strokeObj['colour']);
          if (colorObj && typeof colorObj === 'object' && !Array.isArray(colorObj) && !Buffer.isBuffer(colorObj)) {
            const colorDict = colorObj as Record<string, unknown>;
            const nsrgb = colorDict['NSRGB'];

            if (Buffer.isBuffer(nsrgb)) {
              // Parse "R G B\0" format
              const colorStr = nsrgb.toString('utf8').replace(/\0/g, '').trim();
              const parts = colorStr.split(/\s+/);
              if (parts.length >= 3) {
                return {
                  strokeColor: {
                    r: parseFloat(parts[0]),
                    g: parseFloat(parts[1]),
                    b: parseFloat(parts[2]),
                  },
                  hasDash: !!hasDash,
                };
              }
            }
          }

          return { strokeColor: null, hasDash: !!hasDash };
        }
      }
    } catch {
      // Ignore errors, return default
    }

    return defaultStyle;
  };

  // Extract DiaElements (argument boxes)
  const parsedElements: ParsedElement[] = [];
  const labelCounts: Record<string, number> = {
    data: 0, claim: 0, warrant: 0, backing: 0, qualifier: 0, rebuttal: 0,
  };

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const className = getClassName(obj);

    if (className === 'DiaElement') {
      const elemObj = obj as Record<string, unknown>;

      const loc = resolveUID(elemObj['location']);
      const sz = resolveUID(elemObj['size']);

      const position = parsePointString(loc);
      const sizePoint = parsePointString(sz);

      if (position && sizePoint) {
        const text = getElementText(elemObj) || '';
        const styleInfo = getStyleInfo(elemObj);

        // Skip elements with no text (likely decorative lines/separators)
        if (!text.trim()) {
          continue;
        }

        parsedElements.push({
          id: crypto.randomUUID(),
          index: i,
          text,
          styleInfo,
          position,
          size: { width: sizePoint.x, height: sizePoint.y },
        });
      }
    }
  }

  // Extract DiaText objects (loose text -> Info Box)
  const infoBoxElements: InfoBoxElement[] = [];
  let infoBoxCount = 0;

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const className = getClassName(obj);

    if (className === 'DiaText') {
      const textObj = obj as Record<string, unknown>;

      const loc = resolveUID(textObj['location']);
      const sz = resolveUID(textObj['size']);

      const position = parsePointString(loc);
      const sizePoint = parsePointString(sz);

      if (position && sizePoint) {
        // Get text through the text reference
        let text: string | null = null;
        const textRef = textObj['text'];
        if (textRef) {
          const innerTextObj = resolveUID(textRef);
          if (innerTextObj && typeof innerTextObj === 'object' && !Array.isArray(innerTextObj) && !Buffer.isBuffer(innerTextObj)) {
            text = getTextFromAdornmentChain(innerTextObj as Record<string, unknown>);
          }
        }

        if (text && text.trim()) {
          infoBoxCount++;
          infoBoxElements.push({
            id: crypto.randomUUID(),
            type: 'infoBox',
            label: `Info ${infoBoxCount}`,
            position,
            size: { width: sizePoint.x, height: sizePoint.y },
            content: text.trim(),
          });
        }
      }
    }
  }

  // Convert DiaElements to ETD ArgumentElements
  const argumentElements: DiagramElement[] = parsedElements.map((pe) => {
    const text = pe.text || '';
    const argumentType = inferArgumentType(text);
    const contributor = mapStyleToContributor(pe.styleInfo);

    labelCounts[argumentType]++;
    const label = `${argumentType.charAt(0).toUpperCase() + argumentType.slice(1)} ${labelCounts[argumentType]}`;

    // Parse attribution from text (timestamps like "(0:09:13.2)")
    let attribution: { speaker: string; timestamp: string } | undefined;
    const timestampMatch = text.match(/^\((\d+:\d+(?::\d+)?(?:\.\d+)?)\)\s*/);
    if (timestampMatch) {
      attribution = { speaker: '', timestamp: timestampMatch[1] };
    }

    const element: ArgumentElement = {
      id: pe.id,
      type: 'argument',
      argumentType,
      contributor,
      label,
      position: pe.position,
      size: pe.size,
      content: text,
      attribution,
    };

    return element;
  });

  // Combine all elements (info boxes first, then arguments)
  const etdElements: DiagramElement[] = [...infoBoxElements, ...argumentElements];

  // Extract connections from DiaDecoratedSeparator objects
  // These can be at top level or inside DiaElement groups
  const connections: Connection[] = [];
  const seenConnections = new Set<string>();

  // First, find all connection segments and their absolute positions
  interface ConnectionSegment {
    start: { x: number; y: number };
    end: { x: number; y: number };
  }
  const allSegments: ConnectionSegment[] = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const className = getClassName(obj);

    if (className === 'DiaDecoratedSeparator') {
      const connObj = obj as Record<string, unknown>;

      // Get container to find offset
      let offset = { x: 0, y: 0 };
      const containerRef = connObj['container'];
      if (containerRef) {
        const container = resolveUID(containerRef);
        if (container && typeof container === 'object' && !Array.isArray(container) && !Buffer.isBuffer(container)) {
          const containerCn = getClassName(container);

          // If container is a DiaElement (group), get its location
          if (containerCn === 'DiaElement' || containerCn === 'DKObjectDrawingLayer') {
            const locRef = (container as Record<string, unknown>)['location'];
            if (locRef) {
              const loc = resolveUID(locRef);
              const locPoint = parsePointString(loc);
              if (locPoint) {
                offset = locPoint;
              }
            }
          }
        }
      }

      // Get path coordinates
      const pathRef = connObj['path'];
      if (!pathRef) continue;

      const pathObj = resolveUID(pathRef);
      const { start, end } = decodeBezierPath(pathObj);

      if (start && end) {
        // Apply offset to convert to absolute coordinates
        allSegments.push({
          start: { x: start.x + offset.x, y: start.y + offset.y },
          end: { x: end.x + offset.x, y: end.y + offset.y },
        });
      }
    }
  }

  // Now try to find connections by matching segment endpoints to elements
  // Also try to chain segments together for multi-segment connections
  for (const segment of allSegments) {
    const fromElem = findNearestElement(segment.start, parsedElements);
    const toElem = findNearestElement(segment.end, parsedElements);

    // Create connection if both ends matched and they're different elements
    if (fromElem && toElem && fromElem !== toElem) {
      const key = `${fromElem}->${toElem}`;
      const reverseKey = `${toElem}->${fromElem}`;
      if (!seenConnections.has(key) && !seenConnections.has(reverseKey)) {
        seenConnections.add(key);
        connections.push({
          id: crypto.randomUUID(),
          from: fromElem,
          to: toElem,
          type: 'support',
        });
      }
    }
  }

  // If we have segments but few connections, try to chain segments together
  // This handles cases where connections are made of multiple short segments
  if (allSegments.length > 0 && connections.length < allSegments.length / 2) {
    // Find segment chains: segments whose endpoints are close together
    const CHAIN_THRESHOLD = 20; // pixels

    for (let i = 0; i < allSegments.length; i++) {
      for (let j = i + 1; j < allSegments.length; j++) {
        const seg1 = allSegments[i];
        const seg2 = allSegments[j];

        // Check if end of seg1 is close to start of seg2
        const dist1 = Math.sqrt(
          (seg1.end.x - seg2.start.x) ** 2 + (seg1.end.y - seg2.start.y) ** 2
        );
        // Check if end of seg2 is close to start of seg1
        const dist2 = Math.sqrt(
          (seg2.end.x - seg1.start.x) ** 2 + (seg2.end.y - seg1.start.y) ** 2
        );

        if (dist1 < CHAIN_THRESHOLD || dist2 < CHAIN_THRESHOLD) {
          // These segments are chained, create connection from outer endpoints
          const chainStart = dist1 < CHAIN_THRESHOLD ? seg1.start : seg2.start;
          const chainEnd = dist1 < CHAIN_THRESHOLD ? seg2.end : seg1.end;

          const fromElem = findNearestElement(chainStart, parsedElements);
          const toElem = findNearestElement(chainEnd, parsedElements);

          if (fromElem && toElem && fromElem !== toElem) {
            const key = `${fromElem}->${toElem}`;
            const reverseKey = `${toElem}->${fromElem}`;
            if (!seenConnections.has(key) && !seenConnections.has(reverseKey)) {
              seenConnections.add(key);
              connections.push({
                id: crypto.randomUUID(),
                from: fromElem,
                to: toElem,
                type: 'support',
              });
            }
          }
        }
      }
    }
  }

  // Use the first info box content as diagram name, or fall back to filename
  const diagramName = infoBoxElements.length > 0
    ? infoBoxElements[0].content.split('\n')[0].trim() // First line of first info box
    : file.name.replace(/\.drawing$/, '');

  return {
    elements: etdElements,
    connections,
    name: diagramName,
  };
}
