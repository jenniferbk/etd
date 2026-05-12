import { useRef, useCallback, useState } from 'react';
import { ImagePlus, X, Crop, Replace } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { ImageCropModal } from '../ImageEditor/ImageCropModal';
import type { CropArea } from '../../types';

interface ImageUploadProps {
  currentImage: string | null | undefined;
  onImageChange: (imageData: string | null) => void;
  currentCrop?: CropArea;
  onCropChange?: (cropArea: CropArea) => void;
  scale?: number;
  onScaleChange?: (scale: number) => void;
}

export function ImageUpload({
  currentImage,
  onImageChange,
  currentCrop,
  onCropChange,
  scale = 1,
  onScaleChange,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        addToast('error', 'Please select an image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        addToast('error', 'Image must be less than 5MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        onImageChange(base64);
      };
      reader.readAsDataURL(file);

      // Reset input
      e.target.value = '';
    },
    [onImageChange, addToast]
  );

  const handleClear = useCallback(() => {
    onImageChange(null);
  }, [onImageChange]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCropSave = useCallback(
    (cropArea: CropArea) => {
      onCropChange?.(cropArea);
      setShowCropModal(false);
    },
    [onCropChange]
  );

  return (
    <>
      <div className="space-y-2">
        <label
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: theme.sidebar.muted }}
        >
          Image
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {currentImage ? (
          <div className="space-y-2">
            <div className="relative group">
              <img
                src={currentImage}
                alt="Element image"
                className="w-full h-20 object-contain rounded-lg border"
                style={{ borderColor: theme.sidebar.border, backgroundColor: theme.sidebar.surface }}
              />
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.50)' }}
              >
                <button
                  onClick={() => setShowCropModal(true)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.20)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.30)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.20)'; }}
                  title="Crop image"
                >
                  <Crop size={14} style={{ color: '#fff' }} />
                </button>
                <button
                  onClick={handleClick}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.20)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.30)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.20)'; }}
                  title="Replace image"
                >
                  <Replace size={14} style={{ color: '#fff' }} />
                </button>
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.20)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(178, 58, 72, 0.50)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.20)'; }}
                  title="Remove image"
                >
                  <X size={14} style={{ color: '#fff' }} />
                </button>
              </div>
            </div>
            {currentCrop && (
              <p className="text-[10px]" style={{ color: theme.sidebar.muted }}>
                Cropped
              </p>
            )}
            {/* Image Scale Slider */}
            {onScaleChange && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px]" style={{ color: theme.sidebar.muted }}>
                    Scale
                  </label>
                  <span className="text-[10px] font-mono" style={{ color: theme.sidebar.textSecondary }}>
                    {Math.round(scale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round(scale * 100)}
                  onChange={(e) => onScaleChange(Number(e.target.value) / 100)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${theme.sidebar.accent} 0%, ${theme.sidebar.accent} ${(scale * 100 - 20) / 80 * 100}%, ${theme.sidebar.surface} ${(scale * 100 - 20) / 80 * 100}%, ${theme.sidebar.surface} 100%)`,
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleClick}
            className="w-full py-3 px-4 rounded-lg border-2 border-dashed transition-all flex items-center justify-center gap-2"
            style={{
              borderColor: theme.sidebar.border,
              color: theme.sidebar.muted,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.sidebar.accent;
              e.currentTarget.style.backgroundColor = theme.colors.accent[50];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.sidebar.border;
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <ImagePlus size={16} />
            <span className="text-xs">Add Image</span>
          </button>
        )}

        <p className="text-[10px]" style={{ color: theme.sidebar.muted }}>
          {currentImage ? 'Drag image to reposition' : 'Paste: Ctrl+V'}
        </p>
      </div>

      {showCropModal && currentImage && (
        <ImageCropModal
          imageData={currentImage}
          currentCrop={currentCrop}
          onSave={handleCropSave}
          onCancel={() => setShowCropModal(false)}
        />
      )}
    </>
  );
}
