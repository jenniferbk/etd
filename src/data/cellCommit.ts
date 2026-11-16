// Pure commit rules for Data grid cells whose behavior the spec pins down.
import type { CellEdit } from './edits';

/** How an in-place text editor closed with a value. */
export type CommitVia = 'enter' | 'blur';

/** A blank Clip shows the info box's range as a suggestion. It is stored only
 *  when someone confirms it (Enter) or edits it; a blur over the untouched
 *  suggestion stores nothing (spec §5). */
export function clipCommit(value: string, via: CommitVia, suggestion: string): CellEdit[] {
  const next = value.trim();
  if (!next) return [];
  if (via === 'blur' && next === suggestion.trim()) return [];
  return [{ kind: 'episode', field: 'clip', value: next }];
}

/** The Move editor edits the move's content only. The timestamp is shown
 *  beside it and edited on the canvas; it is never parsed out of the text. */
export function moveContentCommit(m: { id: string; content: string }, value: string): CellEdit[] {
  const next = value.trim();
  if (next === m.content) return [];
  return [{ kind: 'elementContent', elementId: m.id, value: next }];
}
