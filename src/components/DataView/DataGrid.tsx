// The Data grid: Anna's layout (spec §3) as a plain table. Header colors,
// widths and gray repeats follow the approved sample workbook.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DATA_COLUMNS, type DataColumn, type DataColumnGroup } from '../../data/columns';
import { activeKinds } from '../../data/codebook';
import { clipCommit, moveContentCommit, type CommitVia } from '../../data/cellCommit';
import type { CellEdit } from '../../data/edits';
import type { Codebook, DataColumnKey, DataRow, MoveCell, MoveSlot } from '../../data/types';
import type { ArgumentType } from '../../types/elements';
import { OpenButton, SelectEditor, TextEditor, type SelectOption } from './cells';

// sample_generator.py GROUPFILL
const GROUPFILL: Record<DataColumnGroup, string> = {
  Episode: '#D9D9D9',
  Component: '#FCE4D6',
  'First pass (untyped)': '#EDEDED',
  Question: '#DDEBF7',
  Other: '#FFF2CC',
  IDs: '#F2F2F2',
  '': '#FFFFFF',
};
const REPEAT_GRAY = '#BFBFBF'; // sample's gray for repeated cells
const RULE_GROUP = '#A6A6A6'; // thin rule above each component group
const RULE_EPISODE = '#000000'; // dark rule above each episode
const RULE_ROW = '#EBEBEB'; // gridline between rows of one group
const GRIDLINE = '#E3E3E3';
const MISSING_RED = '#C00000';
const MISMATCH_AMBER = '#9C5700';

const HEADER_ROW1_H = 22;
const STICKY_KEYS: DataColumnKey[] = ['seq', 'episode']; // the sample freezes panes at C3
const WIDTHS_KEY = 'etd.dataGridWidths';
const MIN_WIDTH = 32;

const VISIBLE: DataColumn[] = DATA_COLUMNS.filter((c) => !c.hidden);
/** Excel character widths to pixels. */
const toPx = (chars: number) => Math.round(chars * 7 + 10);

const PART_TYPE: Record<string, Exclude<ArgumentType, 'qualifier'>> = {
  D: 'data', C: 'claim', W: 'warrant', B: 'backing', R: 'rebuttal',
};
const CONTRIBUTORS = ['given', 'student', 'teacher', 'joint', 'implicit'];

function loadWidths(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? 'null') as Record<string, unknown> | null;
    const out: Record<string, number> = {};
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v >= MIN_WIDTH) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
function saveWidths(w: Record<string, number>) {
  try {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify(w));
  } catch { /* not remembered; widths reset next visit */ }
}

// ---- cell specs

type Spec =
  | { mode: 'readonly'; node: ReactNode; title?: string; open?: () => void }
  | {
      mode: 'text'; node: ReactNode; initial: string; multiline?: boolean; commit: (v: string, via: CommitVia) => void;
      /** Read-only text shown under the editor (a move's timestamp). */
      aside?: string; title?: string; open?: () => void;
    }
  | {
      mode: 'select'; node: ReactNode; value: string; options: SelectOption[];
      commit: (v: string) => void; dismiss?: (reason: 'blur' | 'escape') => void; title?: string; open?: () => void;
    };

interface Ctx {
  codebook: Codebook | null;
  pendingType: 'question' | 'other' | undefined;
  edit: (diagramKey: string, edits: CellEdit[]) => void;
  setPending: (moveId: string, type: 'question' | 'other' | null) => void;
  editKind: (key: string) => void;
  open: (diagramId: number | null, id: string) => void;
  speaker: (diagramKey: string, elementId: string) => string;
}

const muted = (text: string, title?: string) => (
  <span className="italic" style={{ color: '#808080' }} title={title}>{text}</span>
);

function kindNode(m: MoveCell, slot: MoveSlot): { node: ReactNode; title?: string } {
  const k = m.kind;
  if (!k) return { node: '' };
  if (k.missing) return { node: <span style={{ color: MISSING_RED }}>{k.id}</span>, title: 'This kind is not in the codebook' };
  if (slot !== 'untyped' && k.type !== slot) {
    return {
      node: <span style={{ color: MISMATCH_AMBER }}>⚠ {k.label}</span>,
      title: `type mismatch: the codebook now lists this as a ${k.type === 'question' ? 'Question' : 'Other'} kind`,
    };
  }
  if (k.retired) return { node: <>{k.label} {muted('(retired)')}</>, title: 'Retired kind' };
  return { node: k.label };
}

function kindOptions(cb: Codebook | null, type: 'question' | 'other', current?: MoveCell['kind']): SelectOption[] {
  const opts: SelectOption[] = [{ value: '', label: '—' }];
  const active = cb ? activeKinds(cb, type) : [];
  for (const k of active) opts.push({ value: k.id, label: k.label });
  if (current && !active.some((k) => k.id === current.id)) {
    const why = current.missing ? 'not in codebook' : current.type !== type ? 'type mismatch' : 'retired';
    opts.push({ value: current.id, label: `${current.label} (${why})` });
  }
  return opts;
}

function moveSpecs(key: DataColumnKey, row: DataRow, ctx: Ctx): Spec | null {
  const slot: MoveSlot | null = key.startsWith('untyped_') ? 'untyped' : key.startsWith('question_') ? 'question' : key.startsWith('other_') ? 'other' : null;
  if (!slot) return null;
  const field = key.slice(slot.length + 1);
  const m = row[slot];
  const dk = row.group.diagramKey;
  if (!m) return { mode: 'readonly', node: '' };
  switch (field) {
    case 'move':
      return {
        mode: 'text', node: m.text, initial: m.content, multiline: true,
        aside: m.time ? `(${m.time}) · edit the time on the canvas` : undefined,
        open: () => ctx.open(row.group.diagramId, m.id),
        commit: (v) => {
          const edits = moveContentCommit(m, v);
          if (edits.length) ctx.edit(dk, edits);
        },
      };
    case 'by': {
      const raw = ctx.speaker(dk, m.id);
      return {
        mode: 'text', node: m.by, initial: raw,
        commit: (v) => { if (v.trim() !== raw) ctx.edit(dk, [{ kind: 'attribution', elementId: m.id, field: 'speaker', value: v.trim() }]); },
      };
    }
    case 'type': {
      const pending = ctx.pendingType;
      return {
        mode: 'select',
        node: pending ? (pending === 'question' ? 'Question' : 'Other') : '',
        value: pending ?? '',
        options: [{ value: '', label: '—' }, { value: 'question', label: 'Question' }, { value: 'other', label: 'Other' }],
        commit: (v) => {
          if (v === 'question' || v === 'other') {
            ctx.setPending(m.id, v);
            ctx.editKind(rowKey(row));
          } else {
            ctx.setPending(m.id, null);
          }
        },
      };
    }
    case 'kind': {
      if (slot === 'untyped') {
        const pending = ctx.pendingType;
        if (!pending) return { mode: 'readonly', node: '', title: 'Choose a Type first' };
        const sendType = (kindId: string | null) => {
          const edits: CellEdit[] = [{ kind: 'moveType', moveId: m.id, supportType: pending }];
          if (kindId) edits.push({ kind: 'moveKind', moveId: m.id, kindId });
          ctx.setPending(m.id, null);
          ctx.edit(dk, edits);
        };
        return {
          mode: 'select', node: muted('choose a kind'), value: '',
          options: kindOptions(ctx.codebook, pending),
          commit: (v) => sendType(v || null),
          dismiss: (reason) => (reason === 'blur' ? sendType(null) : ctx.setPending(m.id, null)),
        };
      }
      const { node, title } = kindNode(m, slot);
      if (!ctx.codebook) return { mode: 'readonly', node, title: 'Loading the codebook…' };
      const cur = m.kind?.id ?? '';
      return {
        mode: 'select', node, title, value: cur,
        options: kindOptions(ctx.codebook, slot, m.kind),
        commit: (v) => { if (v !== cur) ctx.edit(dk, [{ kind: 'moveKind', moveId: m.id, kindId: v || null }]); },
      };
    }
    case 'category': {
      const k = m.kind;
      if (!k) return { mode: 'readonly', node: '' };
      if (k.missing) return { mode: 'readonly', node: <span style={{ color: MISSING_RED }}>? not in codebook</span> };
      return { mode: 'readonly', node: k.category };
    }
  }
  return null;
}

function specFor(col: DataColumn, row: DataRow, seq: number, ctx: Ctx): Spec {
  const g = row.group;
  const c = g.component;
  const dk = g.diagramKey;
  const ep = g.episode;
  const episodeEdit = (field: 'clip' | 'discipline' | 'status' | 'sgwc', v: string) => {
    const next = v.trim();
    if (next === (ep[field] ?? '')) return;
    ctx.edit(dk, [{ kind: 'episode', field, value: next === '' ? null : next }]);
  };
  const choices = (vals: string[]): SelectOption[] => [{ value: '', label: '—' }, ...vals.map((v) => ({ value: v, label: v }))];

  switch (col.key) {
    case 'seq':
      return { mode: 'readonly', node: seq };
    case 'episode':
      return {
        mode: 'text', node: g.episodeTitle, initial: g.episodeTitle,
        commit: (v) => { const t = v.trim(); if (t && t !== g.episodeTitle) ctx.edit(dk, [{ kind: 'title', value: t }]); },
      };
    case 'clip':
      if (!ep.clip && g.clipSuggestion) {
        return {
          mode: 'text', node: muted(g.clipSuggestion), initial: g.clipSuggestion,
          title: 'Suggested from the info box. Edit it, or press Enter to keep it.',
          commit: (v, via) => {
            const edits = clipCommit(v, via, g.clipSuggestion!);
            if (edits.length) ctx.edit(dk, edits);
          },
        };
      }
      return { mode: 'text', node: ep.clip ?? '', initial: ep.clip ?? '', commit: (v) => episodeEdit('clip', v) };
    case 'status':
      return { mode: 'select', node: ep.status ?? '', value: ep.status ?? '', options: choices(['vetted', 'not vetted']), commit: (v) => episodeEdit('status', v) };
    case 'sgwc':
      return { mode: 'select', node: ep.sgwc ?? '', value: ep.sgwc ?? '', options: choices(['SG', 'WC']), commit: (v) => episodeEdit('sgwc', v) };
    case 'discipline':
      return { mode: 'text', node: ep.discipline ?? '', initial: ep.discipline ?? '', commit: (v) => episodeEdit('discipline', v) };
    case 'part': {
      if (!c) return { mode: 'readonly', node: '—' };
      const opts: SelectOption[] = Object.keys(PART_TYPE).map((p) => ({ value: p, label: p }));
      if (c.part === 'Q') opts.unshift({ value: 'Q', label: 'Q', disabled: true });
      return {
        mode: 'select', node: c.part, value: c.part, options: opts,
        open: () => ctx.open(g.diagramId, c.id),
        commit: (v) => { if (v !== c.part && PART_TYPE[v]) ctx.edit(dk, [{ kind: 'part', elementId: c.id, argumentType: PART_TYPE[v] }]); },
      };
    }
    case 'contributor':
      if (!c) return { mode: 'readonly', node: '' };
      return {
        mode: 'select', node: c.contributor, value: c.contributor,
        options: CONTRIBUTORS.map((v) => ({ value: v, label: v })),
        commit: (v) => { if (v !== c.contributor) ctx.edit(dk, [{ kind: 'contributor', elementId: c.id, value: v }]); },
      };
    case 'content':
      if (!c) return { mode: 'readonly', node: muted('(not linked to a component)') };
      return {
        mode: 'text', node: c.content, initial: c.content, multiline: true,
        commit: (v) => { if (v.trim() !== c.content) ctx.edit(dk, [{ kind: 'elementContent', elementId: c.id, value: v.trim() }]); },
      };
    case 'who': {
      if (!c) return { mode: 'readonly', node: '' };
      const raw = ctx.speaker(dk, c.id);
      return {
        mode: 'text', node: c.who, initial: raw,
        commit: (v) => { if (v.trim() !== raw) ctx.edit(dk, [{ kind: 'attribution', elementId: c.id, field: 'speaker', value: v.trim() }]); },
      };
    }
    case 'time':
      if (!c) return { mode: 'readonly', node: '' };
      return {
        mode: 'text', node: c.time, initial: c.time,
        commit: (v) => { if (v.trim() !== c.time) ctx.edit(dk, [{ kind: 'attribution', elementId: c.id, field: 'timestamp', value: v.trim() }]); },
      };
    case 'qualifier':
      return { mode: 'readonly', node: c?.qualifier ?? '', title: c?.qualifier ? 'Edit qualifiers on the canvas' : undefined };
    case 'links':
      return { mode: 'readonly', node: c?.links ?? '' };
    case 'note':
      return { mode: 'readonly', node: c?.note ?? '', title: c?.note ? 'Edit notes in the Notes panel' : undefined };
    default:
      return moveSpecs(col.key, row, ctx) ?? { mode: 'readonly', node: '' };
  }
}

// ---- rows

interface RowProps {
  row: DataRow;
  seq: number;
  editingCol: DataColumnKey | null;
  pendingType: 'question' | 'other' | undefined;
  codebook: Codebook | null;
  actions: Omit<Ctx, 'codebook' | 'pendingType'> & {
    startEdit: (key: string, col: DataColumnKey) => void;
    /** Closes the editor; `refocus` returns keyboard focus to the cell. */
    stopEdit: (key: string, col: DataColumnKey, refocus: boolean) => void;
  };
}

const rowKey = (row: DataRow) =>
  `${row.group.diagramKey}:${row.group.key}:${row.untyped?.id ?? ''}:${row.question?.id ?? ''}:${row.other?.id ?? ''}`;

// Row windowing. A table with sticky columns re-lays out on every scroll in
// proportion to its row count, so only rows near the viewport are mounted.
// Unmeasured rows use an estimate; mounted rows are measured and remembered.
const EST_FIRST_ROW = 37; // two wrapped lines + padding + rule
const EST_CONT_ROW = 21; // continuation rows are one line
const OVERSCAN_PX = 800;
const estimate = (row: DataRow) => (row.firstOfGroup ? EST_FIRST_ROW : EST_CONT_ROW);

/** Index of the last row whose top is at or above `y`. */
function rowAt(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

const GridRow = memo(function GridRow({ row, seq, editingCol, pendingType, codebook, actions }: RowProps) {
  const ctx: Ctx = { ...actions, codebook, pendingType };
  const key = rowKey(row);
  const continuation = !row.firstOfGroup;
  const rule = row.firstOfEpisode ? RULE_EPISODE : row.firstOfGroup ? RULE_GROUP : RULE_ROW;

  return (
    <tr data-key={key}>
      {VISIBLE.map((col) => {
        const spec = specFor(col, row, seq, ctx);
        const stop = (refocus: boolean) => actions.stopEdit(key, col.key, refocus);
        const gray = continuation && col.repeats;
        const sticky = STICKY_KEYS.includes(col.key);
        const editing = editingCol === col.key && spec.mode !== 'readonly';
        const editable = spec.mode !== 'readonly';
        const style: CSSProperties = {
          borderTop: `1px solid ${rule}`,
          borderRight: `1px solid ${col.key === 'episode' ? RULE_GROUP : GRIDLINE}`,
          color: gray ? REPEAT_GRAY : undefined,
          whiteSpace: gray ? 'nowrap' : 'pre-wrap',
          overflow: 'hidden',
          textOverflow: gray ? 'ellipsis' : undefined,
          overflowWrap: 'anywhere',
          background: '#FFFFFF',
          ...(sticky ? { position: 'sticky', left: col.key === 'seq' ? 0 : 'var(--seq-w)', zIndex: 1 } : {}),
          ...(col.key === 'seq' ? { color: '#808080', textAlign: 'right' } : {}),
        };
        let body: ReactNode = spec.node;
        if (editing && spec.mode === 'text') {
          body = (
            <>
              <TextEditor
                initial={spec.initial}
                multiline={spec.multiline}
                onCommit={(v, via) => { stop(via === 'enter'); spec.commit(v, via); }}
                onCancel={() => stop(true)}
              />
              {spec.aside && <div className="text-[11px]" style={{ color: '#808080' }}>{spec.aside}</div>}
            </>
          );
        } else if (editing && spec.mode === 'select') {
          body = (
            <SelectEditor
              value={spec.value}
              options={spec.options}
              onCommit={(v) => { stop(true); spec.commit(v); }}
              onDismiss={(reason) => { stop(reason === 'escape'); spec.dismiss?.(reason); }}
            />
          );
        } else if (spec.open) {
          body = (
            <div className="flex items-start">
              <div className="min-w-0 flex-1" style={gray ? { overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}>{spec.node}</div>
              <OpenButton onOpen={spec.open} label="Select on the canvas" />
            </div>
          );
        }
        return (
          <td
            key={col.key}
            data-cell={`${key}|${col.key}`}
            style={style}
            title={spec.title}
            tabIndex={editable && !editing ? 0 : undefined}
            className={`px-1! py-0.5! align-top text-[12px] leading-[16px] ${editable && !editing ? 'cursor-text hover:bg-[var(--hover)]! focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]' : ''}`}
            onClick={editable && !editing ? () => actions.startEdit(key, col.key) : undefined}
            onKeyDown={
              editable && !editing
                ? (e) => {
                    if (e.key === 'Enter' || e.key === 'F2') {
                      e.preventDefault();
                      actions.startEdit(key, col.key);
                    }
                  }
                : undefined
            }
          >
            {body}
          </td>
        );
      })}
    </tr>
  );
});

// ---- grid

export interface DataGridProps {
  rows: DataRow[];
  /** Original row number (#) for each row, aligned with `rows`. */
  seqs: number[];
  codebook: Codebook | null;
  onEdit: (diagramKey: string, edits: CellEdit[]) => void;
  onOpen: (diagramId: number | null, elementId: string) => void;
  /** Raw attribution speaker (the grid shows it without a "Student-" prefix). */
  speaker: (diagramKey: string, elementId: string) => string;
}

export function DataGrid({ rows, seqs, codebook, onEdit, onOpen, speaker }: DataGridProps) {
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths);
  // The open editor is tracked by row identity, never by index, so rows
  // shifting under it (live edits, reload, filters) can't retarget it.
  const [editing, setEditing] = useState<{ key: string; col: DataColumnKey } | null>(null);
  const [pending, setPendingState] = useState<Record<string, 'question' | 'other'>>({});
  const drag = useRef<{ key: string; startX: number; startW: number; w: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tbody = useRef<HTMLTableSectionElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const indexByKey = useMemo(() => new Map(rows.map((r, i) => [rowKey(r), i])), [rows]);

  const offsets = useMemo(() => {
    const out = new Array<number>(rows.length + 1);
    out[0] = 0;
    for (let i = 0; i < rows.length; i++) out[i + 1] = out[i] + (heights.get(rowKey(rows[i])) ?? estimate(rows[i]));
    return out;
  }, [rows, heights]);

  // The overscan also covers the header's height above the first row.
  const start = rowAt(offsets, Math.max(0, scrollTop - OVERSCAN_PX));
  const end = Math.min(rows.length, rowAt(offsets, scrollTop + viewportH + OVERSCAN_PX) + 1);
  // Keep the row being edited mounted so its editor survives a scroll.
  const editRow = editing ? (indexByKey.get(editing.key) ?? null) : null;
  // The edited row is gone (deleted, filtered out): close the editor without
  // committing anything. Setting state during render is React's documented
  // way to adjust state to new props.
  if (editing && editRow === null) setEditing(null);

  // Measure what mounted; a changed height re-runs the window math once.
  // Runs after every render on purpose (any render can mount rows or change
  // widths); it settles because it only sets state when a height changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const body = tbody.current;
    if (!body) return;
    let next: Map<string, number> | null = null;
    for (const tr of body.querySelectorAll<HTMLTableRowElement>('tr[data-key]')) {
      const k = tr.dataset.key!;
      const h = tr.getBoundingClientRect().height;
      if (Math.abs((heights.get(k) ?? -1) - h) > 0.5) {
        next ??= new Map(heights);
        next.set(k, h);
      }
    }
    if (next) setHeights(next);
  });

  const widthOf = useCallback((c: DataColumn) => widths[c.key] ?? toPx(c.width), [widths]);
  const totalWidth = VISIBLE.reduce((n, c) => n + widthOf(c), 0);

  const setPending = useCallback((moveId: string, type: 'question' | 'other' | null) => {
    setPendingState((p) => {
      const next = { ...p };
      if (type) next[moveId] = type;
      else delete next[moveId];
      return next;
    });
  }, []);

  const actions = useMemo<RowProps['actions']>(
    () => ({
      edit: onEdit,
      open: onOpen,
      speaker,
      setPending,
      editKind: (key) => setEditing({ key, col: 'untyped_kind' }),
      startEdit: (key, col) => setEditing({ key, col }),
      stopEdit: (key, col, refocus) => {
        // Only close the editor that asked; a Type pick may already have opened Kind.
        setEditing((cur) => (cur && cur.key === key && cur.col === col ? null : cur));
        if (!refocus) return;
        requestAnimationFrame(() => {
          const active = document.activeElement;
          // Another editor took focus (Type → Kind); leave it there.
          if (active && scroller.current?.contains(active) && active.matches('input, textarea, select')) return;
          scroller.current
            ?.querySelector<HTMLElement>(`td[data-cell="${CSS.escape(`${key}|${col}`)}"]`)
            ?.focus({ preventScroll: true });
        });
      },
    }),
    [onEdit, onOpen, speaker, setPending],
  );

  // Row 1: one cell per run of a column group; the frozen columns get their own cells.
  const groupCells = useMemo(() => {
    const cells: { group: DataColumnGroup; cols: DataColumn[]; label: string }[] = [];
    for (const col of VISIBLE) {
      const last = cells[cells.length - 1];
      const breakHere = !last || last.group !== col.group || STICKY_KEYS.includes(col.key) || STICKY_KEYS.includes(last.cols[0].key);
      if (breakHere) cells.push({ group: col.group, cols: [col], label: last && last.group === col.group ? '' : col.group });
      else last.cols.push(col);
    }
    return cells;
  }, []);

  const onResizeStart = (e: React.PointerEvent, col: DataColumn) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { key: col.key, startX: e.clientX, startW: widthOf(col), w: widthOf(col) };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.max(MIN_WIDTH, Math.round(d.startW + e.clientX - d.startX));
    d.w = w;
    setWidths((prev) => (prev[d.key] === w ? prev : { ...prev, [d.key]: w }));
  };
  const onResizeEnd = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    saveWidths({ ...widths, [d.key]: d.w });
  };

  const seqW = widthOf(VISIBLE[0]);
  const stickyLeft = (key: DataColumnKey) => (key === 'seq' ? 0 : seqW);

  const renderRow = (i: number) => (
    <GridRow
      key={rowKey(rows[i])}
      row={rows[i]}
      seq={seqs[i]}
      editingCol={editRow === i ? editing!.col : null}
      pendingType={rows[i].untyped ? pending[rows[i].untyped!.id] : undefined}
      codebook={codebook}
      actions={actions}
    />
  );
  const spacer = (h: number, key: string) =>
    h > 0 ? <tr key={key} aria-hidden="true" style={{ height: h }}><td colSpan={VISIBLE.length} /></tr> : null;
  const before = editRow !== null && editRow < start ? editRow : null;
  const after = editRow !== null && editRow >= end ? editRow : null;

  return (
    <div ref={scroller} className="h-full overflow-auto" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
    <table
      className="border-separate text-[var(--text)]"
      style={{ tableLayout: 'fixed', width: totalWidth, borderSpacing: 0, ['--seq-w' as string]: `${seqW}px` }}
    >
      <colgroup>
        {VISIBLE.map((c) => <col key={c.key} style={{ width: widthOf(c) }} />)}
      </colgroup>
      <thead>
        <tr style={{ height: HEADER_ROW1_H }}>
          {groupCells.map((cell) => {
            const sticky = STICKY_KEYS.includes(cell.cols[0].key);
            return (
              <th
                key={cell.cols[0].key}
                colSpan={cell.cols.length}
                className="px-1! text-left text-[12px] font-bold whitespace-nowrap"
                style={{
                  background: GROUPFILL[cell.group],
                  position: 'sticky',
                  top: 0,
                  zIndex: sticky ? 4 : 3,
                  ...(sticky ? { left: stickyLeft(cell.cols[0].key) } : {}),
                  height: HEADER_ROW1_H,
                }}
              >
                {cell.label}
              </th>
            );
          })}
        </tr>
        <tr>
          {VISIBLE.map((col) => {
            const sticky = STICKY_KEYS.includes(col.key);
            return (
              <th
                key={col.key}
                className="relative px-1! pb-0.5! text-left align-bottom text-[12px] font-bold leading-[15px]"
                style={{
                  background: GROUPFILL[col.group],
                  position: 'sticky',
                  top: HEADER_ROW1_H,
                  zIndex: sticky ? 4 : 3,
                  ...(sticky ? { left: stickyLeft(col.key) } : {}),
                  borderBottom: `1px solid ${RULE_GROUP}`,
                  borderRight: `1px solid ${col.key === 'episode' ? RULE_GROUP : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                {col.header}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${col.header}`}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent)]/40"
                  onPointerDown={(e) => onResizeStart(e, col)}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                  onPointerCancel={onResizeEnd}
                  onDoubleClick={() => {
                    const next = { ...widths };
                    delete next[col.key];
                    setWidths(next);
                    saveWidths(next);
                  }}
                />
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody ref={tbody}>
        {before !== null && renderRow(before)}
        {spacer(offsets[start] - (before !== null ? offsets[before + 1] - offsets[before] : 0), 'top')}
        {Array.from({ length: end - start }, (_, j) => renderRow(start + j))}
        {spacer(offsets[rows.length] - offsets[end] - (after !== null ? offsets[after + 1] - offsets[after] : 0), 'bottom')}
        {after !== null && renderRow(after)}
      </tbody>
    </table>
    </div>
  );
}
