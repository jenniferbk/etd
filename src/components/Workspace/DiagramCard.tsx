import { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { apiBlob } from '../../api/client';
import type { DiagramListItem, FolderListItem } from '../../api/types';
import { theme } from '../../utils/theme';
import { relativeTime } from '../../utils/relativeTime';
import { OptionsMenu } from './OptionsMenu';
import { useDiagramActions } from './useDiagramActions';
import { folderName } from './workspaceList';

interface DiagramCardProps {
  item: DiagramListItem;
  folders: FolderListItem[];
  /** Show which folder the diagram is in (search results span folders). */
  showFolder?: boolean;
  onOpen: () => void;
  /** Called after a rename, move, or delete succeeds, so the parent can refresh its list. */
  onChanged: () => void;
}

/** Object URL for the card's thumbnail (fetched with the session token, so a
 *  plain <img src> to the API won't do). Refetches when the diagram is saved
 *  again (updatedAt changes); null while loading or when there is none. */
function useThumbnailUrl(item: DiagramListItem): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!item.hasThumbnail) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void apiBlob(`/api/diagrams/${item.id}/thumbnail`)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { /* no thumbnail → placeholder */ });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, item.hasThumbnail, item.updatedAt]);
  return item.hasThumbnail ? url : null;
}

export function DiagramCard({ item, folders, showFolder = false, onOpen, onChanged }: DiagramCardProps) {
  const thumbnailUrl = useThumbnailUrl(item);
  const { menuItems, dialogs } = useDiagramActions(item, folders, onChanged);
  const inFolder = showFolder ? folderName(item, folders) : null;

  return (
    <>
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
        className="relative flex flex-col rounded-xl border p-4 text-left cursor-pointer transition-shadow duration-150 ease-out"
        style={{
          backgroundColor: theme.sidebar.surface,
          borderColor: theme.sidebar.border,
          boxShadow: theme.shadow.sm,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = theme.shadow.md; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = theme.shadow.sm; }}
      >
        <div
          className="h-32 rounded-lg mb-3 overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: thumbnailUrl ? '#ffffff' : theme.sidebar.hover }}
        >
          {thumbnailUrl && (
            <img src={thumbnailUrl} alt="" className="max-w-full max-h-full object-contain" draggable={false} />
          )}
        </div>

        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: theme.sidebar.text }}>
            {item.title}
          </h3>
          <OptionsMenu items={menuItems} tooltip="Diagram options" ariaLabel={`Options for "${item.title}"`} />
        </div>

        {inFolder && (
          <p className="text-xs mt-1 flex items-center gap-1 truncate" style={{ color: theme.sidebar.textSecondary }}>
            <Folder size={12} aria-hidden="true" /> {inFolder}
          </p>
        )}
        <p className="text-xs mt-1 truncate" style={{ color: theme.sidebar.textSecondary }}>
          last edited by {item.lastEditor} · {relativeTime(item.updatedAt)}
        </p>
        <p className="text-xs mt-0.5" style={{ color: theme.sidebar.textSecondary }}>
          {item.versionCount} {item.versionCount === 1 ? 'version' : 'versions'}
        </p>
      </div>
      {dialogs}
    </>
  );
}
