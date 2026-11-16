import type { Codebook, ComponentCell, ComponentGroup, DataRow, DiagramDocInput, MoveCell, MoveSlot } from './types';
import type { LiveDoc } from '../live/ops';
import type { ArgumentElement, SupportElement } from '../types/elements';
import type { Connection } from '../types/connections';
import type { AnalyticNote } from '../types/notes';
import { resolveKind } from './codebook';

const PART = { data: 'D', claim: 'C', warrant: 'W', backing: 'B', qualifier: 'Q', rebuttal: 'R' } as const;

/** Seconds of the first time in a value like `75:07-75:58` (hyphen, en or em
 *  dash). Accepts `h:mm:ss` or `mm:ss`; a fractional `.N` on the seconds is dropped. */
export function parseTimeSeconds(t: string): number | null {
  const first = (t ?? '').split(/[-–—]/)[0].replace(/(\d)\.\d+/g, '$1');
  const parts = first.match(/\d+/g);
  if (!parts) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** The first `[...]` found in any infoBox's content. */
export function clipSuggestion(doc: LiveDoc): string | undefined {
  for (const e of doc.elements) {
    if (e.type !== 'infoBox') continue;
    const m = /\[([^\]]+)\]/.exec(String(e.content ?? ''));
    if (m) return m[1];
  }
  return undefined;
}

const timeOf = (e: { attribution?: { timestamp?: string } }) => (e.attribution?.timestamp ?? '').trim();
const speakerOf = (e: { attribution?: { speaker?: string } }) =>
  (e.attribution?.speaker ?? '').trim().replace(/^Student-/, '');

/** Ascending by time, blank times last; stable. */
const byTime = (a: string, b: string) => {
  const x = parseTimeSeconds(a);
  const y = parseTimeSeconds(b);
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
};

function moveCell(m: SupportElement, cb: Codebook | null): MoveCell {
  const content = (m.content ?? '').trim();
  const time = timeOf(m);
  const supportType = m.supportType === 'question' || m.supportType === 'other' ? m.supportType : 'action';
  const cell: MoveCell = {
    id: m.id,
    text: time ? `${content} (${time})` : content,
    content,
    time,
    by: speakerOf(m) || m.contributor,
    supportType,
  };
  if (m.subtype && cb) cell.kind = resolveKind(cb, m.subtype);
  return cell;
}

export function buildGroups(input: DiagramDocInput, cb: Codebook | null): ComponentGroup[] {
  const { doc } = input;
  const diagramKey = input.diagramId !== null ? String(input.diagramId) : 'local';
  const els = new Map(doc.elements.map((e) => [e.id, e]));
  const conns = new Map((doc.connections as unknown as Connection[]).map((c) => [c.id, c]));
  const args = doc.elements.filter((e) => e.type === 'argument') as unknown as ArgumentElement[];
  const label = (e: ArgumentElement) => (e.label || PART[e.argumentType]).trim();

  // qualifier id -> target component id
  const fold = new Map<string, string>();
  for (const q of args) {
    if (q.argumentType !== 'qualifier' || !q.attachedTo) continue;
    const c = conns.get(q.attachedTo.connectionId);
    if (c && typeof c.to === 'string') fold.set(q.id, c.to);
  }
  const resolve = (id: string | undefined) => (id === undefined ? undefined : (fold.get(id) ?? id));

  const comps = args.filter((e) => !fold.has(e.id));
  const acc = new Map(
    comps.map((e) => [e.id, { el: e, qual: [] as string[], links: [] as string[], notes: [] as string[], moves: { untyped: [], question: [], other: [] } as Record<MoveSlot, MoveCell[]> }]),
  );
  for (const [qid, target] of fold) {
    const g = acc.get(target);
    if (g) g.qual.push(String((els.get(qid) as { content?: string }).content ?? '').trim());
  }
  for (const c of conns.values()) {
    const g = acc.get(c.from);
    if (!g) continue;
    if (typeof c.to === 'string') {
      const t = els.get(c.to);
      if (t && t.type === 'argument') g.links.push('→ ' + label(t as unknown as ArgumentElement));
    } else if (c.to && conns.has(c.to.connectionId)) {
      const base = conns.get(c.to.connectionId)!;
      const f = els.get(base.from);
      const t = typeof base.to === 'string' ? els.get(base.to) : undefined;
      if (f && t && f.type === 'argument' && t.type === 'argument') {
        g.links.push(`→ link ${label(f as unknown as ArgumentElement)}→${label(t as unknown as ArgumentElement)}`);
      }
    }
  }
  for (const n of doc.notes as unknown as AnalyticNote[]) {
    if (n.anchor?.kind !== 'element') continue;
    const g = acc.get(resolve(n.anchor.id) as string);
    if (g) g.notes.push(n.text);
  }

  const unlinked: Record<MoveSlot, MoveCell[]> = { untyped: [], question: [], other: [] };
  for (const e of doc.elements) {
    if (e.type !== 'support') continue;
    const m = e as unknown as SupportElement;
    const target = resolve(m.associatedWith);
    const slots = (target !== undefined && acc.get(target)?.moves) || unlinked;
    const slot: MoveSlot = m.supportType === 'question' ? 'question' : m.supportType === 'other' ? 'other' : 'untyped';
    slots[slot].push(moveCell(m, cb));
  }
  const sortMoves = (moves: Record<MoveSlot, MoveCell[]>) => {
    for (const s of ['untyped', 'question', 'other'] as const) moves[s].sort((a, b) => byTime(a.time, b.time));
  };

  const ordered = [...acc.values()].sort((a, b) => {
    const ag = a.el.contributor === 'given';
    const bg = b.el.contributor === 'given';
    if (ag !== bg) return ag ? -1 : 1;
    if (!ag) {
      const t = byTime(timeOf(a.el), timeOf(b.el));
      if (t !== 0) return t;
    }
    return a.el.position.y - b.el.position.y;
  });

  const base = {
    diagramKey,
    diagramId: input.diagramId,
    episodeTitle: input.title,
    episode: { ...(doc.episode ?? {}) },
    clipSuggestion: clipSuggestion(doc),
  };
  const groups: ComponentGroup[] = ordered.map((g) => {
    sortMoves(g.moves);
    const e = g.el;
    const component: ComponentCell = {
      id: e.id,
      part: PART[e.argumentType],
      argumentType: e.argumentType,
      contributor: e.contributor,
      content: (e.content ?? '').trim(),
      who: speakerOf(e),
      time: timeOf(e),
      qualifier: g.qual.join('; '),
      links: g.links.join('; '),
      note: g.notes.join(' | '),
    };
    return { ...base, key: e.id, component, moves: g.moves, order: 0 };
  });
  if (unlinked.untyped.length || unlinked.question.length || unlinked.other.length) {
    sortMoves(unlinked);
    groups.push({ ...base, key: `unlinked:${diagramKey}`, component: null, moves: unlinked, order: 0 });
  }
  return groups;
}

export function buildDataset(inputs: DiagramDocInput[], cb: Codebook | null): ComponentGroup[] {
  const sorted = [...inputs].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const out = sorted.flatMap((i) => buildGroups(i, cb));
  out.forEach((g, i) => { g.order = i; });
  return out;
}

export function toRows(groups: ComponentGroup[]): DataRow[] {
  const rows: DataRow[] = [];
  let prevDiagram: string | null = null;
  for (const group of groups) {
    const { untyped, question, other } = group.moves;
    const n = Math.max(1, untyped.length, question.length, other.length);
    const firstOfEpisode = group.diagramKey !== prevDiagram;
    prevDiagram = group.diagramKey;
    for (let i = 0; i < n; i++) {
      const row: DataRow = { seq: rows.length + 1, group, firstOfGroup: i === 0, firstOfEpisode: i === 0 && firstOfEpisode };
      if (untyped[i]) row.untyped = untyped[i];
      if (question[i]) row.question = question[i];
      if (other[i]) row.other = other[i];
      rows.push(row);
    }
  }
  return rows;
}
