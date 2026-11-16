import { applyOps, type LiveDoc, type Op } from '../live/ops';
import type { EpisodeFields } from '../types/episode';
import type { ArgumentType, Attribution } from '../types/elements';

export type CellEdit =
  | { kind: 'title'; value: string }
  | { kind: 'episode'; field: keyof EpisodeFields; value: string | null }
  | { kind: 'elementContent'; elementId: string; value: string }
  | { kind: 'attribution'; elementId: string; field: 'speaker' | 'timestamp'; value: string }
  | { kind: 'part'; elementId: string; argumentType: Exclude<ArgumentType, 'qualifier'> }
  | { kind: 'contributor'; elementId: string; value: string }
  | { kind: 'moveType'; moveId: string; supportType: 'question' | 'other' }
  | { kind: 'moveKind'; moveId: string; kindId: string | null };

/** Turns grid cell edits into live ops. Edits apply in order, each against the
 *  doc as updated by the earlier ones; edits naming a missing element give no op. */
export function editsToOps(edits: CellEdit[], doc: LiveDoc): Op[] {
  const ops: Op[] = [];
  let cur = doc;
  const emit = (op: Op) => {
    ops.push(op);
    cur = applyOps(cur, [op]);
  };
  const find = (id: string) => cur.elements.find((e) => e.id === id);
  const patch = (id: string, fields: Record<string, unknown>) =>
    emit({ t: 'patch', c: 'elements', id, fields });

  for (const e of edits) {
    switch (e.kind) {
      case 'title':
        emit({ t: 'set', k: 'name', value: e.value });
        break;
      case 'episode': {
        const next: Record<string, unknown> = { ...(cur.episode ?? {}) };
        if (e.value === null) delete next[e.field];
        else next[e.field] = e.value;
        emit({ t: 'set', k: 'episode', value: next });
        break;
      }
      case 'elementContent':
        if (find(e.elementId)) patch(e.elementId, { content: e.value });
        break;
      case 'attribution': {
        const el = find(e.elementId);
        if (!el) break;
        const prev = (el.attribution ?? {}) as Partial<Attribution>;
        const merged: Attribution = {
          speaker: prev.speaker ?? '',
          timestamp: prev.timestamp ?? '',
          [e.field]: e.value,
        };
        patch(e.elementId, { attribution: merged });
        break;
      }
      case 'part':
        if (find(e.elementId)) patch(e.elementId, { argumentType: e.argumentType });
        break;
      case 'contributor':
        if (find(e.elementId)) patch(e.elementId, { contributor: e.value });
        break;
      case 'moveType':
        if (find(e.moveId)) patch(e.moveId, { supportType: e.supportType, subtype: null });
        break;
      case 'moveKind': {
        const el = find(e.moveId);
        if (!el || el.supportType === 'action') break;
        patch(e.moveId, { subtype: e.kindId });
        break;
      }
    }
  }
  return ops;
}
