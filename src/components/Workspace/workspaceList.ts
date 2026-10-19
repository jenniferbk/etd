import type { DiagramListItem, FolderListItem } from '../../api/types';

export type SortKey = 'title' | 'updatedAt' | 'lastEditor' | 'versionCount';
export type SortDir = 'asc' | 'desc';
export interface SortSpec { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: SortSpec = { key: 'updatedAt', dir: 'desc' };

/** The direction a column sorts in when first clicked: newest / most first
 *  for time and counts, A→Z for text. */
export function defaultDirFor(key: SortKey): SortDir {
  return key === 'updatedAt' || key === 'versionCount' ? 'desc' : 'asc';
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compare(a: DiagramListItem, b: DiagramListItem, key: SortKey): number {
  switch (key) {
    case 'title': return collator.compare(a.title, b.title);
    case 'lastEditor': return collator.compare(a.lastEditor, b.lastEditor);
    case 'versionCount': return a.versionCount - b.versionCount;
    // SQLite datetime strings sort correctly as text.
    case 'updatedAt': return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
  }
}

/** What the Diagrams tab shows. With a search query, titles in every folder
 *  are searched (all words must appear, any order); otherwise only the
 *  current folder (null = top level). Ties fall back to newest first. */
export function visibleDiagrams(
  items: DiagramListItem[],
  { folderId, query, sort }: { folderId: number | null; query: string; sort: SortSpec },
): DiagramListItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length > 0
    ? items.filter((d) => {
        const title = d.title.toLowerCase();
        return words.every((w) => title.includes(w));
      })
    : items.filter((d) => (d.folderId ?? null) === folderId);
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...shown].sort((a, b) =>
    sign * compare(a, b, sort.key) || -compare(a, b, 'updatedAt') || b.id - a.id,
  );
}

/** The name of the folder a diagram is in, or null at the top level. */
export function folderName(item: DiagramListItem, folders: FolderListItem[]): string | null {
  if (item.folderId == null) return null;
  return folders.find((f) => f.id === item.folderId)?.name ?? null;
}
