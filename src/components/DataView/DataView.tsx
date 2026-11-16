import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { buildDataset, toRows } from '../../data/buildRows';
import { filterGroups, sortGroups, type GroupFilter } from '../../data/groupView';
import type { CellEdit } from '../../data/edits';
import type { DataSource } from '../../data/sources';
import type { ComponentGroup } from '../../data/types';
import { useCloudStore } from '../../store/cloudStore';
import { useToastStore } from '../../store/toastStore';
import { buildExportWorkbook, exportFileName } from '../../data/xlsx/exportWorkbook';
import { DataGrid } from './DataGrid';
import { DataToolbar, type SortState } from './DataToolbar';
import { ImportDialog } from './ImportDialog';

const rowsIn = (g: ComponentGroup) =>
  Math.max(1, g.moves.untyped.length, g.moves.question.length, g.moves.other.length);

const openCodebook = () => {
  const cloud = useCloudStore.getState();
  cloud.setView('workspace');
  cloud.setWorkspaceTab('codebook');
};

/** The Data view: toolbar, then the grid of component groups (spec §3–§4). */
export function DataView({ source }: { source: DataSource }) {
  const { inputs, codebook, applyEdits, openElement, reload } = source;
  const [filter, setFilter] = useState<GroupFilter>({});
  const [sort, setSort] = useState<SortState>({ key: 'order', dir: 'asc' });
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Typing in the search box stays responsive while a large grid re-renders.
  const deferredFilter = useDeferredValue(filter);
  const deferredSort = useDeferredValue(sort);

  const groups = useMemo(() => buildDataset(inputs, codebook), [inputs, codebook]);

  // "#" is the row's place in the unsorted, unfiltered order, so a sort can be undone.
  const firstSeq = useMemo(() => {
    const m = new Map<ComponentGroup, number>();
    let n = 1;
    for (const g of groups) {
      m.set(g, n);
      n += rowsIn(g);
    }
    return m;
  }, [groups]);

  const { rows, seqs, groupCount } = useMemo(() => {
    const shown = sortGroups(filterGroups(groups, deferredFilter), deferredSort.key, deferredSort.dir);
    const rows = toRows(shown);
    const seqs: number[] = [];
    let prev: ComponentGroup | null = null;
    let offset = 0;
    for (const r of rows) {
      offset = r.group === prev ? offset + 1 : 0;
      prev = r.group;
      seqs.push((firstSeq.get(r.group) ?? 0) + offset);
    }
    return { rows, seqs, groupCount: shown.length };
  }, [groups, deferredFilter, deferredSort, firstSeq]);

  // Raw speakers by element, so editing Who/By keeps any "Student-" prefix the grid hides.
  const speakers = useMemo(() => {
    const m = new Map<string, string>();
    for (const input of inputs) {
      const dk = input.diagramId !== null ? String(input.diagramId) : 'local';
      for (const e of input.doc.elements) {
        const a = e.attribution as { speaker?: string } | undefined;
        if (a?.speaker) m.set(`${dk}|${e.id}`, a.speaker);
      }
    }
    return m;
  }, [inputs]);
  const speaker = useCallback((dk: string, id: string) => speakers.get(`${dk}|${id}`) ?? '', [speakers]);

  const onEdit = useCallback(
    (diagramKey: string, edits: CellEdit[]) => { void applyEdits(diagramKey, edits); },
    [applyEdits],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  const { groupId, groupName } = source;
  const transferDisabled =
    groupId === null ? 'Add this diagram to a group library to export or import'
      : !codebook ? 'Waiting for the codebook…'
        : null;

  // Export all: every row in scope (the folder filter applies; grid filters and sort don't).
  const onExport = async () => {
    if (groupId === null || !codebook) return;
    setExporting(true);
    try {
      const versions: Record<number, number> = {};
      const baseVersion = useCloudStore.getState().baseVersionId;
      for (const i of inputs) {
        if (i.diagramId === null) continue;
        // The open diagram's version lives in the cloud store, not on the input.
        const v = i.versionId ?? (source.scope === 'diagram' ? baseVersion : null);
        if (v !== null) versions[i.diagramId] = v;
      }
      const now = new Date();
      const name = groupName ?? `group ${groupId}`;
      const wb = await buildExportWorkbook(groups, codebook, { groupId, groupName: name, exportedAt: now.toISOString(), versions });
      const buf = await wb.xlsx.writeBuffer();
      const { saveAs } = await import('file-saver');
      saveAs(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        exportFileName(name, now),
      );
    } catch (err) {
      useToastStore.getState().addToast('error', `Export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const scopeLabel =
    source.scope === 'diagram'
      ? 'Data · this diagram'
      : `Data · all diagrams${source.groupName ? ` in ${source.groupName}` : ''}`;

  let body;
  let isGrid = false;
  if (source.loading) {
    body = <p className="py-16! text-center text-sm text-[var(--text-secondary)]">Loading the data…</p>;
  } else if (source.error) {
    body = (
      <div className="flex flex-col items-center gap-3 py-16!">
        <p className="text-sm text-[var(--text-secondary)]">{source.error}</p>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-lg border border-[var(--border)] bg-white! px-4! py-2! text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)]"
        >
          Try again
        </button>
      </div>
    );
  } else if (groups.length === 0) {
    body = (
      <p className="py-16! text-center text-sm text-[var(--text-secondary)]">
        No argument components or responsive moves yet.
      </p>
    );
  } else if (rows.length === 0) {
    body = <p className="py-16! text-center text-sm text-[var(--text-secondary)]">No rows match these filters.</p>;
  } else {
    isGrid = true;
    body = (
      <DataGrid rows={rows} seqs={seqs} codebook={codebook} onEdit={onEdit} onOpen={openElement} speaker={speaker} />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--app-bg)]">
      <DataToolbar
        scopeLabel={scopeLabel}
        filter={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
        codebook={codebook}
        rowCount={rows.length}
        groupCount={groupCount}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        onOpenCodebook={source.groupId !== null ? openCodebook : null}
        onExport={() => void onExport()}
        onImport={() => setImportOpen(true)}
        exporting={exporting}
        transferDisabled={transferDisabled}
      />
      {groupId !== null && codebook && (
        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          groupId={groupId}
          codebook={codebook}
          onApplied={reload}
        />
      )}
      <div className={`min-h-0 flex-1 bg-white! ${isGrid ? '' : 'overflow-auto'}`}>{body}</div>
    </div>
  );
}
