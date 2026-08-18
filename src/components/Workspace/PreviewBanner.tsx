import { useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { saveToLibrary } from '../../hooks/librarySave';
import { theme } from '../../utils/theme';
import type { CloudDiagram } from '../../api/types';
import type { Connection, DiagramElement, StyleConfig, Transcript } from '../../types';

function formatPreviewDate(iso: string): string {
  return new Date(iso + 'Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Rendered under CanvasHeader whenever cloudStore.preview is set — the
 *  canvas is showing a read-only past version instead of the live diagram.
 *  Byte-exact copy per the Task 5 brief; keep it that way. */
export function PreviewBanner() {
  const preview = useCloudStore((s) => s.preview);
  const [busy, setBusy] = useState(false);

  if (!preview) return null;

  const handleRestore = async () => {
    setBusy(true);
    try {
      // The canvas already holds the previewed snapshot — saveToLibrary PUTs
      // exactly that. baseVersionId still points at the real head, so a
      // concurrent teammate save is still caught by the normal 409/Conflict
      // flow (intentional — see Task 5 brief).
      await saveToLibrary();
      if (useCloudStore.getState().status === 'saved') {
        useCloudStore.getState().setPreview(null);
        useToastStore.getState().addToast('info', 'Restored — the previous version is still in history.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleBackToCurrent = async () => {
    setBusy(true);
    try {
      const cloud = useCloudStore.getState();
      if (cloud.diagramId === null) {
        cloud.setPreview(null);
        return;
      }
      const d = await api<CloudDiagram>(`/api/diagrams/${cloud.diagramId}`);
      const snap = d.snapshot;
      useDiagramStore.getState().loadDiagram(
        snap.elements as DiagramElement[],
        snap.connections as Connection[],
        snap.name,
        (snap.transcript ?? null) as Transcript | null,
        snap.styleConfig as StyleConfig | undefined,
      );
      // setCloudTarget sets status back to 'saved' in one step — cleanest
      // way to land back on the editable head. preview is cleared last so
      // the dirty-tracking guard (gated on cloudStore.preview) is still
      // active while loadDiagram's mutation fires above.
      useCloudStore.getState().setCloudTarget(d.id, d.groupId, d.currentVersionId);
      useCloudStore.getState().setPreview(null);
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="flex items-center gap-3 px-5 py-2"
      style={{
        backgroundColor: theme.toolbar.bg,
        borderBottom: `1px solid ${theme.sidebar.border}`,
        borderLeft: `3px solid ${theme.sidebar.accent}`,
        boxShadow: theme.toolbar.shadow,
      }}
    >
      <History size={16} style={{ color: theme.sidebar.accent, flexShrink: 0 }} aria-hidden />
      <p className="text-sm flex-1" style={{ color: theme.sidebar.text }}>
        {`Viewing the version from ${formatPreviewDate(preview.createdAt)} — `}
      </p>
      <button
        onClick={() => void handleRestore()}
        disabled={busy}
        className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text, outlineColor: theme.focus.ring }}
      >
        Restore
      </button>
      <button
        onClick={() => void handleBackToCurrent()}
        disabled={busy}
        className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: theme.button.secondary.bg,
          color: theme.button.secondary.text,
          border: `1px solid ${theme.button.secondary.border}`,
          outlineColor: theme.focus.ring,
        }}
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
      >
        Back to current
      </button>
    </div>
  );
}
