import type { Codebook, CodebookKind, KindType, ResolvedKind } from './types';
import type { StyleConfig, Subtype } from '../types/styleConfig';
import type { LiveDoc } from '../live/ops';
import { jsonEqual } from '../live/ops';

const byId = (cb: Codebook, id: string) => cb.kinds.find((k) => k.id === id);

/** Follows `mergedInto` to the surviving kind. Unknown ids come back flagged missing. */
export function resolveKind(cb: Codebook, id: string): ResolvedKind {
  let cur = byId(cb, id);
  if (!cur) return { id, label: id, category: '', type: 'other', retired: false, missing: true };
  const seen = new Set<string>();
  while (cur.mergedInto !== undefined && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = byId(cb, cur.mergedInto);
    if (!next) break;
    cur = next;
  }
  return { id: cur.id, label: cur.label, category: cur.category, type: cur.type, retired: cur.status === 'retired', missing: false };
}

export function activeKinds(cb: Codebook, type: KindType): CodebookKind[] {
  return cb.kinds
    .filter((k) => k.type === type && k.status === 'active' && k.mergedInto === undefined)
    .sort((a, b) => a.position - b.position);
}

export function findKindByLabel(cb: Codebook, label: string, type?: KindType): CodebookKind | undefined {
  const want = label.trim().toLowerCase();
  return cb.kinds.find(
    (k) => k.mergedInto === undefined && (type === undefined || k.type === type) && k.label.trim().toLowerCase() === want,
  );
}

function mirrorList(existing: Subtype[], cb: Codebook, type: KindType): Subtype[] {
  const styles = new Map(existing.map((s) => [s.id, s.style]));
  return cb.kinds
    .filter((k) => k.type === type)
    .sort((a, b) => a.position - b.position)
    .map((k) => {
      const final = resolveKind(cb, k.id);
      const out: Subtype = { id: k.id, label: final.label, category: final.category };
      const style = styles.get(k.id);
      if (style !== undefined) out.style = style;
      if (k.status === 'retired' || k.mergedInto !== undefined) out.retired = true;
      return out;
    });
}

/** Rebuilds question/other subtypes from the codebook; `action` is untouched.
 *  Returns the same object when nothing changed. */
export function mirrorIntoStyleConfig(sc: StyleConfig, cb: Codebook): StyleConfig {
  const question = mirrorList(sc.subtypes.question ?? [], cb, 'question');
  const other = mirrorList(sc.subtypes.other ?? [], cb, 'other');
  if (jsonEqual(question, sc.subtypes.question) && jsonEqual(other, sc.subtypes.other)) return sc;
  return { ...sc, subtypes: { ...sc.subtypes, question, other } };
}

/** Kinds used by the docs' style configs, deduped by id, most common label wins. */
export function discoverKinds(docs: LiveDoc[]): { id: string; label: string; type: KindType }[] {
  const found = new Map<string, { type: KindType; labels: Map<string, number> }>();
  for (const doc of docs) {
    const sub = (doc.styleConfig as Partial<StyleConfig> | undefined)?.subtypes;
    if (!sub) continue;
    for (const type of ['question', 'other'] as const) {
      for (const s of sub[type] ?? []) {
        let e = found.get(s.id);
        if (!e) found.set(s.id, (e = { type, labels: new Map() }));
        e.labels.set(s.label, (e.labels.get(s.label) ?? 0) + 1);
      }
    }
  }
  return [...found].map(([id, { type, labels }]) => {
    let label = '';
    let best = 0;
    for (const [l, n] of labels) if (n > best) { best = n; label = l; }
    return { id, label, type };
  });
}

export function unknownSubtypes(docs: LiveDoc[], cb: Codebook) {
  return discoverKinds(docs).filter((k) => !byId(cb, k.id));
}
