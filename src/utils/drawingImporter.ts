/**
 * DiagramMix .drawing file importer
 *
 * Parses Apple binary plist (NSKeyedArchiver) format from DiagramMix app
 * and converts to ETD diagram elements.
 */

import type { DiagramElement, ArgumentElement, Position, Size, ContributorType } from '../types';

interface ParsedElement {
  index: number;
  text: string | null;
  colorSchemeId: number;
  position: Position | null;
  size: { width: number; height: number } | null;
}

interface ParsedConnection {
  index: number;
  from?: number;
  to?: number;
}

interface ParsedDrawing {
  elements: ParsedElement[];
  connections: ParsedConnection[];
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

  // Look for explicit labels
  if (lower.includes('claim')) return 'claim';
  if (lower.includes('warrant')) return 'warrant';
  if (lower.includes('backing')) return 'backing';
  if (lower.includes('qualifier') || lower.includes('probably') || lower.includes('likely')) return 'qualifier';
  if (lower.includes('rebuttal') || lower.includes('unless') || lower.includes('but')) return 'rebuttal';

  // Default to data
  return 'data';
}

// Parse a binary plist file (runs in browser using plist.js or similar)
export async function parseDrawingFile(file: File): Promise<ParsedDrawing> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  // Check for binary plist magic bytes
  if (data[0] === 0x62 && data[1] === 0x70 && data[2] === 0x6c && data[3] === 0x69 &&
      data[4] === 0x73 && data[5] === 0x74) {
    // Binary plist - need to convert
    // For now, we'll need to use a server-side converter or plist library
    throw new Error('Binary plist format detected. Please convert to XML first using: plutil -convert xml1 yourfile.drawing');
  }

  // Try to parse as XML plist
  const text = new TextDecoder().decode(data);
  return parseXMLPlist(text);
}

// Parse XML plist format
function parseXMLPlist(xmlText: string): ParsedDrawing {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // Get the objects array from NSKeyedArchiver format
  const plistRoot = doc.querySelector('plist > dict');
  if (!plistRoot) {
    throw new Error('Invalid plist format');
  }

  // Parse the $objects array
  const objects = parseNSKeyedArchiver(plistRoot);

  return extractDiagramData(objects);
}

// Parse NSKeyedArchiver structure
function parseNSKeyedArchiver(dictElement: Element): unknown[] {
  const objects: unknown[] = [];

  // Find the $objects key and its array
  const keys = dictElement.querySelectorAll(':scope > key');
  for (const key of keys) {
    if (key.textContent === '$objects') {
      const array = key.nextElementSibling;
      if (array?.tagName === 'array') {
        for (const child of array.children) {
          objects.push(parseValue(child));
        }
      }
    }
  }

  return objects;
}

// Parse a plist value element
function parseValue(element: Element): unknown {
  switch (element.tagName) {
    case 'string':
      return element.textContent || '';
    case 'integer':
      return parseInt(element.textContent || '0', 10);
    case 'real':
      return parseFloat(element.textContent || '0');
    case 'true':
      return true;
    case 'false':
      return false;
    case 'data':
      return { _type: 'data', value: element.textContent };
    case 'dict': {
      const dict: Record<string, unknown> = {};
      const children = Array.from(element.children);
      for (let i = 0; i < children.length; i += 2) {
        const key = children[i];
        const value = children[i + 1];
        if (key?.tagName === 'key' && value) {
          dict[key.textContent || ''] = parseValue(value);
        }
      }
      return dict;
    }
    case 'array': {
      return Array.from(element.children).map(parseValue);
    }
    default:
      return null;
  }
}

// Extract diagram data from parsed objects
function extractDiagramData(objects: unknown[]): ParsedDrawing {
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];

  // Helper to resolve UID references
  const resolve = (obj: unknown): unknown => {
    if (obj && typeof obj === 'object' && 'CF$UID' in (obj as Record<string, unknown>)) {
      const uid = (obj as { 'CF$UID': number })['CF$UID'];
      return objects[uid];
    }
    return obj;
  };

  // Helper to get class name
  const getClassName = (obj: unknown): string | null => {
    if (obj && typeof obj === 'object' && '$class' in (obj as Record<string, unknown>)) {
      const classRef = resolve((obj as Record<string, unknown>)['$class']);
      if (classRef && typeof classRef === 'object' && '$classname' in (classRef as Record<string, unknown>)) {
        return (classRef as Record<string, unknown>)['$classname'] as string;
      }
    }
    return null;
  };

  // Helper to parse point string
  const parsePoint = (s: unknown): { x: number; y: number } | null => {
    if (typeof s === 'string' && s.startsWith('{')) {
      const match = s.match(/\{([^,]+),\s*([^}]+)\}/);
      if (match) {
        return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
      }
    }
    return null;
  };

  // Helper to get element text through the reference chain
  const getElementText = (elemObj: Record<string, unknown>): string | null => {
    try {
      const textObj = resolve(elemObj['text']) as Record<string, unknown>;
      if (!textObj) return null;

      const adorn = resolve(textObj['DKTextShape_textAdornment']) as Record<string, unknown>;
      if (!adorn) return null;

      const subst = resolve(adorn['DKTextAdornment_substitutor']) as Record<string, unknown>;
      if (!subst) return null;

      const attrStr = resolve(subst['DKOTextSubstitutor_attributedString']) as Record<string, unknown>;
      if (!attrStr) return null;

      const nsStr = resolve(attrStr['NSString']);
      if (typeof nsStr === 'string') return nsStr;
      if (nsStr && typeof nsStr === 'object' && 'NS.string' in (nsStr as Record<string, unknown>)) {
        return (nsStr as Record<string, string>)['NS.string'];
      }
    } catch {
      return null;
    }
    return null;
  };

  // Find DiaElement objects
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const className = getClassName(obj);

    if (className === 'DiaElement') {
      const elemObj = obj as Record<string, unknown>;

      const element: ParsedElement = {
        index: i,
        text: getElementText(elemObj),
        colorSchemeId: (elemObj['colorSchemeId'] as number) || 0,
        position: null,
        size: null,
      };

      // Get position
      const loc = resolve(elemObj['location']);
      if (typeof loc === 'string') {
        element.position = parsePoint(loc);
      }

      // Get size
      const size = resolve(elemObj['size']);
      if (typeof size === 'string') {
        const p = parsePoint(size);
        if (p) {
          element.size = { width: p.x, height: p.y };
        }
      }

      elements.push(element);
    }

    // Find connections (DiaDecoratedSeparator)
    if (className === 'DiaDecoratedSeparator') {
      connections.push({ index: i });
      // Connection endpoints would need more complex parsing
    }
  }

  return { elements, connections };
}

// Convert parsed drawing to ETD elements
export function convertToETDElements(parsed: ParsedDrawing): DiagramElement[] {
  const elements: DiagramElement[] = [];

  // Track labels by type for numbering
  const labelCounts: Record<string, number> = {
    data: 0,
    claim: 0,
    warrant: 0,
    backing: 0,
    qualifier: 0,
    rebuttal: 0,
  };

  for (const pe of parsed.elements) {
    if (!pe.position || !pe.size) continue;

    const text = pe.text || '';
    const argumentType = inferArgumentType(text);
    const contributor = mapColorSchemeToContributor(pe.colorSchemeId);

    labelCounts[argumentType]++;
    const label = `${argumentType.charAt(0).toUpperCase() + argumentType.slice(1)} ${labelCounts[argumentType]}`;

    // Parse attribution from text (timestamps like "(0:09:13.2)")
    let attribution: { speaker: string; timestamp: string } | undefined;
    const timestampMatch = text.match(/^\((\d+:\d+(?::\d+)?(?:\.\d+)?)\)\s*/);
    if (timestampMatch) {
      attribution = {
        speaker: '',
        timestamp: timestampMatch[1],
      };
    }

    const element: ArgumentElement = {
      id: crypto.randomUUID(),
      type: 'argument',
      argumentType,
      contributor,
      label,
      position: pe.position,
      size: pe.size,
      content: text,
      attribution,
    };

    elements.push(element);
  }

  return elements;
}
