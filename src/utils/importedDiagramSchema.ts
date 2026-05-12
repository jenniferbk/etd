import { z } from 'zod';

const positionSchema = z.object({ x: z.number(), y: z.number() });
const sizeSchema = z.object({ width: z.number(), height: z.number() });
const attributionSchema = z.object({
  speaker: z.string().optional(),
  timestamp: z.string().optional(),
}).optional();

const argumentElementSchema = z.object({
  id: z.string(),
  type: z.literal('argument'),
  argumentType: z.enum(['claim', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal']),
  contributor: z.enum(['given', 'teacher', 'student', 'joint', 'implicit']),
  label: z.string(),
  content: z.string(),
  attribution: attributionSchema,
  position: positionSchema,
  size: sizeSchema,
});

const supportElementSchema = z.object({
  id: z.string(),
  type: z.literal('support'),
  supportType: z.enum(['action', 'question', 'other']),
  contributor: z.enum(['teacher', 'student']),
  content: z.string(),
  attribution: attributionSchema,
  position: positionSchema,
  size: sizeSchema,
});

const infoBoxElementSchema = z.object({
  id: z.string(),
  type: z.literal('infoBox'),
  label: z.string(),
  content: z.string(),
  position: positionSchema,
  size: sizeSchema,
});

const elementSchema = z.discriminatedUnion('type', [
  argumentElementSchema,
  supportElementSchema,
  infoBoxElementSchema,
]);

const connectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.literal('support'),
});

const importedDiagramSchema = z.object({
  version: z.string(),
  name: z.string(),
  elements: z.array(elementSchema),
  connections: z.array(connectionSchema),
});

export type ImportedDiagram = z.infer<typeof importedDiagramSchema>;

export type ParseResult =
  | { kind: 'ok'; diagram: ImportedDiagram }
  | { kind: 'empty_diagram' }
  | { kind: 'schema_invalid'; issues: unknown[] };

export function parseImportedDiagram(input: unknown): ParseResult {
  const parsed = importedDiagramSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: 'schema_invalid', issues: parsed.error.issues };
  }

  const { elements, connections } = parsed.data;

  // Drop elements with duplicate ids (keep first).
  const seen = new Set<string>();
  const dedupedElements: typeof elements = [];
  for (const el of elements) {
    if (seen.has(el.id)) {
      console.warn(`parseImportedDiagram: dropping element with duplicate id "${el.id}"`);
      continue;
    }
    seen.add(el.id);
    dedupedElements.push(el);
  }

  if (dedupedElements.length === 0) {
    return { kind: 'empty_diagram' };
  }

  // Drop connections whose endpoints are missing.
  const elementIds = new Set(dedupedElements.map((e) => e.id));
  const validConnections = connections.filter((c) => {
    if (!elementIds.has(c.from) || !elementIds.has(c.to)) {
      console.warn(`parseImportedDiagram: dropping connection "${c.id}" with missing endpoint (${c.from} → ${c.to})`);
      return false;
    }
    return true;
  });

  return {
    kind: 'ok',
    diagram: { ...parsed.data, elements: dedupedElements, connections: validConnections },
  };
}
