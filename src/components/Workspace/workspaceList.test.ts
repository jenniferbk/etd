import { describe, expect, it } from 'vitest';
import { visibleDiagrams } from './workspaceList';
import type { DiagramListItem } from '../../api/types';

function item(id: number, title: string, over: Partial<DiagramListItem> = {}): DiagramListItem {
  return {
    id, title, updatedAt: `2026-10-0${id} 12:00:00`, lastEditor: 'Ana', versionCount: 1,
    folderId: null, ...over,
  };
}

const items = [
  item(1, 'Ava day 1', { folderId: 5, lastEditor: 'Zed', versionCount: 3 }),
  item(2, 'beta lesson', { lastEditor: 'Bo', versionCount: 10 }),
  item(3, 'Ava day 2', { folderId: 5, lastEditor: 'amy', versionCount: 2 }),
  item(4, 'Gamma'),
];
const byNewest = { key: 'updatedAt' as const, dir: 'desc' as const };

describe('visibleDiagrams', () => {
  it('at the top level shows only diagrams in no folder, newest first', () => {
    expect(visibleDiagrams(items, { folderId: null, query: '', sort: byNewest }).map((d) => d.id)).toEqual([4, 2]);
  });

  it('inside a folder shows only that folder', () => {
    expect(visibleDiagrams(items, { folderId: 5, query: '', sort: byNewest }).map((d) => d.id)).toEqual([3, 1]);
  });

  it('treats items from servers without folders as top level', () => {
    const old = [{ id: 9, title: 'x', updatedAt: '2026-10-01', lastEditor: 'a', versionCount: 1 }];
    expect(visibleDiagrams(old, { folderId: null, query: '', sort: byNewest })).toHaveLength(1);
  });

  it('a search matches titles in every folder, ignoring case and spacing', () => {
    const r = visibleDiagrams(items, { folderId: null, query: '  ava ', sort: byNewest });
    expect(r.map((d) => d.id)).toEqual([3, 1]);
  });

  it('a search with several words needs all of them, in any order', () => {
    expect(visibleDiagrams(items, { folderId: 5, query: '2 ava', sort: byNewest }).map((d) => d.id)).toEqual([3]);
  });

  it('sorts by title A→Z ignoring case, and reverses', () => {
    const all = items.map((d) => ({ ...d, folderId: null }));
    expect(visibleDiagrams(all, { folderId: null, query: '', sort: { key: 'title', dir: 'asc' } }).map((d) => d.title))
      .toEqual(['Ava day 1', 'Ava day 2', 'beta lesson', 'Gamma']);
    expect(visibleDiagrams(all, { folderId: null, query: '', sort: { key: 'title', dir: 'desc' } })[0].title).toBe('Gamma');
  });

  it('sorts titles with numbers in natural order', () => {
    const all = [item(1, 'Day 10'), item(2, 'Day 2'), item(3, 'Day 1')];
    expect(visibleDiagrams(all, { folderId: null, query: '', sort: { key: 'title', dir: 'asc' } }).map((d) => d.title))
      .toEqual(['Day 1', 'Day 2', 'Day 10']);
  });

  it('sorts by editor and by version count', () => {
    const all = items.map((d) => ({ ...d, folderId: null }));
    expect(visibleDiagrams(all, { folderId: null, query: '', sort: { key: 'lastEditor', dir: 'asc' } }).map((d) => d.lastEditor))
      .toEqual(['amy', 'Ana', 'Bo', 'Zed']);
    expect(visibleDiagrams(all, { folderId: null, query: '', sort: { key: 'versionCount', dir: 'desc' } }).map((d) => d.versionCount))
      .toEqual([10, 3, 2, 1]);
  });
});
