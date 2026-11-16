// Moves documents between the diagram store and the live-sync engine.
import { useDiagramStore } from '../store';
import type { AnalyticNote, Connection, DiagramElement, Transcript } from '../types';
import type { EpisodeFields } from '../types/episode';
import type { StyleConfig } from '../types/styleConfig';
import { normalizeContainers } from '../utils/containers';
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
    // Omitted when empty so a doc without episode data diffs clean.
    ...(Object.keys(s.episode).length > 0 ? { episode: s.episode } : {}),
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
      // Concurrent edits can break the one-level rule; repair it here. The
      // normalizer is deterministic and returns the same array when valid, so
      // the corrected doc diffs back to the server once and converges.
      const elements = normalizeContainers(next.elements as unknown as DiagramElement[]);
      const ids = new Set(elements.map((e) => e.id));
      const connIds = new Set((next.connections as unknown as Connection[]).map((c) => c.id));
      return {
        diagramName: typeof next.name === 'string' ? next.name : s.diagramName,
        elements,
        connections: next.connections as unknown as Connection[],
        notes: next.notes as unknown as AnalyticNote[],
        styleConfig: (next.styleConfig as StyleConfig | undefined) ?? s.styleConfig,
        transcript: (next.transcript ?? null) as Transcript | null,
        episode: (next.episode ?? {}) as EpisodeFields,
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

/**
 * Apply the user's own edit (ops built by the data view) to the store. Unlike
 * applyDocToStore it is NOT paused in undo, so it is undoable, and the live
 * sync engine diffs the new state and sends it.
 */
export function applyLocalOpsToStore(ops: Op[]): void {
  if (ops.length === 0) return;
  const next = applyOps(docFromStore(), ops);
  useDiagramStore.setState((s) => {
    const elements = next.elements as unknown as DiagramElement[];
    const connections = next.connections as unknown as Connection[];
    const ids = new Set(elements.map((e) => e.id));
    const connIds = new Set(connections.map((c) => c.id));
    return {
      diagramName: typeof next.name === 'string' ? next.name : s.diagramName,
      elements,
      connections,
      notes: next.notes as unknown as AnalyticNote[],
      episode: (next.episode ?? {}) as EpisodeFields,
      selectedIds: s.selectedIds.filter((id) => ids.has(id) || connIds.has(id)),
    };
  });
}

/**
 * Write a codebook-mirrored styleConfig. Kept out of undo history, and existing
 * undo/redo snapshots take the same styleConfig so undo cannot bring back the
 * pre-mirror kinds. The live engine still sends it: it follows store state by
 * reference, not the temporal middleware.
 */
export function applyMirroredStyleConfig(next: StyleConfig): void {
  const temporal = useDiagramStore.temporal;
  temporal.getState().pause();
  try {
    useDiagramStore.setState({ styleConfig: next });
  } finally {
    temporal.getState().resume();
  }
  const t = temporal.getState();
  const rebase = (p: UndoSnapshot): UndoSnapshot => (p.styleConfig ? { ...p, styleConfig: next } : p);
  temporal.setState({
    pastStates: t.pastStates.map(rebase),
    futureStates: t.futureStates.map(rebase),
  });
}
