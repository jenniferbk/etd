// Where the Data view's diagrams come from: the open diagram (store) or every
// diagram in a library group (server). Both hand the grid the same shape.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { api } from '../api/client';
import { friendlyError } from '../api/friendlyError';
import { useAuthStore } from '../api/authStore';
import { useDiagramStore } from '../store';
import { useCloudStore } from '../store/cloudStore';
import { useCodebookStore } from '../store/codebookStore';
import { useToastStore } from '../store/toastStore';
import { applyLocalOpsToStore, docFromStore } from '../live/storeBridge';
import { applyOps, type LiveDoc } from '../live/ops';
import { generateUuid } from '../utils/uuid';
import { editsToOps, type CellEdit } from './edits';
import type { Codebook, DiagramDocInput } from './types';

export interface DataSource {
  inputs: DiagramDocInput[];
  codebook: Codebook | null;
  loading: boolean;
  error: string | null;
  applyEdits(diagramKey: string, edits: CellEdit[]): Promise<void>;
  openElement(diagramId: number | null, elementId: string): void;
  reload(): Promise<void>;
  scope: 'diagram' | 'library';
  groupId: number | null;
  groupName: string | null;
}

const useGroupName = (groupId: number | null) =>
  useAuthStore((s) => (groupId === null ? null : (s.groups.find((g) => g.id === groupId)?.name ?? null)));

const useGroupCodebook = (groupId: number | null) =>
  useCodebookStore((s) => (groupId === null ? null : (s.byGroup[groupId] ?? null)));

/** The diagram open in the canvas. Edits go through the store, so they are
 *  undoable and the live session sends them like canvas edits. */
export function useStoreDataSource(): DataSource {
  const { diagramId, groupId } = useCloudStore(useShallow((s) => ({ diagramId: s.diagramId, groupId: s.groupId })));
  // Subscribe to every slice docFromStore() reads, then rebuild the doc when one changes.
  const slices = useDiagramStore(
    useShallow((s) => ({
      name: s.diagramName,
      elements: s.elements,
      connections: s.connections,
      notes: s.notes,
      styleConfig: s.styleConfig,
      transcript: s.transcript,
      episode: s.episode,
    })),
  );
  const codebook = useGroupCodebook(groupId);
  const groupName = useGroupName(groupId);

  // The diagram is already in memory, so rows show at once; kinds and
  // categories fill in when the codebook arrives. A failure is a toast, not a blank grid.
  const ensureCodebook = useCallback(async (gid: number) => {
    try {
      await useCodebookStore.getState().ensure(gid, [docFromStore()]);
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  }, []);

  useEffect(() => {
    if (groupId === null) return;
    void (async () => { await ensureCodebook(groupId); })();
  }, [groupId, ensureCodebook]);

  const inputs = useMemo<DiagramDocInput[]>(() => {
    const doc = docFromStore();
    return [{ diagramId, title: slices.name, versionId: null, folderId: null, doc }];
  }, [diagramId, slices]);

  const applyEdits = useCallback(async (_diagramKey: string, edits: CellEdit[]) => {
    applyLocalOpsToStore(editsToOps(edits, docFromStore()));
  }, []);

  const openElement = useCallback((_diagramId: number | null, elementId: string) => {
    useDiagramStore.getState().setSelectedIds([elementId]);
  }, []);

  const reload = useCallback(async () => {
    if (groupId !== null) await ensureCodebook(groupId);
  }, [groupId, ensureCodebook]);

  return {
    inputs,
    codebook,
    loading: false,
    error: null,
    applyEdits,
    openElement,
    reload,
    scope: 'diagram',
    groupId,
    groupName,
  };
}

interface GroupDataDiagram {
  id: number;
  title: string;
  folderId: number | null;
  currentVersionId: number;
  snapshot: LiveDoc;
}

const noop = () => {};

let tabClientId: string | null = null;
/** One live-ops client id per browser tab, distinct from any canvas live session. */
function dataClientId(): string {
  tabClientId ??= `data-${generateUuid()}`;
  return tabClientId;
}

/** Every diagram in a library group (optionally one folder). Edits post as
 *  live ops, so a teammate with the diagram open receives them live and the
 *  server merges them with theirs. */
export function useLibraryDataSource(
  groupId: number,
  folderId: number | null,
  openElement: (diagramId: number | null, elementId: string) => void = noop,
): DataSource {
  const [diagrams, setDiagrams] = useState<GroupDataDiagram[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const codebook = useGroupCodebook(groupId);
  const groupName = useGroupName(groupId);
  const requestSeq = useRef(0);
  const diagramsRef = useRef<GroupDataDiagram[] | null>(null);
  useEffect(() => { diagramsRef.current = diagrams; }, [diagrams]);

  const reload = useCallback(async () => {
    const seq = ++requestSeq.current;
    setError(null);
    let res: { diagrams: GroupDataDiagram[] };
    try {
      res = await api<{ diagrams: GroupDataDiagram[] }>(`/api/groups/${groupId}/data`);
      if (seq !== requestSeq.current) return;
      setDiagrams(res.diagrams);
    } catch (err) {
      if (seq === requestSeq.current) setError(friendlyError(err));
      return;
    }
    // The rows still show without a codebook; only kinds and categories wait on it.
    try {
      await useCodebookStore.getState().ensure(groupId, res.diagrams.map((d) => d.snapshot));
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  }, [groupId]);

  useEffect(() => {
    void (async () => { await reload(); })();
  }, [reload]);

  const inputs = useMemo<DiagramDocInput[]>(
    () =>
      (diagrams ?? [])
        .filter((d) => folderId === null || d.folderId === folderId)
        .map((d) => ({
          diagramId: d.id,
          // The doc's name is what a title edit changes; the row title is the fallback.
          title: typeof d.snapshot.name === 'string' && d.snapshot.name ? d.snapshot.name : d.title,
          versionId: d.currentVersionId,
          folderId: d.folderId,
          doc: d.snapshot,
        })),
    [diagrams, folderId],
  );

  const applyEdits = useCallback(
    async (diagramKey: string, edits: CellEdit[]) => {
      const id = Number(diagramKey);
      const target = diagramsRef.current?.find((d) => d.id === id);
      if (!target) return;
      const ops = editsToOps(edits, target.snapshot);
      if (ops.length === 0) return;
      setDiagrams((prev) =>
        prev && prev.map((d) => (d.id === id ? { ...d, snapshot: applyOps(d.snapshot, ops) } : d)),
      );
      try {
        await api<{ seq?: number; duplicate?: boolean }>(`/api/diagrams/${id}/live/ops`, {
          method: 'POST',
          body: { clientId: dataClientId(), batchId: generateUuid(), ops },
        });
      } catch (err) {
        useToastStore.getState().addToast('error', friendlyError(err));
        await reload();
      }
    },
    [reload],
  );

  return {
    inputs,
    codebook,
    loading: diagrams === null && error === null,
    error,
    applyEdits,
    openElement,
    reload,
    scope: 'library',
    groupId,
    groupName,
  };
}
