import { useRef, useState, useCallback, useEffect } from 'react';
import { useDiagramStore } from '../../store';
import { importImage, type ImportResult } from '../../utils/imageImport';
import { theme } from '../../utils/theme';
import { Modal } from '../ui/Modal';

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

  const titleByState: Record<ModalState['kind'], string> = {
    disclosure: 'Import diagram from image',
    picker:     'Import diagram from image',
    loading:    'Extracting diagram from image…',
    error:      'Import failed',
  };

  const initialFocusByState: Record<ModalState['kind'], 'primary' | 'cancel'> = {
    disclosure: 'primary',
    picker:     'primary',
    loading:    'cancel',
    error:      'primary',
  };

  const renderBody = () => {
    switch (state.kind) {
      case 'disclosure':
        return (
          <>
            <p className="text-sm mb-3" style={{ color: theme.sidebar.text }}>
              This sends the image to Google Gemini for extraction. Don't import images that
              contain student PII you can't share with a third-party API.
            </p>
            <p className="text-sm" style={{ color: theme.sidebar.text }}>
              Extraction takes 10–30 seconds. The result loads into the editor and
              replaces any unsaved diagram — save first if you want to keep it.
            </p>
          </>
        );
      case 'picker':
        return (
          <>
            <p className="text-sm mb-4" style={{ color: theme.sidebar.textSecondary }}>
              Choose a photo of a hand-drawn ETD diagram. Max 8 MB.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".heic,.jpg,.jpeg,.png,.webp"
              className="block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </>
        );
      case 'loading':
        return (
          <>
            <p className="text-sm mb-4" style={{ color: theme.sidebar.textSecondary }}>This usually takes 10–30 seconds.</p>
            <div>
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
          </>
        );
      case 'error':
        return (
          <p className="text-sm" style={{ color: theme.sidebar.text }}>{errorMessage(state.result)}</p>
        );
    }
  };

  const renderFooter = () => {
    switch (state.kind) {
      case 'disclosure':
        return (
          <>
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
              data-modal-focus="primary"
              style={{
                backgroundColor: theme.button.primary.bg,
                color: theme.button.primary.text,
              }}
            >
              Continue →
            </button>
          </>
        );
      case 'picker':
        return (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg"
            data-modal-focus="primary"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            Cancel
          </button>
        );
      case 'loading':
        return (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm rounded-lg"
            data-modal-focus="cancel"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            Cancel
          </button>
        );
      case 'error':
        return (
          <>
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
              data-modal-focus="primary"
              style={{
                backgroundColor: theme.button.primary.bg,
                color: theme.button.primary.text,
              }}
            >
              Try again
            </button>
          </>
        );
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title={titleByState[state.kind]}
      size="md"
      initialFocus={initialFocusByState[state.kind]}
      footer={renderFooter()}
    >
      <div className="px-5 py-4">
        {renderBody()}
      </div>
    </Modal>
  );
}
