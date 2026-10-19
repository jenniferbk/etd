import { useState } from 'react';
import { Pencil, Download, Trash2, FolderInput } from 'lucide-react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { CloudDiagram, DiagramListItem, FolderListItem } from '../../api/types';
import { useCloudStore } from '../../store/cloudStore';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
import { saveDiagramJson } from '../../utils/saveDiagram';
import type { AnalyticNote, Connection, DiagramElement, StyleConfig, Transcript } from '../../types';
import type { OptionsMenuItem } from './OptionsMenu';
import { NameModal } from './NameModal';
import { MoveToFolderModal } from './MoveToFolderModal';

/** The ⋯ menu actions for one library diagram, shared by the grid card and
 *  the list row. Returns the menu items and the dialogs to render. */
export function useDiagramActions(
  item: DiagramListItem,
  folders: FolderListItem[],
  onChanged: () => void,
): { menuItems: OptionsMenuItem[]; dialogs: React.ReactNode } {
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const showError = (err: unknown) => useToastStore.getState().addToast('error', friendlyError(err));

  const rename = async (title: string) => {
    try {
      await api(`/api/diagrams/${item.id}`, { method: 'PATCH', body: { title } });
      onChanged();
    } catch (err) {
      showError(err);
      throw err;
    }
  };

  const move = async (folderId: number | null) => {
    try {
      await api(`/api/diagrams/${item.id}`, { method: 'PATCH', body: { folderId } });
      const where = folderId === null ? 'All diagrams' : folders.find((f) => f.id === folderId)?.name ?? 'the folder';
      useToastStore.getState().addToast('info', `Moved "${item.title}" to ${where}.`);
      onChanged();
    } catch (err) {
      showError(err);
      throw err;
    }
  };

  const download = async () => {
    try {
      const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
      const snap = d.snapshot;
      await saveDiagramJson({
        diagramName: item.title,
        elements: snap.elements as DiagramElement[],
        connections: snap.connections as Connection[],
        styleConfig: snap.styleConfig as StyleConfig,
        transcript: (snap.transcript ?? null) as Transcript | null,
        notes: (snap.notes ?? []) as AnalyticNote[],
      });
    } catch (err) {
      showError(err);
    }
  };

  const trash = async () => {
    const ok = await confirmAsync({
      title: 'Move to trash',
      message: `Move "${item.title}" to the trash? Anyone in the group can restore it from the Trash tab.`,
      confirmLabel: 'Move to trash',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/api/diagrams/${item.id}`, { method: 'DELETE' });
      // Offered on every diagram; the server enforces the creator-or-admin
      // rule and a 403 surfaces via friendlyError.
      if (useCloudStore.getState().diagramId === item.id) useCloudStore.getState().clearCloudTarget();
      useToastStore.getState().addToast('info', `Moved "${item.title}" to the trash.`);
      onChanged();
    } catch (err) {
      showError(err);
    }
  };

  const menuItems: OptionsMenuItem[] = [
    { icon: Pencil, label: 'Rename', onClick: () => setRenameOpen(true) },
    { icon: FolderInput, label: 'Move to folder…', onClick: () => setMoveOpen(true) },
    { icon: Download, label: 'Download a copy', onClick: () => { void download(); } },
    { icon: Trash2, label: 'Move to trash', variant: 'danger', separatorBefore: true, onClick: () => { void trash(); } },
  ];

  const dialogs = (
    <>
      <NameModal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename diagram"
        label="Title"
        placeholder="Diagram title"
        initialValue={item.title}
        submitLabel="Save"
        onSubmit={rename}
      />
      <MoveToFolderModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        diagramTitle={item.title}
        currentFolderId={item.folderId ?? null}
        folders={folders}
        onMove={move}
      />
    </>
  );

  return { menuItems, dialogs };
}
