/**
 * DiagramMix .drawing file importer
 *
 * Parses Apple binary plist (NSKeyedArchiver) format from DiagramMix app
 * and converts to ETD diagram elements and connections.
 */

import { Buffer } from 'buffer';
import bplist from 'bplist-parser';
import type { DiagramElement, ArgumentElement, Connection, ContributorType } from '../types';

// Make Buffer available globally for bplist-parser
if (typeof window !== 'undefined') {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

interface PlistUID {
  UID: number;
}

type PlistObject = Record<string, unknown> | string | number | boolean | null | Buffer | PlistUID | unknown[];

interface ParsedElement {
  id: string;
  index: number;
  text: string | null;
  colorSchemeId: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface ImportResult {
  elements: DiagramElement[];
  connections: Connection[];
  name: string;
}

// Map DiagramMix colorSchemeId to ETD contributor types
function mapColorSchemeToContributor(colorSchemeId: number): ContributorType {
  switch (colorSchemeId) {
    case 1:
      return 'given';      // Green - provided/given info
    case 10:
      return 'student';    // Purple dashed - student contribution
    case 2:
      return 'teacher';    // Red - teacher
    case 3:
      return 'joint';      // Joint contribution
    case 4:
      return 'implicit';   // Implicit/unstated
    default:
      return 'student';    // Default to student
  }
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

// Find element nearest to a point within threshold
function findNearestElement(
  point: { x: number; y: number } | null,
  elements: ParsedElement[],
  threshold = 250
): string | null {
  if (!point || (point.x === 0 && point.y === 0)) {
    return null;
  }

  let bestMatch: string | null = null;
  let bestDist = Infinity;

  for (const elem of elements) {
    const cx = elem.position.x + elem.size.width / 2;
    const cy = elem.position.y + elem.size.height / 2;
    let dist = Math.sqrt((point.x - cx) ** 2 + (point.y - cy) ** 2);

    // Check if point is within element bounds
    const inBounds =
      point.x >= elem.position.x &&
      point.x <= elem.position.x + elem.size.width &&
      point.y >= elem.position.y &&
      point.y <= elem.position.y + elem.size.height;

    if (inBounds) {
      dist = 0;
    }

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

  // Helper to get element text through the reference chain
  const getElementText = (elemObj: Record<string, unknown>): string | null => {
    try {
      const textObj = resolveUID(elemObj['text']);
      if (!textObj || typeof textObj !== 'object' || Array.isArray(textObj) || Buffer.isBuffer(textObj)) return null;

      const adorn = resolveUID((textObj as Record<string, unknown>)['DKTextShape_textAdornment']);
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

  // Extract elements
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
        const colorSchemeId = (elemObj['colorSchemeId'] as number) || 0;

        parsedElements.push({
          id: crypto.randomUUID(),
          index: i,
          text,
          colorSchemeId,
          position,
          size: { width: sizePoint.x, height: sizePoint.y },
        });
      }
    }
  }

  // Convert to ETD elements
  const etdElements: DiagramElement[] = parsedElements.map((pe) => {
    const text = pe.text || '';
    const argumentType = inferArgumentType(text);
    const contributor = mapColorSchemeToContributor(pe.colorSchemeId);

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

  // Extract connections
  const connections: Connection[] = [];
  const seenConnections = new Set<string>();

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const className = getClassName(obj);

    if (className === 'DiaDecoratedSeparator') {
      const connObj = obj as Record<string, unknown>;

      // Get container offset (path coordinates are relative to container)
      let offset = { x: 0, y: 0 };
      const containerRef = connObj['container'];
      if (containerRef) {
        const container = resolveUID(containerRef);
        if (container && typeof container === 'object' && !Array.isArray(container) && !Buffer.isBuffer(container)) {
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

      // Get path coordinates
      const pathRef = connObj['path'];
      if (!pathRef) continue;

      const pathObj = resolveUID(pathRef);
      const { start, end } = decodeBezierPath(pathObj);

      // Apply offset to convert to absolute coordinates
      const absStart = start ? { x: start.x + offset.x, y: start.y + offset.y } : null;
      const absEnd = end ? { x: end.x + offset.x, y: end.y + offset.y } : null;

      // Find nearest elements
      const fromElem = findNearestElement(absStart, parsedElements);
      const toElem = findNearestElement(absEnd, parsedElements);

      // Create connection if both ends matched and they're different elements
      if (fromElem && toElem && fromElem !== toElem) {
        const key = `${fromElem}->${toElem}`;
        if (!seenConnections.has(key)) {
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

  return {
    elements: etdElements,
    connections,
    name: file.name.replace(/\.drawing$/, ''),
  };
}
