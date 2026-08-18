import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { friendlyError } from '../../api/friendlyError';
import type { CloudDiagram, DiagramListItem } from '../../api/types';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { importDrawingFile } from '../../utils/drawingImporter';
import type { Connection, DiagramElement, StyleConfig, Transcript } from '../../types';
import { WorkspaceHeader } from './WorkspaceHeader';
import { DiagramCard } from './DiagramCard';

/** Card-gallery home view — the landing page for a signed-in user, before
 *  they've opened any particular diagram onto the canvas. App renders this
 *  when cloudStore.view === 'workspace' and a user exists.
 *
 *  Data logic (effectiveGroupId defaulting + requestSeq stale-response guard)
 *  is ported verbatim in behavior from the now-removed Cloud/LibraryModal.tsx. */
export function Workspace() {
  const groups = useAuthStore((s) => s.groups);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [items, setItems] = useState<DiagramListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const effectiveGroupId = groupId ?? groups[0]?.id ?? null;
  // Guards against a stale response (e.g. group A's request resolving after
  // group B's, once the user has already switched groups) overwriting the
  // list with out-of-date data. Only the most recently issued request may
  // call setItems / toast.
  const requestSeq = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (effectiveGroupId === null) return;
    const seq = ++requestSeq.current;
    setItems(null);
    setLoadError(false);
    try {
      const result = await api<DiagramListItem[]>(`/api/groups/${effectiveGroupId}/diagrams`);
      if (seq === requestSeq.current) setItems(result);
    } catch (err) {
      if (seq === requestSeq.current) {
        useToastStore.getState().addToast('error', friendlyError(err));
        setItems([]);
        setLoadError(true);
      }
    }
  }, [effectiveGroupId]);

  // Fetch on mount and whenever the effective group changes.
  useEffect(() => {
    void (async () => { await refresh(); })();
  }, [refresh]);

  const handleNewDiagram = () => {
    useDiagramStore.getState().clearDiagram();
    useCloudStore.getState().clearCloudTarget();
    useCloudStore.getState().setView('canvas');
  };

  const handleOpenFileClick = () => {
    fileInputRef.current?.click();
  };

  // Mirrors Toolbar.tsx's handleFileChange (same JSON.parse → shape check →
  // loadDiagram → clearCloudTarget flow, and the same .drawing importer
  // call), plus the view switch back to the canvas once a file is loaded.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Handle .drawing files (DiagramMix binary plist)
      if (file.name.endsWith('.drawing')) {
        const result = await importDrawingFile(file);
        useDiagramStore.getState().loadDiagram(result.elements, result.connections, result.name, null);
        useCloudStore.getState().clearCloudTarget();
        useCloudStore.getState().setView('canvas');
        e.target.value = '';
        return;
      }

      // Handle .json files
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.elements && data.connections) {
            useDiagramStore.getState().loadDiagram(
              data.elements, data.connections, data.name, data.transcript ?? null, data.styleConfig,
            );
            useCloudStore.getState().clearCloudTarget();
            useCloudStore.getState().setView('canvas');
          } else {
            useToastStore.getState().addToast('error', 'Invalid diagram file format');
          }
        } catch {
          useToastStore.getState().addToast('error', 'Failed to parse diagram file');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
    // Reset input so same file can be loaded again
    e.target.value = '';
  };

  const openDiagram = async (item: DiagramListItem) => {
    try {
      const d = await api<CloudDiagram>(`/api/diagrams/${item.id}`);
      const snap = d.snapshot;
      if (!snap.elements || !snap.connections) {
        useToastStore.getState().addToast('error', 'That diagram looks corrupted — ask your group admin.');
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
      useCloudStore.getState().setView('canvas');
    } catch (err) {
      useToastStore.getState().addToast('error', friendlyError(err));
    }
  };

  const selectedGroup = groups.find((g) => g.id === effectiveGroupId) ?? null;

  const primaryButtonStyle = { backgroundColor: theme.button.primary.bg, color: theme.button.primary.text };
  const secondaryButtonStyle = {
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  };

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: theme.canvas.bg }}>
      <WorkspaceHeader
        groupName={selectedGroup?.name ?? ''}
        groups={groups}
        selectedGroupId={effectiveGroupId}
        onSelectGroup={setGroupId}
      />

      <div className="max-w-5xl w-full mx-auto px-6 py-8 flex-1">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={handleNewDiagram}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={primaryButtonStyle}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.primary.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.primary.bg; }}
          >
            ＋ New diagram
          </button>
          <button
            onClick={handleOpenFileClick}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={secondaryButtonStyle}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
          >
            Open a file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.drawing"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
        </div>

        {items === null ? (
          <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
            Loading your diagrams…
          </p>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
              Something went wrong loading your diagrams.
            </p>
            <button
              onClick={() => void refresh()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={secondaryButtonStyle}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.button.secondary.bg; }}
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm py-16 text-center" style={{ color: theme.sidebar.textSecondary }}>
            No diagrams yet — create the first one.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <DiagramCard
                key={item.id}
                item={item}
                onOpen={() => void openDiagram(item)}
                onChanged={() => void refresh()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
