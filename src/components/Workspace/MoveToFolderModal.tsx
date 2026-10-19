import { useEffect, useState } from 'react';
import { Folder, Home } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { FolderListItem } from '../../api/types';
import { theme } from '../../utils/theme';

interface MoveToFolderModalProps {
  open: boolean;
  onClose: () => void;
  diagramTitle: string;
  currentFolderId: number | null;
  folders: FolderListItem[];
  onMove: (folderId: number | null) => Promise<void>;
}

export function MoveToFolderModal({
  open, onClose, diagramTitle, currentFolderId, folders, onMove,
}: MoveToFolderModalProps) {
  const [choice, setChoice] = useState<number | null>(currentFolderId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setChoice(currentFolderId);
  }, [open, currentFolderId]);

  const disabled = busy || choice === currentFolderId;

  const submit = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      await onMove(choice);
      onClose();
    } catch {
      // Toast already shown by the caller.
    } finally {
      setBusy(false);
    }
  };

  const options: { id: number | null; name: string; icon: typeof Folder }[] = [
    { id: null, name: 'All diagrams (no folder)', icon: Home },
    ...folders.map((f) => ({ id: f.id, name: f.name, icon: Folder })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move to folder"
      subtitle={diagramTitle}
      size="sm"
      initialFocus="primary"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={disabled}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            {busy ? 'Moving…' : 'Move'}
          </button>
        </>
      }
    >
      <div className="px-5 py-4 flex flex-col gap-1 max-h-80 overflow-y-auto" role="radiogroup" aria-label="Folder">
        {folders.length === 0 && (
          <p className="text-sm mb-2" style={{ color: theme.sidebar.textSecondary }}>
            No folders yet. Use “New folder” on the Diagrams page to make one.
          </p>
        )}
        {options.map(({ id, name, icon: Icon }) => (
          <label
            key={id ?? 'top'}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer"
            style={{
              color: theme.sidebar.text,
              backgroundColor: choice === id ? theme.sidebar.surfaceActive : 'transparent',
            }}
          >
            <input
              type="radio"
              name="move-folder"
              checked={choice === id}
              onChange={() => setChoice(id)}
            />
            <Icon size={16} aria-hidden="true" />
            <span className="truncate">{name}</span>
            {id === currentFolderId && (
              <span className="ml-auto text-xs" style={{ color: theme.sidebar.textSecondary }}>current</span>
            )}
          </label>
        ))}
      </div>
    </Modal>
  );
}
