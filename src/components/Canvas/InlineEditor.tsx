import { useEffect, useRef, useCallback } from 'react';
import { theme } from '../../utils/theme';

interface InlineEditorProps {
  elementId: string;
  content: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zoom: number;
  panX: number;
  panY: number;
  onSave: (id: string, content: string) => void;
  onCancel: () => void;
}

export function InlineEditor({
  elementId,
  content,
  position,
  size,
  zoom,
  panX,
  panY,
  onSave,
  onCancel,
}: InlineEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Calculate screen position
  const screenX = position.x * zoom + panX;
  const screenY = position.y * zoom + panY;
  const screenWidth = size.width * zoom;
  const screenHeight = size.height * zoom;

  // Focus and select all text on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (textareaRef.current) {
          onSave(elementId, textareaRef.current.value);
        }
      }
    },
    [elementId, onSave, onCancel]
  );

  // Handle blur (clicking outside)
  const handleBlur = useCallback(() => {
    if (textareaRef.current) {
      onSave(elementId, textareaRef.current.value);
    }
  }, [elementId, onSave]);

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: screenX,
        top: screenY,
        width: screenWidth,
        height: screenHeight,
        zIndex: 1000,
      }}
    >
      <textarea
        ref={textareaRef}
        defaultValue={content}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="w-full h-full p-3 text-sm resize-none border-2 rounded-lg outline-none"
        style={{
          backgroundColor: theme.input.bgFocus,
          borderColor: theme.colors.accent[500],
          color: theme.input.text,
          boxShadow: `0 0 0 4px ${theme.input.ring}, 0 4px 12px rgba(0,0,0,0.3)`,
        }}
        placeholder="Enter content..."
      />
      <div
        className="absolute -bottom-8 left-0 text-xs px-2 py-1 rounded"
        style={{
          backgroundColor: theme.sidebar.surface,
          color: theme.sidebar.textSecondary,
          border: `1px solid ${theme.sidebar.border}`,
        }}
      >
        Ctrl+Enter to save · Esc to cancel
      </div>
    </div>
  );
}
