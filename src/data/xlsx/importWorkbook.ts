// Import (spec §6.2): read a workbook made by Export all, then plan which
// cells to write. Rows are matched by their hidden IDs, never by position;
// only cells that differ from the value recorded at export are written, and a
// cell the diagram also changed since the export is a conflict, not a write.
import type { CellValue, Worksheet } from 'exceljs';
import type { LiveDoc } from '../../live/ops';
import type { CellEdit } from '../edits';
import type { Codebook, DataColumnKey, KindType, MoveSlot } from '../types';
import { DATA_COLUMNS } from '../columns';
import { clipSuggestion } from '../buildRows';
import { findKindByLabel, resolveKind } from '../codebook';
import {
  DATA_SHEET, EPISODE_FIELDS, FIRST_DATA_ROW, META_FIRST_KEY_ROW, META_FORMAT, META_MAGIC, META_SHEET,
  SLOT_COLUMNS, TYPE_LABEL, loadExcelJS, metaKey, type EpisodeField,
} from './exportWorkbook';

export class NotAnExportError extends Error {
  constructor(message = 'This file wasn’t made by Export all in ETD, so it can’t be imported.') {
    super(message);
    this.name = 'NotAnExportError';
  }
}

export type SheetTarget =
  | { kind: 'episode'; field: EpisodeField }
  | { kind: 'moveType'; moveId: string }
  | { kind: 'moveKind'; moveId: string; slot: MoveSlot };

export interface SheetCell {
  row: number;
  diagramId: number;
  target: SheetTarget;
  value: string;
  /** The cell holds something that isn't text (a date, an error). */
  invalid?: true;
}

export interface ReadWorkbook {
  groupId: number;
  exportedAt: string;
  originals: Map<string, { value: string; label?: string }>;
  cells: SheetCell[];
  /** Rows with content but no diagram id (added in Excel). */
  rowsWithoutIds: number[];
  /** A Type or Kind typed on a row that has no move in that group. */
  cellsWithoutIds: { row: number; column: string; value: string }[];
}

export type SkipReason =
  | 'diagramMissing' | 'moveDeleted' | 'kindNotInCodebook' | 'kindWrongType' | 'kindOnUntypedMove'
  | 'rowWithoutIds' | 'conflictingEpisodeValues' | 'invalidValue';

export interface ImportChange { diagramId: number; edit: CellEdit; describe: string; dependsOn?: string }
export interface ImportConflict {
  key: string;
  diagramId: number;
  describe: string;
  sheet: CellEdit;
  diagramValue: string;
  /** A Kind applied after a retype only applies if that retype does. */
  dependsOn?: string;
}
export interface ImportSkip { row: number; reason: SkipReason; describe: string }

export interface ImportPlan {
  changes: ImportChange[];
  conflicts: ImportConflict[];
  skipped: ImportSkip[];
  summary: { movesRecoded: number; diagrams: number; episodeFields: number };
}

// ---------------------------------------------------------------- reading

function cellText(v: CellValue): { text: string; invalid?: true } {
  if (v === null || v === undefined) return { text: '' };
  if (typeof v === 'string') return { text: v.trim() };
  if (typeof v === 'number' || typeof v === 'boolean') return { text: String(v) };
  if (v instanceof Date) return { text: v.toISOString(), invalid: true };
  if (typeof v === 'object') {
    if ('richText' in v) return { text: v.richText.map((t) => t.text).join('').trim() };
    if ('error' in v) return { text: String(v.error), invalid: true };
    if ('formula' in v || 'sharedFormula' in v) {
      const res = (v as { result?: unknown }).result;
      return res === undefined || res === null || typeof res === 'object' ? { text: '' } : { text: String(res).trim() };
    }
    if ('text' in v) return cellText((v as { text: CellValue }).text);
  }
  return { text: String(v), invalid: true };
}

/** Columns by group + header, so an inserted or moved column doesn't misread. */
function locateColumns(ws: Worksheet): Map<DataColumnKey, number> {
  const want = new Map(DATA_COLUMNS.map((c) => [`${c.group}|${c.header}`, c.key]));
  const found = new Map<DataColumnKey, number>();
  let group = '';
  for (let j = 1; j <= ws.columnCount; j++) {
    const g = cellText(ws.getCell(1, j).value).text;
    if (g) group = g;
    const h = cellText(ws.getCell(2, j).value).text;
    // Ungrouped columns (#, Links to, Note) have a blank group label.
    const key = want.get(`${group}|${h}`) ?? want.get(`|${h}`);
    if (key && !found.has(key)) found.set(key, j);
  }
  const needed: DataColumnKey[] = [
    ...EPISODE_FIELDS, 'untyped_type', 'untyped_kind', 'question_kind', 'other_kind',
    'move_id_untyped', 'move_id_question', 'move_id_other', 'diagram_id',
  ];
  const missing = needed.filter((k) => !found.has(k));
  if (missing.length) {
    const names = missing.map((k) => DATA_COLUMNS.find((c) => c.key === k)!).map((c) => `${c.group} ${c.header}`.trim());
    throw new Error(`The Data sheet is missing columns import needs: ${names.join(', ')}. Export again and code in the new file.`);
  }
  return found;
}

export async function readExportWorkbook(buf: ArrayBuffer): Promise<ReadWorkbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new NotAnExportError('This file isn’t an Excel workbook (.xlsx), so it can’t be imported.');
  }
  const meta = wb.getWorksheet(META_SHEET);
  if (!meta || cellText(meta.getCell('A1').value).text !== META_MAGIC) throw new NotAnExportError();
  if (Number(cellText(meta.getCell('B1').value).text) !== META_FORMAT) {
    throw new NotAnExportError('This export was made by a different version of ETD and can’t be imported here.');
  }
  const groupId = Number(cellText(meta.getCell('B2').value).text);
  const exportedAt = cellText(meta.getCell('B3').value).text;
  const originals = new Map<string, { value: string; label?: string }>();
  for (let r = META_FIRST_KEY_ROW; r <= meta.rowCount; r++) {
    const key = cellText(meta.getCell(r, 1).value).text;
    if (!key) continue;
    const entry: { value: string; label?: string } = { value: cellText(meta.getCell(r, 2).value).text };
    const label = meta.getCell(r, 3).value;
    if (label !== null && label !== undefined) entry.label = cellText(label).text;
    else if (key.endsWith(':kind')) entry.label = '';
    originals.set(key, entry);
  }

  const ws = wb.getWorksheet(DATA_SHEET);
  if (!ws) throw new Error('The workbook has no Data sheet.');
  const col = locateColumns(ws);
  const at = (r: number, key: DataColumnKey) => cellText(ws.getCell(r, col.get(key)!).value);

  const cells: SheetCell[] = [];
  const rowsWithoutIds: number[] = [];
  const cellsWithoutIds: ReadWorkbook['cellsWithoutIds'] = [];
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const idText = at(r, 'diagram_id').text;
    const diagramId = Number(idText);
    if (!idText || !Number.isInteger(diagramId)) {
      const row = ws.getRow(r);
      let hasContent = false;
      row.eachCell((c) => { if (cellText(c.value).text) hasContent = true; });
      if (hasContent) rowsWithoutIds.push(r);
      continue;
    }
    const push = (target: SheetTarget, key: DataColumnKey) => {
      const { text, invalid } = at(r, key);
      cells.push({ row: r, diagramId, target, value: text, ...(invalid ? { invalid } : {}) });
    };
    for (const field of EPISODE_FIELDS) push({ kind: 'episode', field }, field);
    for (const slot of ['untyped', 'question', 'other'] as const) {
      const moveId = at(r, SLOT_COLUMNS[slot].id).text;
      const kindKey = SLOT_COLUMNS[slot].kind;
      const typed: DataColumnKey[] = slot === 'untyped' ? ['untyped_type', kindKey] : [kindKey];
      if (!moveId) {
        for (const k of typed) {
          const v = at(r, k).text;
          if (v) {
            const c = DATA_COLUMNS.find((x) => x.key === k)!;
            cellsWithoutIds.push({ row: r, column: `${c.group} ${c.header}`, value: v });
          }
        }
        continue;
      }
      if (slot === 'untyped') push({ kind: 'moveType', moveId }, 'untyped_type');
      push({ kind: 'moveKind', moveId, slot }, kindKey);
    }
  }
  return { groupId, exportedAt, originals, cells, rowsWithoutIds, cellsWithoutIds };
}

// ---------------------------------------------------------------- planning

type SupportType = 'action' | 'question' | 'other';
type El = LiveDoc['elements'][number];

const norm = (s: string) => s.trim().toLowerCase();
const asSupportType = (v: unknown): SupportType => (v === 'question' || v === 'other' ? v : 'action');
const typeDisplay = (t: SupportType) => (t === 'action' ? 'Action (untyped)' : TYPE_LABEL[t]);
const shown = (v: string) => (v === '' ? '(blank)' : `“${v}”`);

/** Sheet text → stored value, or null when the text isn't allowed in that cell. */
function normalizeEpisode(field: EpisodeField, v: string): string | null {
  if (field === 'status') {
    const s = norm(v);
    return s === '' || s === 'vetted' || s === 'not vetted' ? s : null;
  }
  if (field === 'sgwc') {
    const s = v.trim().toUpperCase();
    return s === '' || s === 'SG' || s === 'WC' ? s : null;
  }
  return v.trim();
}

function normalizeType(v: string): SupportType | null {
  const s = norm(v);
  if (s === '') return 'action';
  return s === 'question' || s === 'other' ? s : null;
}

const FIELD_LABEL: Record<EpisodeField, string> = { clip: 'Clip', status: 'Status', sgwc: 'SG/WC', discipline: 'Discipline' };

export function planImport(read: ReadWorkbook, current: Map<number, LiveDoc | null>, cb: Codebook): ImportPlan {
  const changes: ImportChange[] = [];
  const conflicts: ImportConflict[] = [];
  const skipped: ImportSkip[] = [];
  const skip = (row: number, reason: SkipReason, describe: string) => skipped.push({ row, reason, describe });

  for (const r of read.rowsWithoutIds) skip(r, 'rowWithoutIds', `Row ${r} has no hidden IDs (was it added in Excel?), so it can’t be matched to a diagram.`);
  for (const c of read.cellsWithoutIds) {
    skip(c.row, 'rowWithoutIds', `Row ${c.row}: ${c.column} ${shown(c.value)} is on a row with no move in that group.`);
  }

  const docOf = (id: number) => current.get(id) ?? null;
  const diagramName = (id: number) => {
    const n = docOf(id)?.name;
    return typeof n === 'string' && n ? n : `Diagram ${id}`;
  };
  const moveOf = (doc: LiveDoc, id: string): El | undefined =>
    doc.elements.find((e) => e.id === id && e.type === 'support');
  const moveName = (el: El | undefined, fallback: string) => {
    if (!el) return fallback;
    const text = String(el.content ?? '').trim();
    return `“${text.length > 60 ? `${text.slice(0, 57)}…` : text}”`;
  };
  const kindName = (id: string) => (id === '' ? '' : resolveKind(cb, id).label);

  // Group cells by the field they write.
  const byKey = new Map<string, SheetCell[]>();
  const keyOf = (c: SheetCell) =>
    c.target.kind === 'episode' ? metaKey.episode(c.diagramId, c.target.field)
      : c.target.kind === 'moveType' ? metaKey.moveType(c.diagramId, c.target.moveId)
        : metaKey.moveKind(c.diagramId, c.target.moveId);
  for (const c of read.cells) {
    const k = keyOf(c);
    const list = byKey.get(k);
    if (list) list.push(c);
    else byKey.set(k, [c]);
  }

  /** The one changed value of a field, or null (unchanged, invalid, or disagreeing rows: each reported). */
  function reduce(
    key: string,
    cells: SheetCell[],
    normalize: (v: string) => string | null,
    unchanged: (v: string, orig: { value: string; label?: string }) => boolean,
    where: (c: SheetCell) => string,
    disagree: SkipReason,
  ): { value: string; cell: SheetCell; original: { value: string; label?: string } } | null {
    const original = read.originals.get(key);
    const changed = new Map<string, SheetCell[]>();
    for (const c of cells) {
      if (!original) {
        if (c.value) skip(c.row, 'invalidValue', `Row ${c.row}: ${where(c)} isn’t in the exported data, so ${shown(c.value)} wasn’t applied.`);
        continue;
      }
      if (c.invalid) {
        skip(c.row, 'invalidValue', `Row ${c.row}: ${where(c)} must be text; it holds ${shown(c.value)}.`);
        continue;
      }
      const v = normalize(c.value);
      if (v === null) {
        skip(c.row, 'invalidValue', `Row ${c.row}: ${where(c)} can’t be ${shown(c.value)}.`);
        continue;
      }
      if (unchanged(v, original)) continue;
      const k = disagree === 'conflictingEpisodeValues' ? v : norm(v);
      changed.set(k, [...(changed.get(k) ?? []), c]);
    }
    if (!original || changed.size === 0) return null;
    if (changed.size > 1) {
      const all = [...changed.values()].flat().sort((a, b) => a.row - b.row);
      skip(all[0].row, disagree,
        `${where(all[0])} was changed to different values on rows ${all.map((c) => c.row).join(', ')} (${[...changed.values()].map((cs) => shown(cs[0].value)).join(', ')}), so none was applied.`);
      return null;
    }
    const [cs] = [...changed.values()];
    return { value: normalize(cs[0].value)!, cell: cs[0], original };
  }

  // ---- move types first: a Kind on the same row depends on the chosen Type.
  const typeOutcome = new Map<string, { target: SupportType; dependsOn?: string }>();
  for (const [key, cells] of byKey) {
    const t = cells[0].target;
    if (t.kind !== 'moveType') continue;
    const d = cells[0].diagramId;
    const doc = docOf(d);
    const el = doc ? moveOf(doc, t.moveId) : undefined;
    const where = () => `${diagramName(d)} · move ${moveName(el, t.moveId)} Type`;
    const got = reduce(key, cells, normalizeType, (v, o) => v === o.value, where, 'invalidValue');
    if (!got) continue;
    const row = got.cell.row;
    const sheet = got.value as SupportType;
    if (!doc) { skip(row, 'diagramMissing', `Row ${row}: ${diagramName(d)} is no longer in this group.`); continue; }
    if (!el) { skip(row, 'moveDeleted', `Row ${row}: the move was deleted from ${diagramName(d)} since the export.`); continue; }
    if (sheet === 'action') { skip(row, 'invalidValue', `Row ${row}: ${where()} can only be set to Question or Other.`); continue; }
    const cur = asSupportType(el.supportType);
    const edit: CellEdit = { kind: 'moveType', moveId: t.moveId, supportType: sheet };
    const describe = `${diagramName(d)} · move ${moveName(el, t.moveId)} → Type ${TYPE_LABEL[sheet]}`;
    if (cur === sheet) { typeOutcome.set(key, { target: sheet }); continue; }
    if (cur !== got.original.value) {
      conflicts.push({ key, diagramId: d, describe, sheet: edit, diagramValue: typeDisplay(cur) });
      typeOutcome.set(key, { target: sheet, dependsOn: key });
    } else {
      changes.push({ diagramId: d, edit, describe });
      typeOutcome.set(key, { target: sheet });
    }
  }

  // ---- kinds and episode fields
  for (const [key, cells] of byKey) {
    const t = cells[0].target;
    const d = cells[0].diagramId;
    const doc = docOf(d);

    if (t.kind === 'moveKind') {
      const el = doc ? moveOf(doc, t.moveId) : undefined;
      const where = () => `${diagramName(d)} · move ${moveName(el, t.moveId)} Kind`;
      // A kind compares by label, so a rename in the codebook after export is not a change.
      const got = reduce(key, cells, (v) => v.trim(), (v, o) => norm(v) === norm(o.label ?? ''), where, 'invalidValue');
      if (!got) continue;
      const row = got.cell.row;
      const slot = (got.cell.target as { slot: MoveSlot }).slot;
      if (!doc) { skip(row, 'diagramMissing', `Row ${row}: ${diagramName(d)} is no longer in this group.`); continue; }
      if (!el) { skip(row, 'moveDeleted', `Row ${row}: the move was deleted from ${diagramName(d)} since the export.`); continue; }
      const cur = asSupportType(el.supportType);
      let type: SupportType;
      let dependsOn: string | undefined;
      if (slot === 'untyped') {
        const o = typeOutcome.get(metaKey.moveType(d, t.moveId));
        type = o?.target ?? cur;
        dependsOn = o?.dependsOn;
      } else {
        type = slot;
        if (cur !== slot) {
          skip(row, 'kindWrongType', `Row ${row}: ${where()} ${shown(got.value)} wasn’t applied: the move is now typed ${typeDisplay(cur)} in the diagram.`);
          continue;
        }
      }
      if (type === 'action') {
        skip(row, 'kindOnUntypedMove', `Row ${row}: ${where()} ${shown(got.value)} needs a Type (Question or Other) first; the move is still untyped.`);
        continue;
      }
      let kindId: string | null = null;
      if (got.value !== '') {
        const k = findKindByLabel(cb, got.value, type as KindType);
        if (!k) {
          const other = findKindByLabel(cb, got.value);
          if (other) skip(row, 'kindWrongType', `Row ${row}: ${where()} ${shown(got.value)} is a ${TYPE_LABEL[other.type]} kind, but the move is typed ${TYPE_LABEL[type]}.`);
          else skip(row, 'kindNotInCodebook', `Row ${row}: ${where()} ${shown(got.value)} is not in the codebook.`);
          continue;
        }
        if (k.status === 'retired') {
          skip(row, 'kindNotInCodebook', `Row ${row}: ${where()} ${shown(got.value)} is retired in the codebook.`);
          continue;
        }
        kindId = k.id;
      }
      const curId = typeof el.subtype === 'string' && el.subtype ? resolveKind(cb, el.subtype).id : '';
      const retyping = type !== cur; // the retype clears the kind, so it must be set again
      if (!retyping && (kindId ?? '') === curId) continue;
      const edit: CellEdit = { kind: 'moveKind', moveId: t.moveId, kindId };
      const label = kindId === null ? '(blank)' : `“${resolveKind(cb, kindId).label}”`;
      const describe = `${diagramName(d)} · move ${moveName(el, t.moveId)} → Kind ${label}`;
      const extra = dependsOn ? { dependsOn } : {};
      // Re-resolve the export-time id too, so a merge since the export isn't a conflict.
      const origId = got.original.value ? resolveKind(cb, got.original.value).id : '';
      if (curId !== origId) {
        conflicts.push({ key, diagramId: d, describe, sheet: edit, diagramValue: kindName(curId) || '(blank)', ...extra });
      } else {
        changes.push({ diagramId: d, edit, describe, ...extra });
      }
      continue;
    }

    if (t.kind === 'episode') {
      const field = t.field;
      const where = () => `${diagramName(d)} · ${FIELD_LABEL[field]}`;
      const got = reduce(key, cells, (v) => normalizeEpisode(field, v), (v, o) => v === o.value, where, 'conflictingEpisodeValues');
      if (!got) continue;
      const row = got.cell.row;
      if (!doc) { skip(row, 'diagramMissing', `Row ${row}: ${diagramName(d)} is no longer in this group.`); continue; }
      const stored = String(doc.episode?.[field] ?? '');
      if (got.value === stored) continue;
      // Clip's exported value was the suggestion when blank; compare like with like.
      const now = field === 'clip' ? stored || clipSuggestion(doc) || '' : stored;
      const edit: CellEdit = { kind: 'episode', field, value: got.value === '' ? null : got.value };
      const describe = `${where()} → ${got.value === '' ? '(blank)' : got.value}`;
      if (now !== got.original.value) {
        conflicts.push({ key, diagramId: d, describe, sheet: edit, diagramValue: now || '(blank)' });
      } else {
        changes.push({ diagramId: d, edit, describe });
      }
    }
  }

  skipped.sort((a, b) => a.row - b.row);
  const plan: ImportPlan = { changes, conflicts, skipped, summary: { movesRecoded: 0, diagrams: 0, episodeFields: 0 } };
  // Plain changes only; conflicts count once a choice is made (see summarizeEdits).
  plan.summary = summarizeEdits(planToEdits(plan, () => 'diagram'));
  return plan;
}

/** Counts for what will actually be written. */
export function summarizeEdits(edits: Map<number, CellEdit[]>): ImportPlan['summary'] {
  const moves = new Set<string>();
  let episodeFields = 0;
  for (const [d, list] of edits) {
    for (const e of list) {
      if (e.kind === 'episode') episodeFields++;
      else if (e.kind === 'moveType' || e.kind === 'moveKind') moves.add(`${d}:${e.moveId}`);
    }
  }
  return { movesRecoded: moves.size, diagrams: [...edits.values()].filter((l) => l.length > 0).length, episodeFields };
}

/** True when a re-plan against fresher diagrams would write or ask something the
 *  user didn't review: any change, conflict (incl. the diagram's value), or skip differs.
 *  Descriptions are ignored (a diagram rename alone isn't material). */
export function plansDiffer(a: ImportPlan, b: ImportPlan): boolean {
  const sig = (p: ImportPlan) => JSON.stringify({
    changes: p.changes.map((c) => [c.diagramId, c.edit, c.dependsOn ?? null]),
    conflicts: p.conflicts.map((c) => [c.key, c.diagramId, c.sheet, c.diagramValue, c.dependsOn ?? null]),
    skipped: p.skipped.map((s) => [s.row, s.reason]),
  });
  return sig(a) !== sig(b);
}

const RANK: Partial<Record<CellEdit['kind'], number>> = { episode: 0, moveType: 1, moveKind: 2 };

/** The edits to write per diagram. Within a move, moveType comes before moveKind. */
export function planToEdits(plan: ImportPlan, choose: (conflictKey: string) => 'diagram' | 'sheet'): Map<number, CellEdit[]> {
  const out = new Map<number, CellEdit[]>();
  const add = (d: number, e: CellEdit) => out.set(d, [...(out.get(d) ?? []), e]);
  const follows = (dep?: string) => dep === undefined || choose(dep) === 'sheet';
  for (const c of plan.changes) if (follows(c.dependsOn)) add(c.diagramId, c.edit);
  for (const c of plan.conflicts) if (choose(c.key) === 'sheet' && follows(c.dependsOn)) add(c.diagramId, c.sheet);
  for (const list of out.values()) list.sort((a, b) => (RANK[a.kind] ?? 0) - (RANK[b.kind] ?? 0));
  return out;
}
