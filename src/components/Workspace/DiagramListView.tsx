import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DiagramListItem, FolderListItem } from '../../api/types';
import { theme } from '../../utils/theme';
import { relativeTime } from '../../utils/relativeTime';
import { OptionsMenu } from './OptionsMenu';
import { useDiagramActions } from './useDiagramActions';
import { defaultDirFor, folderName, type SortKey, type SortSpec } from './workspaceList';

interface DiagramListViewProps {
  items: DiagramListItem[];
  folders: FolderListItem[];
  showFolder: boolean;
  sort: SortSpec;
  onSort: (sort: SortSpec) => void;
  onOpen: (item: DiagramListItem) => void;
  onChanged: () => void;
}

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: 'title', label: 'Title', className: 'flex-1 min-w-0' },
  { key: 'updatedAt', label: 'Last edited', className: 'w-32 hidden sm:block' },
  { key: 'lastEditor', label: 'Editor', className: 'w-36 hidden md:block' },
  { key: 'versionCount', label: 'Versions', className: 'w-20 text-right hidden sm:block' },
];

/** Details view of the Diagrams tab: one row per diagram, sortable columns. */
export function DiagramListView({ items, folders, showFolder, sort, onSort, onOpen, onChanged }: DiagramListViewProps) {
  const headerClick = (key: SortKey) => {
    onSort(sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: defaultDirFor(key) });
  };

  return (
    <div
      className="rounded-xl border"
      style={{ backgroundColor: theme.sidebar.surface, borderColor: theme.sidebar.border }}
      role="table"
      aria-label="Diagrams"
    >
      <div
        role="row"
        className="flex items-center gap-3 px-4 py-2 text-xs font-medium"
        style={{ color: theme.sidebar.textSecondary, borderBottom: `1px solid ${theme.sidebar.border}` }}
      >
        {COLUMNS.map((col) => {
          const active = sort.key === col.key;
          const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
          return (
            <div
              key={col.key}
              role="columnheader"
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={col.className}
            >
              <button
                onClick={() => headerClick(col.key)}
                className={`inline-flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${col.key === 'versionCount' ? 'flex-row-reverse' : ''}`}
                style={{ color: active ? theme.sidebar.text : theme.sidebar.textSecondary, outlineColor: theme.focus.ring }}
              >
                {col.label}
                {active && <Arrow size={12} aria-hidden="true" />}
              </button>
            </div>
          );
        })}
        <div className="w-8" aria-hidden="true" />
      </div>
      {items.map((item, i) => (
        <DiagramRow
          key={item.id}
          item={item}
          folders={folders}
          showFolder={showFolder}
          first={i === 0}
          onOpen={() => onOpen(item)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function DiagramRow({ item, folders, showFolder, first, onOpen, onChanged }: {
  item: DiagramListItem;
  folders: FolderListItem[];
  showFolder: boolean;
  first: boolean;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const { menuItems, dialogs } = useDiagramActions(item, folders, onChanged);
  const inFolder = showFolder ? folderName(item, folders) : null;
  return (
    <>
      <div
        role="row"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{
          color: theme.sidebar.text,
          outlineColor: theme.focus.ring,
          ...(first ? {} : { borderTop: `1px solid ${theme.sidebar.borderSubtle}` }),
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <div role="cell" className="flex-1 min-w-0">
          <div className="truncate font-medium">{item.title}</div>
          {inFolder && (
            <div className="text-xs truncate" style={{ color: theme.sidebar.textSecondary }}>in {inFolder}</div>
          )}
        </div>
        <div role="cell" className="w-32 hidden sm:block text-xs" style={{ color: theme.sidebar.textSecondary }}>
          {relativeTime(item.updatedAt)}
        </div>
        <div role="cell" className="w-36 hidden md:block text-xs truncate" style={{ color: theme.sidebar.textSecondary }}>
          {item.lastEditor}
        </div>
        <div role="cell" className="w-20 hidden sm:block text-xs text-right" style={{ color: theme.sidebar.textSecondary }}>
          {item.versionCount}
        </div>
        <div role="cell" className="w-8 flex justify-end">
          <OptionsMenu items={menuItems} tooltip="Diagram options" ariaLabel={`Options for "${item.title}"`} />
        </div>
      </div>
      {dialogs}
    </>
  );
}
