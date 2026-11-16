// Export all (spec §6.1): the Data sheet in the approved layout, the Codebook
// sheet with the defined names its dropdowns and formulas use, and a
// veryHidden `_etd` sheet holding what import needs to tell what a coder
// changed. Mirrors docs/superpowers/specs/2026-11-16-data-view/sample_generator.py.
import type { Workbook, Worksheet, Style } from 'exceljs';
import { DATA_COLUMNS, type DataColumnGroup } from '../columns';
import { toRows } from '../buildRows';
import type { Codebook, CodebookKind, ComponentGroup, DataColumnKey, DataRow, MoveCell, MoveSlot } from '../types';
import type { EpisodeFields } from '../../types/episode';

export const DATA_SHEET = 'Data';
export const CODEBOOK_SHEET = 'Codebook';
export const META_SHEET = '_etd';
export const META_MAGIC = 'etd-data-export';
export const META_FORMAT = 1;
/** First row of `key | originalValue | originalLabel` entries in `_etd`. */
export const META_FIRST_KEY_ROW = 5;
export const FIRST_DATA_ROW = 3;

export const EPISODE_FIELDS = ['clip', 'status', 'sgwc', 'discipline'] as const satisfies readonly (keyof EpisodeFields)[];
export type EpisodeField = (typeof EPISODE_FIELDS)[number];

export const metaKey = {
  version: (diagramId: number) => `diagram:${diagramId}:version`,
  episode: (diagramId: number, field: EpisodeField) => `episode:${diagramId}:${field}`,
  moveType: (diagramId: number, moveId: string) => `move:${diagramId}:${moveId}:type`,
  moveKind: (diagramId: number, moveId: string) => `move:${diagramId}:${moveId}:kind`,
};

/** exceljs only through a dynamic import, so it lands in its own chunk. */
export async function loadExcelJS(): Promise<typeof import('exceljs')> {
  const mod = (await import('exceljs')) as typeof import('exceljs') & { default?: typeof import('exceljs') };
  return mod.default ?? mod;
}

/** 1-based column number of a DATA_COLUMNS key. */
export function colNumber(key: DataColumnKey): number {
  const i = DATA_COLUMNS.findIndex((c) => c.key === key);
  if (i === -1) throw new Error(`unknown column ${key}`);
  return i + 1;
}

export function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const L = (key: DataColumnKey) => colLetter(colNumber(key));

const GROUP_FILL: Record<DataColumnGroup, string> = {
  Episode: 'D9D9D9',
  Component: 'FCE4D6',
  'First pass (untyped)': 'EDEDED',
  Question: 'DDEBF7',
  Other: 'FFF2CC',
  IDs: 'F2F2F2',
  '': 'FFFFFF',
};

const argb = (rgb: string) => `FF${rgb}`;
// exceljs writes only the font parts given; name them, or viewers fall back to a serif.
const FONT = { name: 'Calibri', family: 2, size: 11 } as const;
const solid = (rgb: string): Style['fill'] => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(rgb) } });

export const TYPE_LABEL = { question: 'Question', other: 'Other' } as const;
export const UNLINKED_PART = '—';
export const UNLINKED_CONTENT = '(not linked to a component)';
const NOT_IN_CODEBOOK = '? not in codebook';

export function exportFileName(groupName: string, date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `ETD data – ${groupName} – ${ymd}.xlsx`;
}

const MOVE_COLS: Record<MoveSlot, { move: DataColumnKey; by: DataColumnKey; kind: DataColumnKey; category: DataColumnKey; id: DataColumnKey }> = {
  untyped: { move: 'untyped_move', by: 'untyped_by', kind: 'untyped_kind', category: 'untyped_category', id: 'move_id_untyped' },
  question: { move: 'question_move', by: 'question_by', kind: 'question_kind', category: 'question_category', id: 'move_id_question' },
  other: { move: 'other_move', by: 'other_by', kind: 'other_kind', category: 'other_category', id: 'move_id_other' },
};
export const SLOT_COLUMNS = MOVE_COLS;

const kindLabel = (m: MoveCell | undefined) => m?.kind?.label ?? '';
const kindCategory = (m: MoveCell | undefined) =>
  !m?.kind ? '' : m.kind.missing ? NOT_IN_CODEBOOK : m.kind.category;

function rowValues(row: DataRow): Partial<Record<DataColumnKey, string | number>> {
  const g = row.group;
  const c = g.component;
  const v: Partial<Record<DataColumnKey, string | number>> = {
    episode: g.episodeTitle,
    clip: g.episode.clip || g.clipSuggestion || '',
    status: g.episode.status ?? '',
    sgwc: g.episode.sgwc ?? '',
    discipline: g.episode.discipline ?? '',
    part: c ? c.part : UNLINKED_PART,
    contributor: c ? c.contributor : '',
    content: c ? c.content : UNLINKED_CONTENT,
    who: c?.who ?? '',
    time: c?.time ?? '',
    qualifier: c?.qualifier ?? '',
    links: c?.links ?? '',
    note: c?.note ?? '',
    component_id: g.key,
    first_row_of_component: row.firstOfGroup ? 1 : 0,
  };
  if (g.diagramId !== null) v.diagram_id = g.diagramId;
  for (const slot of ['untyped', 'question', 'other'] as const) {
    const m = row[slot];
    if (!m) continue;
    const k = MOVE_COLS[slot];
    v[k.move] = m.text;
    v[k.by] = m.by;
    v[k.kind] = kindLabel(m);
    v[k.id] = m.id;
  }
  return v;
}

function writeDataSheet(ws: Worksheet, rows: DataRow[]) {
  // Header rows: group label where the group changes, then column headers.
  let prev: DataColumnGroup | null = null;
  DATA_COLUMNS.forEach((col, j) => {
    const fill = solid(GROUP_FILL[col.group]);
    const c1 = ws.getCell(1, j + 1);
    if (col.group !== prev) c1.value = col.group;
    c1.fill = fill;
    c1.font = { ...FONT, bold: true };
    const c2 = ws.getCell(2, j + 1);
    c2.value = col.header;
    c2.fill = fill;
    c2.font = { ...FONT, bold: true };
    c2.alignment = { wrapText: true, vertical: 'bottom' };
    const wc = ws.getColumn(j + 1);
    wc.width = col.width;
    if (col.hidden) wc.hidden = true;
    prev = col.group;
  });

  const keyAt = DATA_COLUMNS.map((c) => c.key);
  rows.forEach((row, i) => {
    const r = FIRST_DATA_ROW + i;
    const vals = rowValues(row);
    vals.seq = i + 1;
    keyAt.forEach((key, j) => {
      const cell = ws.getCell(r, j + 1);
      const v = vals[key];
      if (v !== undefined && v !== '') cell.value = v;
      const repeatCell = DATA_COLUMNS[j].repeats && !row.firstOfGroup;
      cell.alignment = { wrapText: !repeatCell, vertical: 'top' };
    });
    // Kind/Category: Category is never stored; it is a lookup against the Codebook sheet.
    for (const slot of ['untyped', 'question', 'other'] as const) {
      const k = MOVE_COLS[slot];
      const kc = `${L(k.kind)}${r}`;
      ws.getCell(`${L(k.category)}${r}`).value = {
        formula: `IF(${kc}="","",IFERROR(VLOOKUP(${kc},CodebookTable,2,FALSE),"${NOT_IN_CODEBOOK}"))`,
        result: kindCategory(row[slot]),
      };
    }
    // A blank Clip shows the info-box suggestion, gray italic.
    if (!row.group.episode.clip && row.group.clipSuggestion) {
      ws.getCell(`${L('clip')}${r}`).font = { ...FONT, italic: true, color: { argb: 'FF808080' } };
    }
  });

  // Clip and Discipline stay text: Excel would turn a typed 74:09 into a time.
  for (const key of ['clip', 'discipline'] as const) ws.getColumn(colNumber(key)).numFmt = '@';

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2, topLeftCell: 'C3' }];
  const lastCol = colLetter(DATA_COLUMNS.length);
  const last = FIRST_DATA_ROW + rows.length - 1;
  ws.autoFilter = `A2:${lastCol}${Math.max(last, 2)}`;
  if (rows.length === 0) return;

  // Conditional formats keyed on hidden IDs, so they survive a sort.
  const C = L('component_id');
  const E = L('diagram_id');
  let priority = 1;
  if (rows.length > 1) {
    for (const col of DATA_COLUMNS) {
      if (!col.repeats) continue;
      const x = L(col.key);
      ws.addConditionalFormatting({
        ref: `${x}4:${x}${last}`,
        rules: [{ type: 'expression', priority: priority++, formulae: [`$${C}4=$${C}3`], style: { font: { color: { argb: 'FFBFBFBF' } } } }],
      });
    }
  }
  // The episode rule comes first: when both apply, the higher-priority (dark) border wins.
  ws.addConditionalFormatting({
    ref: `A3:${lastCol}${last}`,
    rules: [
      { type: 'expression', priority: priority++, formulae: [`$${E}3<>$${E}2`], style: { border: { top: { style: 'thin', color: { argb: 'FF000000' } } } } },
      { type: 'expression', priority: priority++, formulae: [`$${C}3<>$${C}2`], style: { border: { top: { style: 'thin', color: { argb: 'FFA6A6A6' } } } } },
    ],
  });

  // Dropdowns. `dataValidations` is exceljs's range-keyed model (not in its typings).
  const dvs = (ws as unknown as { dataValidations: { add(range: string, dv: object): void } }).dataValidations;
  const list = (key: DataColumnKey, formula: string, showErrorMessage = true) =>
    dvs.add(`${L(key)}${FIRST_DATA_ROW}:${L(key)}${last}`, {
      type: 'list', allowBlank: true, showErrorMessage, formulae: [formula],
    });
  list('untyped_type', '"Question,Other"');
  list('question_kind', 'QuestionKinds');
  list('other_kind', 'OtherKinds');
  list('sgwc', '"SG,WC"');
  list('status', '"vetted,not vetted"');
  list('untyped_kind', `INDIRECT(${L('untyped_type')}${FIRST_DATA_ROW}&"Kinds")`, false);
}

function writeCodebookSheet(wb: Workbook, ws: Worksheet, cb: Codebook) {
  ws.addRow(['Kind', 'Category', 'Type', 'Status']).font = { ...FONT, bold: true };
  const live = cb.kinds.filter((k) => k.mergedInto === undefined);
  const byPos = (a: CodebookKind, b: CodebookKind) => a.position - b.position;
  const active = (t: 'question' | 'other') => live.filter((k) => k.type === t && k.status === 'active').sort(byPos);
  const q = active('question');
  const o = active('other');
  const retired = live
    .filter((k) => k.status === 'retired')
    .sort((a, b) => (a.type === b.type ? byPos(a, b) : a.type === 'question' ? -1 : 1));
  for (const k of q) ws.addRow([k.label, k.category, TYPE_LABEL.question, 'active']);
  for (const k of o) ws.addRow([k.label, k.category, TYPE_LABEL.other, 'active']);
  for (const k of retired) ws.addRow([k.label, k.category, TYPE_LABEL[k.type], 'retired']);
  [22, 28, 10, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // An empty list still needs a valid range; point it at a blank cell.
  const EMPTY = `${CODEBOOK_SHEET}!$H$1`;
  const range = (from: number, count: number, toCol = 'A') =>
    count === 0 ? EMPTY : `${CODEBOOK_SHEET}!$A$${from}:$${toCol}$${from + count - 1}`;
  wb.definedNames.add(range(2, q.length + o.length + retired.length, 'C'), 'CodebookTable');
  wb.definedNames.add(range(2, q.length), 'QuestionKinds');
  wb.definedNames.add(range(2 + q.length, o.length), 'OtherKinds');
}

function writeMetaSheet(
  ws: Worksheet,
  groups: ComponentGroup[],
  meta: { groupId: number; exportedAt: string; versions: Record<number, number> },
) {
  ws.state = 'veryHidden';
  ws.getCell('A1').value = META_MAGIC;
  ws.getCell('B1').value = META_FORMAT;
  ws.getCell('A2').value = 'groupId';
  ws.getCell('B2').value = meta.groupId;
  ws.getCell('A3').value = 'exportedAt';
  ws.getCell('B3').value = meta.exportedAt;
  let r = META_FIRST_KEY_ROW;
  const put = (key: string, value: string, label?: string) => {
    ws.getCell(r, 1).value = key;
    ws.getCell(r, 2).value = value;
    if (label !== undefined) ws.getCell(r, 3).value = label;
    r++;
  };
  const seen = new Set<number>();
  for (const g of groups) {
    const id = g.diagramId;
    if (id === null) continue;
    if (!seen.has(id)) {
      seen.add(id);
      if (meta.versions[id] !== undefined) put(metaKey.version(id), String(meta.versions[id]));
      for (const f of EPISODE_FIELDS) {
        const stored = g.episode[f] ?? '';
        put(metaKey.episode(id, f), f === 'clip' ? stored || g.clipSuggestion || '' : stored);
      }
    }
    for (const slot of ['untyped', 'question', 'other'] as const) {
      for (const m of g.moves[slot]) {
        put(metaKey.moveType(id, m.id), m.supportType);
        put(metaKey.moveKind(id, m.id), m.kind?.id ?? '', kindLabel(m));
      }
    }
  }
}

export async function buildExportWorkbook(
  groups: ComponentGroup[],
  cb: Codebook,
  meta: { groupId: number; groupName: string; exportedAt: string; versions: Record<number, number> },
): Promise<Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(meta.exportedAt);
  wb.calcProperties.fullCalcOnLoad = true;
  const data = wb.addWorksheet(DATA_SHEET);
  const codebook = wb.addWorksheet(CODEBOOK_SHEET);
  const etd = wb.addWorksheet(META_SHEET);
  writeDataSheet(data, toRows(groups));
  writeCodebookSheet(wb, codebook, cb);
  writeMetaSheet(etd, groups, meta);
  return wb;
}
