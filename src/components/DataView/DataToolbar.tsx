import { ArrowDownWideNarrow, ArrowUpNarrowWide, BookOpen, Download, RefreshCw, Search, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GroupFilter, SortKey } from '../../data/groupView';
import type { Codebook } from '../../data/types';

export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const SORT_LABELS: Record<SortKey, string> = {
  order: 'Original order',
  episode: 'Episode',
  part: 'Part',
  contributor: 'Contributor',
  who: 'Who',
  time: 'Time',
  status: 'Status',
};

const buttonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white! px-2.5! py-1! text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white';
const selectClass =
  'rounded-md border border-[var(--border)] bg-white! px-1.5! py-1! text-[13px] text-[var(--text)] hover:border-[var(--border-strong)]';

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-[13px]! font-normal! tracking-normal! normal-case! text-[var(--text-secondary)]! select-none">
      <input type="checkbox" className="accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export interface DataToolbarProps {
  scopeLabel: string;
  filter: GroupFilter;
  onFilter: (f: GroupFilter) => void;
  sort: SortState;
  onSort: (s: SortState) => void;
  codebook: Codebook | null;
  rowCount: number;
  groupCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenCodebook: (() => void) | null;
  onExport: () => void;
  onImport: () => void;
  exporting: boolean;
  /** Why Export all / Import can't be used here; null when they can. */
  transferDisabled: string | null;
}

export function DataToolbar({
  scopeLabel, filter, onFilter, sort, onSort, codebook, rowCount, groupCount, refreshing, onRefresh, onOpenCodebook,
  onExport, onImport, exporting, transferDisabled,
}: DataToolbarProps) {
  const set = <K extends keyof GroupFilter>(k: K, v: GroupFilter[K] | undefined) => {
    const next = { ...filter };
    if (v === undefined || v === false || v === '') delete next[k];
    else next[k] = v;
    onFilter(next);
  };
  const kinds = (codebook?.kinds ?? [])
    .filter((k) => k.mergedInto === undefined)
    .sort((a, b) => (a.type === b.type ? a.position - b.position : a.type === 'question' ? -1 : 1));
  const categories = [...new Set(kinds.map((k) => k.category))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--chrome-bg)] px-4! py-2!">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2! text-[15px] font-semibold text-[var(--text)]">{scopeLabel}</h2>
        <span className="text-[12px] text-[var(--text-secondary)]">
          {rowCount} {rowCount === 1 ? 'row' : 'rows'} · {groupCount} {groupCount === 1 ? 'component' : 'components'}
        </span>
        <div className="ml-auto! flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass} onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
            Refresh
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={onExport}
            disabled={transferDisabled !== null || exporting}
            title={transferDisabled ?? 'Download these rows as an Excel workbook'}
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export all'}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={onImport}
            disabled={transferDisabled !== null}
            title={transferDisabled ?? 'Import Clip, Status, SG/WC, Discipline, Type and Kind from an exported workbook'}
          >
            <Upload size={14} />
            Import
          </button>
          {onOpenCodebook && (
            <button type="button" className={buttonClass} onClick={onOpenCodebook}>
              <BookOpen size={14} />
              Codebook
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="search"
            placeholder="Search components and moves"
            aria-label="Search components and moves"
            className={`${selectClass} w-64 pl-6!`}
            value={filter.text ?? ''}
            onChange={(e) => set('text', e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by status"
          className={selectClass}
          value={filter.status ?? ''}
          onChange={(e) => set('status', (e.target.value || undefined) as GroupFilter['status'])}
        >
          <option value="">Status: any</option>
          <option value="vetted">vetted</option>
          <option value="not vetted">not vetted</option>
          <option value="blank">blank</option>
        </select>
        <select
          aria-label="Filter by kind"
          className={`${selectClass} max-w-48`}
          value={filter.kindId ?? ''}
          onChange={(e) => set('kindId', e.target.value || undefined)}
          disabled={!codebook}
        >
          <option value="">Kind: any</option>
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}{k.status === 'retired' ? ' (retired)' : ''}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          className={`${selectClass} max-w-48`}
          value={filter.category ?? ''}
          onChange={(e) => set('category', e.target.value || undefined)}
          disabled={!codebook}
        >
          <option value="">Category: any</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Check checked={!!filter.untypedOnly} onChange={(v) => set('untypedOnly', v || undefined)}>Has an untyped move</Check>
        <Check checked={!!filter.mismatchOnly} onChange={(v) => set('mismatchOnly', v || undefined)}>Type mismatch</Check>
        <Check checked={!!filter.unlinkedOnly} onChange={(v) => set('unlinkedOnly', v || undefined)}>Unlinked moves</Check>
        <div className="ml-auto! flex items-center gap-1">
          <span className="text-[13px] text-[var(--text-secondary)]">Sort</span>
          <select
            aria-label="Sort by"
            className={selectClass}
            value={sort.key}
            onChange={(e) => onSort({ ...sort, key: e.target.value as SortKey })}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
          </select>
          <button
            type="button"
            className={buttonClass}
            aria-label={sort.dir === 'asc' ? 'Ascending; switch to descending' : 'Descending; switch to ascending'}
            title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() => onSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
          >
            {sort.dir === 'asc' ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
