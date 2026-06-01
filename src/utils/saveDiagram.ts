// Shared "Save diagram as .json" logic, used by both the ⌘S handler (App) and
// the toolbar Save button. Routes through saveFile() so it gets the native
// save dialog where available.

import type { Connection, DiagramElement, StyleConfig, Transcript } from '../types';
import { SAVE_SCHEMA_VERSION } from './schema';
import { saveFile } from './saveFile';

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
}

export async function saveDiagramJson(snapshot: DiagramSnapshot): Promise<void> {
  const data = {
    version: SAVE_SCHEMA_VERSION,
    name: snapshot.diagramName,
    elements: snapshot.elements,
    connections: snapshot.connections,
    styleConfig: snapshot.styleConfig,
    transcript: snapshot.transcript,
  };
  await saveFile({
    data: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    suggestedName: `${toFilename(snapshot.diagramName)}.json`,
    mimeType: 'application/json',
    extension: '.json',
    description: 'Toulmin diagram',
  });
}
