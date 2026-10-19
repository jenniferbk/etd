import { Folder, Pencil, Trash2 } from 'lucide-react';
import type { FolderListItem } from '../../api/types';
import { theme } from '../../utils/theme';
import { OptionsMenu } from './OptionsMenu';

interface FolderTileProps {
  folder: FolderListItem;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function FolderTile({ folder, onOpen, onRename, onDelete }: FolderTileProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-shadow duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: theme.sidebar.surface,
        borderColor: theme.sidebar.border,
        boxShadow: theme.shadow.sm,
        outlineColor: theme.focus.ring,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = theme.shadow.md; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = theme.shadow.sm; }}
    >
      <Folder size={20} aria-hidden="true" style={{ color: theme.sidebar.textSecondary }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: theme.sidebar.text }}>{folder.name}</div>
        <div className="text-xs" style={{ color: theme.sidebar.textSecondary }}>
          {folder.diagramCount} {folder.diagramCount === 1 ? 'diagram' : 'diagrams'}
        </div>
      </div>
      <OptionsMenu
        tooltip="Folder options"
        ariaLabel={`Options for folder "${folder.name}"`}
        items={[
          { icon: Pencil, label: 'Rename folder', onClick: onRename },
          { icon: Trash2, label: 'Delete folder', variant: 'danger', separatorBefore: true, onClick: onDelete },
        ]}
      />
    </div>
  );
}
