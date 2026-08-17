import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import type { CloudDiagram, DiagramListItem } from '../../api/types';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';
import type { DiagramElement } from '../../types/elements';
import type { Connection } from '../../types/connections';
import type { Transcript } from '../../types/transcript';
import type { StyleConfig } from '../../types/styleConfig';

interface LibraryModalProps {
  open: boolean;
  onClose: () => void;
}

export function LibraryModal({ open, onClose }: LibraryModalProps) {
  const groups = useAuthStore((s) => s.groups);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<DiagramListItem[] | null>(null);
  const effectiveGroupId = groupId ?? groups[0]?.id ?? null;

  const refresh = useCallback(async () => {
    if (effectiveGroupId === null) return;
    setItems(null);
    try {
      setItems(await api<DiagramListItem[]>(`/api/groups/${effectiveGroupId}/diagrams`));
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'failed to load library');
      setItems([]);
    }
  }, [effectiveGroupId]);

  useEffect(() => {
    if (!open) return;
    void (async () => { await refresh(); })();
  }, [open, refresh]);

  const handleOpen = async (item: DiagramListItem) => {
    try {
      const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
      const snap = d.snapshot;
      if (!snap.elements || !snap.connections) {
        useToastStore.getState().addToast('error', 'that cloud diagram looks corrupted');
        return;
      }
      useDiagramStore.getState().loadDiagram(
        snap.elements as DiagramElement[],
        snap.connections as Connection[],
        snap.name,
        (snap.transcript ?? null) as Transcript | null,
        snap.styleConfig as StyleConfig | undefined,
      );
      useCloudStore.getState().setCloudTarget(d.id, d.groupId);
      useToastStore.getState().addToast('info', `Opened "${d.title}" from cloud`);
      onClose();
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'failed to open diagram');
    }
  };

  const handleDelete = async (item: DiagramListItem) => {
    const ok = await confirmAsync({
      title: 'Delete diagram',
      message: `Delete "${item.title}" from the shared library? All of its versions will be removed.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/api/diagrams/${item.id}`, { method: 'DELETE' });
      if (useCloudStore.getState().diagramId === item.id) useCloudStore.getState().clearCloudTarget();
      void refresh();
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'delete failed');
    }
  };

  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };

  return (
    <Modal open={open} onClose={onClose} title="Group library" size="lg" initialFocus="close">
      <div className="px-5 py-4 space-y-4">
        {groups.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: theme.sidebar.text }}>
              Group
            </label>
            <select
              value={effectiveGroupId ?? ''}
              onChange={(e) => setGroupId(Number(e.target.value))}
              className="px-3 py-2 text-sm border rounded-lg w-full cursor-pointer transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={inputStyle}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {items === null ? (
          <p className="text-sm py-8 text-center" style={{ color: theme.sidebar.textSecondary }}>
            Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: theme.sidebar.textSecondary }}>
            No diagrams yet — use &apos;Save to cloud&apos; to add the first one.
          </p>
        ) : (
          <ul className="flex flex-col gap-1" role="list">
            {items.map((item) => (
              <li key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleOpen(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleOpen(item);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg cursor-pointer transition-colors duration-100 ease-out"
                  style={{ color: theme.sidebar.text }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs truncate" style={{ color: theme.sidebar.textSecondary }}>
                      {item.lastEditor} · {new Date(item.updatedAt + 'Z').toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: theme.sidebar.textSecondary }}>
                    {item.versionCount} {item.versionCount === 1 ? 'version' : 'versions'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete "${item.title}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(item);
                    }}
                    className="p-1.5 rounded transition-colors flex-shrink-0"
                    style={{ color: theme.danger.fg }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.danger.bg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
