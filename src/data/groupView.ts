import type { ComponentGroup, MoveCell, MoveSlot } from './types';
import { parseTimeSeconds } from './buildRows';

export type SortKey = 'order' | 'episode' | 'part' | 'contributor' | 'who' | 'time' | 'status';

export interface GroupFilter {
  untypedOnly?: boolean;
  /** A move whose resolved kind type differs from its slot. Untyped moves never mismatch. */
  mismatchOnly?: boolean;
  kindId?: string;
  category?: string;
  status?: 'vetted' | 'not vetted' | 'blank';
  unlinkedOnly?: boolean;
  text?: string;
}

const SLOTS: MoveSlot[] = ['untyped', 'question', 'other'];
const allMoves = (g: ComponentGroup): MoveCell[] => SLOTS.flatMap((s) => g.moves[s]);

/** A sort value: a string or number, `undefined` for blank, `null` when the group has no component. */
type SortVal = string | number | undefined | null;

function valueOf(g: ComponentGroup, key: SortKey): SortVal {
  switch (key) {
    case 'order':
      return g.order;
    case 'episode':
      return g.episodeTitle;
    case 'status':
      return g.episode.status;
    case 'time': {
      if (!g.component) return null;
      return parseTimeSeconds(g.component.time) ?? undefined;
    }
    case 'part':
    case 'contributor':
    case 'who': {
      if (!g.component) return null;
      return g.component[key] || undefined;
    }
  }
}

/** Sorts whole groups. Blank values come next-to-last and component-less groups last,
 *  in both directions. Ties keep `order`. Does not mutate the input. */
export function sortGroups(groups: ComponentGroup[], key: SortKey, dir: 'asc' | 'desc'): ComponentGroup[] {
  const sign = dir === 'asc' ? 1 : -1;
  const rank = (v: SortVal) => (v === null ? 2 : v === undefined ? 1 : 0);
  return [...groups].sort((a, b) => {
    const x = valueOf(a, key);
    const y = valueOf(b, key);
    const rx = rank(x);
    const ry = rank(y);
    if (rx !== ry) return rx - ry;
    if (rx === 0) {
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true });
      if (c !== 0) return c * sign;
    }
    return a.order - b.order;
  });
}

function matches(g: ComponentGroup, f: GroupFilter): boolean {
  const moves = allMoves(g);
  if (f.untypedOnly && g.moves.untyped.length === 0) return false;
  if (f.mismatchOnly) {
    const bad = (['question', 'other'] as const).some((slot) =>
      g.moves[slot].some((m) => m.kind !== undefined && m.kind.type !== slot),
    );
    if (!bad) return false;
  }
  if (f.kindId !== undefined && !moves.some((m) => m.kind?.id === f.kindId)) return false;
  if (f.category !== undefined && !moves.some((m) => m.kind?.category === f.category)) return false;
  if (f.status !== undefined) {
    const s = g.episode.status;
    if (f.status === 'blank' ? s !== undefined : s !== f.status) return false;
  }
  if (f.unlinkedOnly && g.component !== null) return false;
  if (f.text) {
    const q = f.text.toLowerCase();
    const hit =
      (g.component?.content ?? '').toLowerCase().includes(q) ||
      moves.some((m) => m.text.toLowerCase().includes(q));
    if (!hit) return false;
  }
  return true;
}

/** Keeps a whole group when it satisfies every set criterion. */
export function filterGroups(groups: ComponentGroup[], f: GroupFilter): ComponentGroup[] {
  return groups.filter((g) => matches(g, f));
}
