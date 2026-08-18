import { useEffect, useRef, useState } from 'react';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';

const COPIED_LABEL_MS = 2000;

interface CopyLinkFieldProps {
  link: string;
}

/** Read-only link display + a "Copy link" button, shared by InviteDialog and
 *  ResetLinkDialog. Copies via the clipboard API; the button's own label
 *  flips to "Copied ✓" for ~2s on success. Clipboard rejection (permissions,
 *  insecure context, etc.) surfaces as an error toast instead of failing
 *  silently — the field stays selectable so the admin can copy by hand. */
export function CopyLinkField({ link }: CopyLinkFieldProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  // Clear any pending "revert to Copy link" timer on unmount so it doesn't
  // fire setState after the field is gone.
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), COPIED_LABEL_MS);
    } catch {
      useToastStore.getState().addToast('error', "Couldn't copy — select the link and copy it manually.");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 min-w-0 px-3 py-2 text-sm border rounded-lg font-mono"
        style={{
          backgroundColor: theme.input.bg,
          borderColor: theme.input.border,
          color: theme.input.text,
        }}
      />
      <button
        onClick={() => void handleCopy()}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
        style={{
          backgroundColor: theme.button.secondary.bg,
          color: theme.button.secondary.text,
          border: `1px solid ${theme.button.secondary.border}`,
        }}
      >
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
    </div>
  );
}
