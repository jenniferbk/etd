// Shared "Save diagram as .json" logic, used by both the ⌘S handler (App) and
// the toolbar Save button. Routes through saveFile() so it gets the native
// save dialog where available.

import type { AnalyticNote, Connection, DiagramElement, StyleConfig, Transcript } from '../types';
import { SAVE_SCHEMA_VERSION } from './schema';
import { saveFile } from './saveFile';

export const DEFAULT_DIAGRAM_NAME = 'Untitled Diagram';

// Title to use when opening a saved .json file. Files saved before a title
// was typed carry the default name even when the user renamed the file in
// the save dialog — in that case the filename is the title they meant.
export function nameForLoadedFile(storedName: unknown, fileName: string): string {
  const stored = typeof storedName === 'string' ? storedName.trim() : '';
  if (stored && stored !== DEFAULT_DIAGRAM_NAME) return stored;
  return fileName.replace(/\.json$/i, '').trim() || DEFAULT_DIAGRAM_NAME;
}

// Slugify a diagram name into a safe filename stem (no extension).
export function toFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'diagram'
  );
}

export interface DiagramSnapshot {
  diagramName: string;
  elements: DiagramElement[];
  connections: Connection[];
  styleConfig: StyleConfig;
  transcript: Transcript | null;
  notes: AnalyticNote[];
}

export function buildDiagramFile(snapshot: DiagramSnapshot) {
  return {
    version: SAVE_SCHEMA_VERSION,
    name: snapshot.diagramName,
    elements: snapshot.elements,
    connections: snapshot.connections,
    styleConfig: snapshot.styleConfig,
    transcript: snapshot.transcript,
    notes: snapshot.notes,
  };
}

export async function saveDiagramJson(snapshot: DiagramSnapshot): Promise<void> {
  const data = buildDiagramFile(snapshot);
  await saveFile({
    data: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    suggestedName: `${toFilename(snapshot.diagramName)}.json`,
    mimeType: 'application/json',
    extension: '.json',
    description: 'Toulmin diagram',
  });
}
