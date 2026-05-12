import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface ImageLightboxProps {
  imageData: string;
  elementLabel?: string;
  onClose: () => void;
}

export function ImageLightbox({ imageData, elementLabel, onClose }: ImageLightboxProps) {
  return (
    <Modal
      open
      onClose={onClose}
      scrim="dark"
      hideHeader
      size="xl"
      initialFocus="close"
    >
      <div className="relative" style={{ minHeight: '60vh' }}>
        {/* Top overlay bar */}
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
            data-modal-focus="close"
            aria-label="Close lightbox"
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'white' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.10)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Image */}
        <div className="flex items-center justify-center max-w-[90vw] max-h-[80vh] overflow-auto">
          <img
            src={imageData}
            alt={elementLabel || 'Full size image'}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        </div>

        {/* Bottom overlay bar */}
        <div
          className="absolute bottom-0 left-0 right-0 px-5 py-4 text-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Original image - full resolution
          </p>
        </div>
      </div>
    </Modal>
  );
}
