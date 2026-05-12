import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { theme } from '../../utils/theme';

interface ImageLightboxProps {
  imageData: string;
  elementLabel?: string;
  onClose: () => void;
}

export function ImageLightbox({ imageData, elementLabel, onClose }: ImageLightboxProps) {
  // Close on escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)', zIndex: theme.z.lightbox }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      >
        <div>
          {elementLabel && (
            <h3 className="text-lg font-medium" style={{ color: 'white' }}>
              {elementLabel}
            </h3>
          )}
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Press Escape or click outside to close
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'white' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.10)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <X size={24} />
        </button>
      </div>

      {/* Image container */}
      <div className="max-w-[90vw] max-h-[80vh] overflow-auto">
        <img
          src={imageData}
          alt={elementLabel || 'Full size image'}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
      </div>

      {/* Footer */}
      <div
        className="absolute bottom-0 left-0 right-0 px-5 py-4 text-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      >
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Original image - full resolution
        </p>
      </div>
    </div>
  );
}
