import { theme } from '../../utils/theme';
import { useConfirmStore } from '../../store/confirmStore';
import { Modal } from './Modal';

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const resolve = useConfirmStore((s) => s.resolve);

  if (!request) return null;

  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
  } = request;

  const onCancel  = () => resolve(false);
  const onConfirm = () => resolve(true);

  const confirmStyle =
    variant === 'destructive'
      ? { backgroundColor: theme.button.danger.bg, color: theme.button.danger.text }
      : { backgroundColor: theme.button.primary.bg, color: theme.button.primary.text };

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      initialFocus={variant === 'destructive' ? 'cancel' : 'primary'}
      footer={
        <>
          <button
            onClick={onCancel}
            data-modal-focus="cancel"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={confirmStyle}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="px-5 py-4">
        <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.text }}>
          {message}
        </p>
      </div>
    </Modal>
  );
}
