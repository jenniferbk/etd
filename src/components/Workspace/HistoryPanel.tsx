import { useEffect, useRef, useState } from 'react';
import { PanelRightClose, Clock } from 'lucide-react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { confirmAsync } from '../../store/confirmStore';
import { saveToLibrary } from '../../hooks/librarySave';
import { theme } from '../../utils/theme';
import { relativeTime } from '../../utils/relativeTime';
import type { DiagramVersionListItem, DiagramVersion } from '../../api/types';
import type { Connection, DiagramElement, StyleConfig, Transcript } from '../../types';

/** Right-side panel (mirrors TranscriptPanel's conventions) listing a
 *  diagram's saved versions. Clicking a row loads that version read-only
 *  (cloudStore.preview) — Restore/Back-to-current live in PreviewBanner.
 *  Kept interactive while the rest of the canvas is pointer-events: none
 *  during preview (see App.tsx). */
export function HistoryPanel() {
  const diagramId = useCloudStore((s) => s.diagramId);
  const baseVersionId = useCloudStore((s) => s.baseVersionId);
  const preview = useCloudStore((s) => s.preview);

  const [versions, setVersions] = useState<DiagramVersionListItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestSeqRef = useRef(0);
  const [busyVersionId, setBusyVersionId] = useState<number | null>(null);

  // Fetch on mount (the panel only exists while historyOpen is true) and
  // again whenever baseVersionId changes — that covers both a normal save
  // and a Restore while the panel stays open, so the list (and the Current
  // tag) reflect the newly created version without a manual refresh.
  useEffect(() => {
    if (diagramId === null) {
      setVersions([]);
      return;
    }
    const seq = ++requestSeqRef.current;
    setLoadFailed(false);
    void (async () => {
      try {
        const list = await api<DiagramVersionListItem[]>(`/api/diagrams/${diagramId}/versions`);
        if (requestSeqRef.current !== seq) return; // stale — a newer fetch superseded this one
        setVersions(list);
      } catch (err) {
        if (requestSeqRef.current !== seq) return;
        setLoadFailed(true);
        // Unblock the error branch below (it's gated on `versions !== null`) —
        // without this, a first-load failure leaves versions at its initial
        // null and the panel is stuck on "Loading…" forever (final-review Fix 3).
        setVersions([]);
        useToastStore.getState().addToast('error', friendlyError(err));
      }
    })();
  }, [diagramId, baseVersionId]);

  const loadVersion = async (item: DiagramVersionListItem) => {
    if (diagramId === null) return;
    setBusyVersionId(item.id);
    try {
      const version = await api<DiagramVersion>(`/api/diagrams/${diagramId}/versions/${item.id}`);
      const snap = version.snapshot;
      // Set preview BEFORE loadDiagram: startDirtyTracking's guard reads
      // cloudStore.preview synchronously when loadDiagram's mutation fires,
      // so preview must already be non-null at that point or the load would
      // incorrectly flip the diagram to 'dirty'.
      useCloudStore.getState().setPreview({ versionId: version.id, createdAt: version.createdAt });
      useDiagramStore.getState().loadDiagram(
        snap.elements as DiagramElement[],
        snap.connections as Connection[],
        snap.name,
        (snap.transcript ?? null) as Transcript | null,
        snap.styleConfig as StyleConfig | undefined,
      );
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    } finally {
      setBusyVersionId(null);
    }
  };

  const handleRowClick = async (item: DiagramVersionListItem) => {
    if (busyVersionId !== null) return;

    // Already previewing another version — just switch, nothing unsaved to lose.
    if (preview !== null) {
      await loadVersion(item);
      return;
    }

    const status = useCloudStore.getState().status;
    const d = useDiagramStore.getState();
    const hasContent = d.elements.length > 0 || d.connections.length > 0 || d.transcript !== null;
    const needsSaveFirst =
      status === 'dirty' || status === 'offline' || (status === 'notInLibrary' && hasContent);

    if (needsSaveFirst) {
      const proceed = await confirmAsync({
        title: 'Save before viewing?',
        message: 'Save your changes before viewing an old version? Unsaved changes would otherwise be lost.',
        confirmLabel: 'Save',
        cancelLabel: 'Stay',
      });
      if (!proceed) return;
      await saveToLibrary();
      if (useCloudStore.getState().status !== 'saved') return;
    }

    await loadVersion(item);
  };

  const handleClose = () => useCloudStore.getState().setHistoryOpen(false);

  return (
    <div
      className="w-72 border-l flex flex-col"
      style={{
        background: theme.sidebar.bgGradient,
        borderColor: theme.sidebar.border,
        pointerEvents: 'auto',
      }}
    >
      <div className="px-5 py-3 border-b flex items-center justify-between gap-2" style={{ borderColor: theme.sidebar.border }}>
        <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: theme.sidebar.text }}>
          History
        </h2>
        <button
          onClick={handleClose}
          className="p-1 rounded transition-colors duration-150"
          title="Hide history panel"
          aria-label="Hide history panel"
          style={{ color: theme.sidebar.textSecondary }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {versions === null && (
          <div className="px-5 py-6 text-center text-sm" style={{ color: theme.sidebar.textSecondary }}>
            Loading…
          </div>
        )}

        {versions !== null && versions.length === 0 && !loadFailed && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-3">
            <Clock size={28} aria-hidden="true" style={{ color: theme.sidebar.muted }} />
            <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.textSecondary }}>
              No saved versions yet.
            </p>
          </div>
        )}

        {versions !== null && versions.length === 0 && loadFailed && (
          <div className="px-5 py-6 text-center text-sm" style={{ color: theme.sidebar.textSecondary }}>
            Couldn't load version history.
          </div>
        )}

        {versions !== null && versions.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void handleRowClick(item)}
            disabled={busyVersionId !== null}
            className="w-full text-left p-3 transition-colors duration-100 block disabled:opacity-60 disabled:cursor-wait"
            style={{
              backgroundColor: idx % 2 === 1 ? theme.sidebar.hover : theme.sidebar.surface,
              borderBottom: `1px solid ${theme.sidebar.border}`,
              borderLeft: preview?.versionId === item.id ? `3px solid ${theme.sidebar.accent}` : '3px solid transparent',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm truncate" style={{ color: theme.sidebar.text }}>
                {item.author}
              </span>
              {item.isCurrent && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 px-1.5 py-0.5 rounded"
                  style={{ color: theme.sidebar.accentText, backgroundColor: theme.sidebar.accent }}
                >
                  Current
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: theme.sidebar.textSecondary }}>
              {relativeTime(item.createdAt)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
