import { useRef, useState, useCallback, useEffect } from 'react';
import { useDiagramStore } from '../../store';
import { importImage, type ImportResult } from '../../utils/imageImport';
import { theme } from '../../utils/theme';

const DISCLOSURE_ACK_KEY = 'etd-image-import-disclosure-acked-v1';

type ModalState =
  | { kind: 'disclosure' }
  | { kind: 'picker' }
  | { kind: 'loading'; abort: AbortController }
  | { kind: 'error'; result: ImportResult };

interface Props {
  open: boolean;
  onClose: () => void;
}

function errorMessage(result: ImportResult): string {
  switch (result.kind) {
    case 'image_too_large':
      return 'Image is too large (max 8 MB).';
    case 'rate_limited': {
      const hours = result.retryAfterSeconds ? Math.ceil(result.retryAfterSeconds / 3600) : null;
      return hours
        ? `Daily import limit reached. Resets in ~${hours} hour${hours === 1 ? '' : 's'}.`
        : 'Daily import limit reached. Try again later.';
    }
    case 'model_output_invalid':
      return "The model couldn't read this image clearly. Try a clearer photo or one with less glare.";
    case 'upstream_timeout':
      return 'Extraction timed out. Try a smaller image.';
    case 'bad_content_type':
      return 'Unsupported image format.';
    case 'network_error':
      return "Couldn't reach the import service. Check your connection and try again.";
    case 'empty_diagram':
      return 'No elements detected. Try a clearer photo.';
    case 'cancelled':
      return 'Cancelled.';
    case 'unknown_error':
    default:
      return 'Something went wrong. Try again.';
  }
}

export function ImageImportModal({ open, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadDiagram = useDiagramStore((s) => s.loadDiagram);

  const [state, setState] = useState<ModalState>(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem(DISCLOSURE_ACK_KEY)) {
      return { kind: 'picker' };
    }
    return { kind: 'disclosure' };
  });

  // Reset state when the modal is re-opened.
  useEffect(() => {
    if (open) {
      const acked = window.localStorage.getItem(DISCLOSURE_ACK_KEY);
      setState(acked ? { kind: 'picker' } : { kind: 'disclosure' });
    }
  }, [open]);

  const handleAck = useCallback(() => {
    window.localStorage.setItem(DISCLOSURE_ACK_KEY, '1');
    setState({ kind: 'picker' });
  }, []);

  const handleCancel = useCallback(() => {
    if (state.kind === 'loading') {
      state.abort.abort();
    }
    onClose();
  }, [state, onClose]);

  const handleFile = useCallback(async (file: File) => {
    const abort = new AbortController();
    setState({ kind: 'loading', abort });
    const result = await importImage(file, { signal: abort.signal });
    if (result.kind === 'ok') {
      loadDiagram(result.diagram.elements, result.diagram.connections, result.diagram.name, null);
      onClose();
    } else if (result.kind === 'cancelled') {
      setState({ kind: 'picker' });
    } else {
      setState({ kind: 'error', result });
    }
  }, [loadDiagram, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: theme.scrim, zIndex: theme.z.modalScrim }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-lg max-w-md w-full mx-4 p-6"
        style={{
          backgroundColor: theme.toolbar.bg,
          border: `1px solid ${theme.toolbar.border}`,
          boxShadow: theme.shadow.xl,
          zIndex: theme.z.modal,
        }}
      >
        {state.kind === 'disclosure' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Import diagram from image</h2>
            <p className="text-sm mb-3" style={{ color: theme.sidebar.text }}>
              This sends the image to Google Gemini for extraction. Don't import images that
              contain student PII you can't share with a third-party API.
            </p>
            <p className="text-sm mb-6" style={{ color: theme.sidebar.text }}>
              Extraction takes 10–30 seconds. The result loads into the editor and
              replaces any unsaved diagram — save first if you want to keep it.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{
                  backgroundColor: theme.button.secondary.bg,
                  color: theme.button.secondary.text,
                  border: `1px solid ${theme.button.secondary.border}`,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAck}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{
                  backgroundColor: theme.button.primary.bg,
                  color: theme.button.primary.text,
                }}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {state.kind === 'picker' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Import diagram from image</h2>
            <p className="text-sm mb-4" style={{ color: theme.sidebar.textSecondary }}>
              Choose a photo of a hand-drawn ETD diagram. Max 8 MB.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".heic,.jpg,.jpeg,.png,.webp"
              className="block w-full text-sm mb-4"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{
                  backgroundColor: theme.button.secondary.bg,
                  color: theme.button.secondary.text,
                  border: `1px solid ${theme.button.secondary.border}`,
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {state.kind === 'loading' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Extracting diagram from image…</h2>
            <p className="text-sm mb-4" style={{ color: theme.sidebar.textSecondary }}>This usually takes 10–30 seconds.</p>
            <div className="mb-4">
              <div
                className="h-1 w-full rounded overflow-hidden"
                style={{ backgroundColor: theme.sidebar.borderSubtle }}
              >
                <div
                  className="h-full animate-pulse w-1/2"
                  style={{ backgroundColor: theme.sidebar.accent }}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{
                  backgroundColor: theme.button.secondary.bg,
                  color: theme.button.secondary.text,
                  border: `1px solid ${theme.button.secondary.border}`,
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Import failed</h2>
            <p className="text-sm mb-6" style={{ color: theme.sidebar.text }}>{errorMessage(state.result)}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{
                  backgroundColor: theme.button.secondary.bg,
                  color: theme.button.secondary.text,
                  border: `1px solid ${theme.button.secondary.border}`,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => setState({ kind: 'picker' })}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{
                  backgroundColor: theme.button.primary.bg,
                  color: theme.button.primary.text,
                }}
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
