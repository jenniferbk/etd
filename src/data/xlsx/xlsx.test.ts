import { beforeAll, describe, it, expect } from 'vitest';
import type { Workbook, Worksheet } from 'exceljs';
import { buildDataset } from '../buildRows';
import { DATA_COLUMNS } from '../columns';
import { editsToOps } from '../edits';
import { applyOps, type LiveDoc } from '../../live/ops';
import type { Codebook, CodebookKind, DataColumnKey, DiagramDocInput } from '../types';
import { buildExportWorkbook, colLetter, exportFileName, loadExcelJS } from './exportWorkbook';
import { NotAnExportError, planImport, planToEdits, readExportWorkbook } from './importWorkbook';

// ---- synthetic fixtures (no real diagram content)

type E = Record<string, unknown> & { id: string };
const arg = (id: string, argumentType: string, o: Record<string, unknown> = {}): E => ({
  id, type: 'argument', argumentType, contributor: 'student', label: id, content: `content ${id}`,
  position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, ...o,
});
const move = (id: string, supportType: string, assoc: string | undefined, o: Record<string, unknown> = {}): E => ({
  id, type: 'support', supportType, contributor: 'teacher', content: `move ${id}`,
  position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, ...(assoc ? { associatedWith: assoc } : {}), ...o,
});
const at = (timestamp: string) => ({ attribution: { speaker: '', timestamp } });

const kind = (o: Partial<CodebookKind> & { id: string }): CodebookKind => ({
  label: o.id, category: `cat ${o.id}`, type: 'question', status: 'active', position: 0, ...o,
});
const makeCb = (): Codebook => ({
  groupId: 7,
  kinds: [
    kind({ id: 'kq1', label: 'Clarify', category: 'Requesting clarification', position: 0 }),
    kind({ id: 'kq2', label: 'Justify', category: 'Requesting justification', position: 1 }),
    kind({ id: 'kq3', label: 'Old question', status: 'retired', position: 2 }),
    kind({ id: 'ko1', label: 'Revoice', category: 'Revoicing', type: 'other', position: 0 }),
    kind({ id: 'ko2', label: 'Praise', category: 'Evaluating', type: 'other', position: 1 }),
  ],
});

const docA = (): LiveDoc => ({
  name: 'Episode A',
  elements: [
    { id: 'info', type: 'infoBox', content: 'Clip [1:00-2:00]', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } },
    arg('c1', 'claim', at('1:10')),
    arg('d1', 'data', { contributor: 'given' }),
    move('u1', 'action', 'c1', at('1:20')),
    move('u2', 'action', 'c1', at('1:30')),
    move('qm1', 'question', 'c1', { ...at('1:15'), subtype: 'kq1' }),
    move('om1', 'other', 'd1', { subtype: 'ko1' }),
    move('loose', 'action', undefined),
  ],
  connections: [],
  notes: [],
  episode: { status: 'not vetted' },
});
const docB = (): LiveDoc => ({
  name: 'Episode B',
  elements: [
    arg('c2', 'claim'),
    move('qa', 'question', 'c2', { subtype: 'kq2' }),
    move('qb', 'question', 'c2'),
  ],
  connections: [],
  notes: [],
  episode: { clip: '3:00-4:00', sgwc: 'SG' },
});

const input = (id: number, doc: LiveDoc): DiagramDocInput =>
  ({ diagramId: id, title: doc.name, versionId: 100 + id, folderId: null, doc });

// ---- helpers

async function toArrayBuffer(wb: Workbook): Promise<ArrayBuffer> {
  // exceljs in Node hands back a Buffer; the reader takes an ArrayBuffer as in the browser.
  const buf = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function exportOf(docs: [number, LiveDoc][], cb = makeCb()): Promise<ArrayBuffer> {
  const groups = buildDataset(docs.map(([id, d]) => input(id, d)), cb);
  const wb = await buildExportWorkbook(groups, cb, {
    groupId: 7, groupName: 'Lab', exportedAt: '2026-11-16T12:00:00.000Z', versions: { 1: 101, 2: 102 },
  });
  return toArrayBuffer(wb);
}

async function loadWb(buf: ArrayBuffer): Promise<Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

const col = (key: DataColumnKey) => DATA_COLUMNS.findIndex((c) => c.key === key) + 1;

/** Row number whose `key` column holds `value`. */
function rowWhere(ws: Worksheet, key: DataColumnKey, value: string | number): number {
  for (let r = 3; r <= ws.rowCount; r++) if (ws.getCell(r, col(key)).value === value) return r;
  throw new Error(`no row with ${key} = ${value}`);
}

async function editSheet(buf: ArrayBuffer, fn: (ws: Worksheet) => void): Promise<ArrayBuffer> {
  const wb = await loadWb(buf);
  fn(wb.getWorksheet('Data')!);
  return toArrayBuffer(wb);
}

const currentOf = (docs: [number, LiveDoc | null][]) => new Map(docs);

const fresh = () => [[1, docA()], [2, docB()]] as [number, LiveDoc][];

// ---- tests

// The first exceljs load is slow in Node; keep it out of any one test's timeout.
beforeAll(async () => { await loadExcelJS(); }, 30_000);

describe('xlsx export', () => {
  it('names the file with group and date', () => {
    expect(exportFileName('Lab', new Date(2026, 10, 6))).toBe('ETD data – Lab – 2026-11-06.xlsx');
  });

  it('export round-trips with no changes', async () => {
    const read = await readExportWorkbook(await exportOf(fresh()));
    expect(read.groupId).toBe(7);
    expect(read.exportedAt).toBe('2026-11-16T12:00:00.000Z');
    const plan = planImport(read, currentOf(fresh()), makeCb());
    expect(plan.changes).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it('export has headers in spec order with Content of component in column I and hidden ID columns', async () => {
    const wb = await loadWb(await exportOf(fresh()));
    const ws = wb.getWorksheet('Data')!;
    const headers = DATA_COLUMNS.map((_, j) => ws.getCell(2, j + 1).value);
    expect(headers).toEqual(DATA_COLUMNS.map((c) => c.header));
    expect(ws.getCell('I2').value).toBe('Content of component');
    for (const [j, c] of DATA_COLUMNS.entries()) expect(!!ws.getColumn(j + 1).hidden).toBe(!!c.hidden);
    expect(ws.getCell(1, col('untyped_move')).value).toBe('First pass (untyped)');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 2, ySplit: 2, topLeftCell: 'C3' });
    // The unlinked group exports Part — and its placeholder content.
    const r = rowWhere(ws, 'component_id', 'unlinked:1');
    expect(ws.getCell(r, col('part')).value).toBe('—');
    expect(ws.getCell(r, col('content')).value).toBe('(not linked to a component)');
    // Category is a formula against the codebook.
    const qr = rowWhere(ws, 'move_id_question', 'qm1');
    const k = colLetter(col('question_kind'));
    expect(ws.getCell(qr, col('question_kind')).value).toBe('Clarify');
    expect(ws.getCell(qr, col('question_category')).value).toMatchObject({
      formula: `IF(${k}${qr}="","",IFERROR(VLOOKUP(${k}${qr},CodebookTable,2,FALSE),"? not in codebook"))`,
    });
    expect(wb.getWorksheet('_etd')!.state).toBe('veryHidden');
  });

  it('export defines QuestionKinds, OtherKinds, CodebookTable and a data validation on Kind cells', async () => {
    const wb = await loadWb(await exportOf(fresh()));
    expect(wb.definedNames.getRanges('QuestionKinds').ranges).toEqual(['Codebook!$A$2:$A$3']);
    expect(wb.definedNames.getRanges('OtherKinds').ranges).toEqual(['Codebook!$A$4:$A$5']);
    // Retired kinds sit below the active ones, still inside CodebookTable.
    expect(wb.definedNames.getRanges('CodebookTable').ranges).toEqual(['Codebook!$A$2:$C$6']);
    const cbs = wb.getWorksheet('Codebook')!;
    expect(cbs.getRow(6).values).toEqual([undefined, 'Old question', 'cat kq3', 'Question', 'retired']);
    const ws = wb.getWorksheet('Data')!;
    expect(ws.getCell(3, col('question_kind')).dataValidation).toMatchObject({ type: 'list', formulae: ['QuestionKinds'] });
    expect(ws.getCell(4, col('other_kind')).dataValidation).toMatchObject({ type: 'list', formulae: ['OtherKinds'] });
    expect(ws.getCell(3, col('untyped_kind')).dataValidation).toMatchObject({ type: 'list', formulae: [`INDIRECT(O3&"Kinds")`] });
    expect(ws.getCell(3, col('status')).dataValidation).toMatchObject({ type: 'list', formulae: ['"vetted,not vetted"'] });
  });
});

describe('xlsx import', () => {
  it('sorted sheet imports the same changes', async () => {
    const base = await exportOf(fresh());
    const edit = (ws: Worksheet) => {
      ws.getCell(rowWhere(ws, 'move_id_question', 'qm1'), col('question_kind')).value = 'Justify';
      ws.getCell(rowWhere(ws, 'move_id_other', 'om1'), col('other_kind')).value = 'Praise';
    };
    const plain = await editSheet(base, edit);
    const sorted = await editSheet(base, (ws) => {
      edit(ws);
      const last = ws.rowCount;
      const rows: unknown[][] = [];
      for (let r = 3; r <= last; r++) rows.push(ws.getRow(r).values as unknown[]);
      rows.reverse().forEach((vals, i) => { ws.getRow(3 + i).values = vals as never; });
    });
    const cb = makeCb();
    const a = planImport(await readExportWorkbook(plain), currentOf(fresh()), cb);
    const b = planImport(await readExportWorkbook(sorted), currentOf(fresh()), cb);
    const edits = (p: typeof a) => p.changes.map((c) => [c.diagramId, c.edit]);
    expect(a.changes).toHaveLength(2);
    expect(edits(a)).toEqual(expect.arrayContaining([
      [1, { kind: 'moveKind', moveId: 'qm1', kindId: 'kq2' }],
      [1, { kind: 'moveKind', moveId: 'om1', kindId: 'ko2' }],
    ]));
    expect(new Set(edits(b).map((e) => JSON.stringify(e)))).toEqual(new Set(edits(a).map((e) => JSON.stringify(e))));
    expect(b.conflicts).toEqual([]);
    expect(b.skipped).toEqual([]);
    expect(a.summary).toEqual({ movesRecoded: 2, diagrams: 1, episodeFields: 0 });
  });

  it('kind renamed after export is not a change or conflict', async () => {
    const read = await readExportWorkbook(await exportOf(fresh()));
    const cb = makeCb();
    cb.kinds.find((k) => k.id === 'kq1')!.label = 'Ask to clarify';
    const plan = planImport(read, currentOf(fresh()), cb);
    expect(plan.changes).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it('episode edited on one row applies; two different edits skip', async () => {
    const base = await exportOf(fresh());
    const one = await editSheet(base, (ws) => {
      ws.getCell(rowWhere(ws, 'move_id_untyped', 'u2'), col('status')).value = 'vetted';
    });
    const p1 = planImport(await readExportWorkbook(one), currentOf(fresh()), makeCb());
    expect(p1.changes.map((c) => [c.diagramId, c.edit])).toEqual([[1, { kind: 'episode', field: 'status', value: 'vetted' }]]);
    expect(p1.summary.episodeFields).toBe(1);

    const two = await editSheet(base, (ws) => {
      ws.getCell(rowWhere(ws, 'move_id_untyped', 'u1'), col('discipline')).value = 'Algebra';
      ws.getCell(rowWhere(ws, 'move_id_untyped', 'u2'), col('discipline')).value = 'Geometry';
    });
    const p2 = planImport(await readExportWorkbook(two), currentOf(fresh()), makeCb());
    expect(p2.changes).toEqual([]);
    expect(p2.skipped.map((s) => s.reason)).toEqual(['conflictingEpisodeValues']);
  });

  it('Type and Kind set on an untyped row produce moveType then moveKind', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      const r = rowWhere(ws, 'move_id_untyped', 'u1');
      ws.getCell(r, col('untyped_type')).value = 'Question';
      ws.getCell(r, col('untyped_kind')).value = 'clarify ';
    });
    const plan = planImport(await readExportWorkbook(buf), currentOf(fresh()), makeCb());
    const edits = planToEdits(plan, () => 'diagram').get(1)!;
    expect(edits).toEqual([
      { kind: 'moveType', moveId: 'u1', supportType: 'question' },
      { kind: 'moveKind', moveId: 'u1', kindId: 'kq1' },
    ]);
    expect(plan.summary).toEqual({ movesRecoded: 1, diagrams: 1, episodeFields: 0 });
    // Applied in order, the move ends up a question with the kind.
    const after = applyOps(docA(), editsToOps(edits, docA()));
    expect(after.elements.find((e) => e.id === 'u1')).toMatchObject({ supportType: 'question', subtype: 'kq1' });
  });

  it('Kind on a still-untyped move is skipped kindOnUntypedMove', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      ws.getCell(rowWhere(ws, 'move_id_untyped', 'u1'), col('untyped_kind')).value = 'Clarify';
    });
    const plan = planImport(await readExportWorkbook(buf), currentOf(fresh()), makeCb());
    expect(plan.changes).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['kindOnUntypedMove']);
  });

  it('unknown label skipped kindNotInCodebook', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      ws.getCell(rowWhere(ws, 'move_id_question', 'qa'), col('question_kind')).value = 'Nope';
      // An Other kind in the Question group is the wrong type, not unknown.
      ws.getCell(rowWhere(ws, 'move_id_question', 'qb'), col('question_kind')).value = 'Praise';
    });
    const plan = planImport(await readExportWorkbook(buf), currentOf(fresh()), makeCb());
    expect(plan.changes).toEqual([]);
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual(['kindNotInCodebook', 'kindWrongType']);
  });

  it('deleted move skipped moveDeleted', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      ws.getCell(rowWhere(ws, 'move_id_question', 'qa'), col('question_kind')).value = 'Clarify';
    });
    const b = docB();
    b.elements = b.elements.filter((e) => e.id !== 'qa');
    const plan = planImport(await readExportWorkbook(buf), currentOf([[1, docA()], [2, b]]), makeCb());
    expect(plan.changes).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['moveDeleted']);
    // A diagram gone from the group skips its changed cells too.
    const gone = planImport(await readExportWorkbook(buf), currentOf([[1, docA()], [2, null]]), makeCb());
    expect(gone.skipped.map((s) => s.reason)).toEqual(['diagramMissing']);
  });

  it('diagram edited after export conflicts and defaults to diagram value', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      ws.getCell(rowWhere(ws, 'move_id_question', 'qm1'), col('question_kind')).value = 'Justify';
      ws.getCell(rowWhere(ws, 'move_id_question', 'qb'), col('question_kind')).value = 'Clarify';
    });
    const a = docA();
    const qm1 = a.elements.find((e) => e.id === 'qm1')!;
    qm1.subtype = 'kq3'; // a teammate recoded it after the export
    const plan = planImport(await readExportWorkbook(buf), currentOf([[1, a], [2, docB()]]), makeCb());
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({
      diagramId: 1, diagramValue: 'Old question', sheet: { kind: 'moveKind', moveId: 'qm1', kindId: 'kq2' },
    });
    expect(plan.changes.map((c) => c.edit)).toEqual([{ kind: 'moveKind', moveId: 'qb', kindId: 'kq1' }]);
    expect(planToEdits(plan, () => 'diagram').get(1)).toBeUndefined();
    expect(planToEdits(plan, () => 'sheet').get(1)).toEqual([{ kind: 'moveKind', moveId: 'qm1', kindId: 'kq2' }]);
  });

  it('a Kind that rides on a conflicting retype follows the retype choice', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      const r = rowWhere(ws, 'move_id_untyped', 'u2');
      ws.getCell(r, col('untyped_type')).value = 'Question';
      ws.getCell(r, col('untyped_kind')).value = 'Justify';
    });
    const a = docA();
    a.elements.find((e) => e.id === 'u2')!.supportType = 'other'; // retyped in the app since export
    const plan = planImport(await readExportWorkbook(buf), currentOf([[1, a], [2, docB()]]), makeCb());
    expect(plan.conflicts.map((c) => c.sheet.kind)).toEqual(['moveType']);
    expect(planToEdits(plan, () => 'diagram').get(1)).toBeUndefined();
    expect(planToEdits(plan, () => 'sheet').get(1)).toEqual([
      { kind: 'moveType', moveId: 'u2', supportType: 'question' },
      { kind: 'moveKind', moveId: 'u2', kindId: 'kq2' },
    ]);
  });

  it('a Kind in the Question group on a move retyped since export is skipped', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      ws.getCell(rowWhere(ws, 'move_id_question', 'qb'), col('question_kind')).value = 'Clarify';
    });
    const b = docB();
    b.elements.find((e) => e.id === 'qb')!.supportType = 'other';
    const plan = planImport(await readExportWorkbook(buf), currentOf([[1, docA()], [2, b]]), makeCb());
    expect(plan.changes).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['kindWrongType']);
  });

  it('rows added in Excel and invalid values are skipped, never guessed', async () => {
    const buf = await editSheet(await exportOf(fresh()), (ws) => {
      const extra = ws.rowCount + 1;
      ws.getCell(extra, col('question_move')).value = 'typed in Excel';
      ws.getCell(extra, col('question_kind')).value = 'Clarify';
      ws.getCell(rowWhere(ws, 'move_id_question', 'qa'), col('sgwc')).value = 'Small group';
    });
    const plan = planImport(await readExportWorkbook(buf), currentOf(fresh()), makeCb());
    expect(plan.changes).toEqual([]);
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual(['invalidValue', 'rowWithoutIds']);
  });

  it('a cleared Clip that was only a suggestion writes nothing; a typed Clip is stored', async () => {
    const base = await exportOf(fresh());
    const r = (ws: Worksheet) => rowWhere(ws, 'move_id_question', 'qm1');
    const cleared = await editSheet(base, (ws) => { ws.getCell(r(ws), col('clip')).value = null; });
    expect(planImport(await readExportWorkbook(cleared), currentOf(fresh()), makeCb()).changes).toEqual([]);
    const typed = await editSheet(base, (ws) => { ws.getCell(r(ws), col('clip')).value = '1:05-2:00'; });
    expect(planImport(await readExportWorkbook(typed), currentOf(fresh()), makeCb()).changes.map((c) => c.edit))
      .toEqual([{ kind: 'episode', field: 'clip', value: '1:05-2:00' }]);
  });

  it('a non-export workbook throws NotAnExportError', async () => {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').getCell('A1').value = 'hello';
    await expect(readExportWorkbook(await toArrayBuffer(wb))).rejects.toBeInstanceOf(NotAnExportError);
    await expect(readExportWorkbook(new TextEncoder().encode('a,b\n1,2').buffer as ArrayBuffer))
      .rejects.toBeInstanceOf(NotAnExportError);
  });
});
