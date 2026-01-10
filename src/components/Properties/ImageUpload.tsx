import { useRef, useCallback } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { theme } from '../../utils/theme';

interface ImageUploadProps {
  currentImage: string | null | undefined;
  onImageChange: (imageData: string | null) => void;
}

export function ImageUpload({ currentImage, onImageChange }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
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
    [onImageChange]
  );

  const handleClear = useCallback(() => {
    onImageChange(null);
  }, [onImageChange]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-2">
      <label
        className="text-xs font-medium"
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
        <div className="relative">
          <img
            src={currentImage}
            alt="Element image"
            className="w-full h-24 object-contain rounded border"
            style={{ borderColor: theme.sidebar.border, backgroundColor: theme.sidebar.surface }}
          />
          <button
            onClick={handleClear}
            className="absolute top-1 right-1 p-1 rounded-full transition-colors"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            title="Remove image"
          >
            <X size={14} style={{ color: '#fff' }} />
          </button>
        </div>
      ) : (
        <button
          onClick={handleClick}
          className="w-full py-3 px-4 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center gap-2"
          style={{
            borderColor: theme.sidebar.border,
            color: theme.sidebar.muted,
          }}
        >
          <ImagePlus size={16} />
          <span className="text-xs">Add Image</span>
        </button>
      )}

      <p className="text-xs" style={{ color: theme.sidebar.muted }}>
        Or paste an image (Ctrl+V)
      </p>
    </div>
  );
}
