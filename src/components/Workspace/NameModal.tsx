import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { theme } from '../../utils/theme';

interface NameModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  placeholder: string;
  initialValue: string;
  submitLabel: string;
  /** Rejects to keep the dialog open (the caller shows the error). */
  onSubmit: (value: string) => Promise<void>;
}

/** One-field dialog for naming things: rename diagram, new/rename folder. */
export function NameModal({
  open, onClose, title, label, placeholder, initialValue, submitLabel, onSubmit,
}: NameModalProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const disabled = busy || !value.trim();

  const submit = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch {
      // The caller has already shown a toast; leave the dialog open.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
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
            {busy ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <div className="px-5 py-4">
        <label className="text-sm font-medium" style={{ color: theme.sidebar.text }}>
          {label}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !disabled) {
                e.preventDefault();
                void submit();
              }
            }}
            className="mt-1.5 px-3 py-2 text-sm font-normal border rounded-lg w-full transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: theme.input.bg,
              borderColor: theme.input.border,
              color: theme.input.text,
              outlineColor: theme.focus.ring,
            }}
            placeholder={placeholder}
          />
        </label>
      </div>
    </Modal>
  );
}
