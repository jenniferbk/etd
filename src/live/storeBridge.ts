// Moves documents between the diagram store and the live-sync engine.
import { useDiagramStore } from '../store';
import type { AnalyticNote, Connection, DiagramElement, Transcript } from '../types';
import type { StyleConfig } from '../types/styleConfig';
import { SAVE_SCHEMA_VERSION } from '../utils/schema';
import { applyOps, diffDocs, type LiveDoc, type Op } from './ops';

type DiagramState = ReturnType<typeof useDiagramStore.getState>;
type UndoSnapshot = Partial<Pick<DiagramState, 'elements' | 'connections' | 'styleConfig'>>;

export function docFromState(s: DiagramState): LiveDoc {
  return {
    version: SAVE_SCHEMA_VERSION,
    name: s.diagramName,
    elements: s.elements as unknown as LiveDoc['elements'],
    connections: s.connections as unknown as LiveDoc['connections'],
    notes: s.notes as unknown as LiveDoc['notes'],
    styleConfig: s.styleConfig,
    transcript: s.transcript,
  };
}

export function docFromStore(): LiveDoc {
  return docFromState(useDiagramStore.getState());
}

/** Apply remote edits to one undo/redo snapshot, so undo only ever reverts
 *  this person's own edits and never a teammate's. */
export function rebaseUndoSnapshot(snap: UndoSnapshot, delta: readonly Op[]): UndoSnapshot {
  const relevant = delta.filter((op) =>
    op.t === 'set' ? op.k === 'styleConfig' : op.c === 'elements' || op.c === 'connections',
  );
  if (relevant.length === 0) return snap;
  const asDoc: LiveDoc = {
    name: '',
    elements: (snap.elements ?? []) as unknown as LiveDoc['elements'],
    connections: (snap.connections ?? []) as unknown as LiveDoc['connections'],
    notes: [],
    styleConfig: snap.styleConfig,
  };
  const next = applyOps(asDoc, relevant);
  return {
    ...snap,
    ...(snap.elements ? { elements: next.elements as unknown as DiagramElement[] } : {}),
    ...(snap.connections ? { connections: next.connections as unknown as Connection[] } : {}),
    ...(snap.styleConfig ? { styleConfig: next.styleConfig as StyleConfig } : {}),
  };
}

/**
 * Replace the store's document with `next` (a merge of remote edits). The
 * change is kept out of undo history, existing undo snapshots are rebased
 * onto it, and the selection drops anything a teammate deleted.
 */
export function applyDocToStore(next: LiveDoc): void {
  const prev = docFromStore();
  const delta = diffDocs(prev, next);
  if (delta.length === 0) return;
  const temporal = useDiagramStore.temporal;
  temporal.getState().pause();
  try {
    useDiagramStore.setState((s) => {
      const elements = next.elements as unknown as DiagramElement[];
      const ids = new Set(elements.map((e) => e.id));
      const connIds = new Set((next.connections as unknown as Connection[]).map((c) => c.id));
      return {
        diagramName: typeof next.name === 'string' ? next.name : s.diagramName,
        elements,
        connections: next.connections as unknown as Connection[],
        notes: next.notes as unknown as AnalyticNote[],
        styleConfig: (next.styleConfig as StyleConfig | undefined) ?? s.styleConfig,
        transcript: (next.transcript ?? null) as Transcript | null,
        selectedIds: s.selectedIds.filter((id) => ids.has(id) || connIds.has(id)),
      };
    });
  } finally {
    temporal.getState().resume();
  }
  const t = temporal.getState();
  temporal.setState({
    pastStates: t.pastStates.map((p) => rebaseUndoSnapshot(p, delta)),
    futureStates: t.futureStates.map((p) => rebaseUndoSnapshot(p, delta)),
  });
}
