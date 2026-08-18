import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../api/client';
import { useAuthStore } from '../../api/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { useDiagramStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { buildCloudSnapshot } from '../../utils/buildCloudSnapshot';

export const SAVE_REMINDER =
  'Reminder: only de-identified data may be saved to the shared library.';

interface CloudSaveDialogProps {
  open: boolean;
  onClose: () => void;
}

const inputClassName =
  'px-3 py-2 text-sm border rounded-lg w-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const labelClassName = 'text-sm font-medium';

export function CloudSaveDialog({ open, onClose }: CloudSaveDialogProps) {
  const groups = useAuthStore((s) => s.groups);
  const [title, setTitle] = useState(() => useDiagramStore.getState().diagramName);
  const [groupId, setGroupId] = useState<number>(groups[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);

  // Resync on every open, not just at mount — the dialog is rendered
  // unconditionally (only `open` toggles), so without this a rename or a
  // file load between opens would otherwise leave a stale title/group.
  useEffect(() => {
    if (open) {
      setTitle(useDiagramStore.getState().diagramName);
      setGroupId(groups[0]?.id ?? 0);
    }
  }, [open, groups]);

  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };
  const labelStyle = { color: theme.sidebar.text };

  const handleSave = async () => {
    setBusy(true);
    try {
      const snapshot = buildCloudSnapshot(title);
      const res = await api<{ id: number; currentVersionId: number }>('/api/diagrams', {
        method: 'POST',
        body: { groupId, title, snapshot },
      });
      useCloudStore.getState().setCloudTarget(res.id, groupId);
      useToastStore.getState().addToast('info', 'Saved to cloud');
      onClose();
    } catch (err) {
      useToastStore.getState().addToast('error', err instanceof Error ? err.message : 'cloud save failed');
    } finally {
      setBusy(false);
    }
  };

  const saveDisabled = busy || !title.trim();

  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !saveDisabled) {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save to cloud"
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
            onClick={() => void handleSave()}
            disabled={saveDisabled}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="px-5 py-4 space-y-4">
        {groups.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClassName} style={labelStyle}>
              Group
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(Number(e.target.value))}
              className={`${inputClassName} cursor-pointer`}
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

        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} style={labelStyle}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            className={inputClassName}
            style={inputStyle}
            placeholder="Diagram title"
          />
        </div>

        <p className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
          {SAVE_REMINDER}
        </p>
      </div>
    </Modal>
  );
}
