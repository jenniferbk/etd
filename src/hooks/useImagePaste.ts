import { useEffect, useCallback } from 'react';

interface UseImagePasteOptions {
  onImagePaste: (imageData: string) => void;
  enabled?: boolean;
}

export function useImagePaste({ onImagePaste, enabled = true }: UseImagePasteOptions) {
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      if (!enabled) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const blob = item.getAsFile();
          if (!blob) continue;

          // Validate size
          if (blob.size > 5 * 1024 * 1024) {
            alert('Image must be less than 5MB');
            return;
          }

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            onImagePaste(base64);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    },
    [enabled, onImagePaste]
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);
}
