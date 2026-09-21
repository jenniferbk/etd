import { useMemo } from 'react';
import { PanelRightClose, StickyNote } from 'lucide-react';
import { useDiagramStore } from '../../store';
import { useAuthStore } from '../../api/authStore';
import { confirmAsync } from '../../store/confirmStore';
import { theme } from '../../utils/theme';
import { describeAnchor, resolveAnchor, selectionAnchor } from '../../utils/noteAnchors';
import { NoteComposer } from './NoteComposer';
import { NoteRow } from './NoteRow';
import type { AnalyticNote, NoteAnchor } from '../../types';

/** Right-side panel (mirrors HistoryPanel's conventions) for analytic notes.
 *  Notes live in diagramStore.notes and save with the diagram. App renders
 *  this inside the wrapper that goes `inert` during version preview, so the
 *  panel is read-only there without any extra handling here. */
export function NotesPanel() {
  const notes = useDiagramStore((s) => s.notes);
  const elements = useDiagramStore((s) => s.elements);
  const connections = useDiagramStore((s) => s.connections);
  const selectedIds = useDiagramStore((s) => s.selectedIds);
  const addNote = useDiagramStore((s) => s.addNote);
  const updateNoteText = useDiagramStore((s) => s.updateNoteText);
  const removeNote = useDiagramStore((s) => s.removeNote);
  const setSelectedIds = useDiagramStore((s) => s.setSelectedIds);
  const setNotesPanelOpen = useDiagramStore((s) => s.setNotesPanelOpen);
  const displayName = useAuthStore((s) => s.user?.displayName);

  const selection = useMemo(
    () => selectionAnchor(selectedIds, elements, connections),
    [selectedIds, elements, connections],
  );
  const selectionLabel = useMemo(
    () => (selection ? describeAnchor(selection, elements, connections) : null),
    [selection, elements, connections],
  );

  // Newest first; the selection's own notes are pulled into a leading section.
  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notes],
  );
  const onSelection = selection ? sorted.filter((n) => n.anchor?.id === selection.id) : [];
  const others = selection ? sorted.filter((n) => n.anchor?.id !== selection.id) : sorted;

  const handleAdd = (text: string, anchor: NoteAnchor | undefined) => {
    addNote({ text, anchor, author: displayName ?? undefined });
  };

  const handleDelete = async (note: AnalyticNote) => {
    const ok = await confirmAsync({
      title: 'Delete note?',
      message: 'This note will be removed from the diagram. Deleting a note cannot be undone.',
      confirmLabel: 'Delete note',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (ok) removeNote(note.id);
  };

  const renderRow = (note: AnalyticNote) => (
    <NoteRow
      key={note.id}
      note={note}
      resolved={resolveAnchor(note, elements, connections)}
      onSelectAnchor={() => {
        if (note.anchor) setSelectedIds([note.anchor.id]);
      }}
      onSave={(text) => updateNoteText(note.id, text)}
      onDelete={() => void handleDelete(note)}
    />
  );

  const sectionHeading = (label: string) => (
    <div
      className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: theme.sidebar.textSecondary }}
    >
      {label}
    </div>
  );

  return (
    <div
      className="w-72 border-l flex flex-col"
      style={{ background: theme.sidebar.bgGradient, borderColor: theme.sidebar.border }}
    >
      <div
        className="px-5 py-3 border-b flex items-center justify-between gap-2"
        style={{ borderColor: theme.sidebar.border }}
      >
        <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: theme.sidebar.text }}>
          Notes
          {notes.length > 0 && (
            <span className="ml-2 font-normal" style={{ color: theme.sidebar.textSecondary }}>
              {notes.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setNotesPanelOpen(false)}
          className="p-1 rounded transition-colors duration-150"
          title="Hide notes panel"
          aria-label="Hide notes panel"
          style={{ color: theme.sidebar.textSecondary }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <NoteComposer selection={selection} selectionLabel={selectionLabel} onAdd={handleAdd} />

      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center gap-3">
            <StickyNote size={28} aria-hidden="true" style={{ color: theme.sidebar.muted }} />
            <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.textSecondary }}>
              No notes yet. Notes save with the diagram and never appear in exports.
            </p>
          </div>
        )}

        {onSelection.length > 0 && (
          <>
            {sectionHeading(`On ${selectionLabel ?? 'selection'}`)}
            {onSelection.map(renderRow)}
          </>
        )}

        {others.length > 0 && (
          <>
            {onSelection.length > 0 && sectionHeading('All notes')}
            {others.map(renderRow)}
          </>
        )}
      </div>
    </div>
  );
}
