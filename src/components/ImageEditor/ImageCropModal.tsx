import { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw, Check, Lock, Unlock } from 'lucide-react';
import { theme } from '../../utils/theme';
import { Modal } from '../ui/Modal';
import type { CropArea } from '../../types';

interface ImageCropModalProps {
  imageData: string;
  currentCrop?: CropArea;
  onSave: (cropArea: CropArea) => void;
  onCancel: () => void;
}

export function ImageCropModal({
  imageData,
  currentCrop,
  onSave,
  onCancel,
}: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<'move' | 'resize' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [lockAspectRatio, setLockAspectRatio] = useState(false);

  // Crop area in 0-1 coordinates
  const [crop, setCrop] = useState<CropArea>(
    currentCrop || { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
  );

  // Canvas display dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 });

  // Load image
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      setImage(img);

      // Calculate canvas size to fit container while maintaining aspect ratio
      const maxWidth = 700;
      const maxHeight = 500;
      const aspectRatio = img.width / img.height;

      let width = maxWidth;
      let height = width / aspectRatio;

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      setCanvasSize({ width, height });
    };
    img.src = imageData;
  }, [imageData]);

  // Draw canvas
  useEffect(() => {
    if (!image || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Draw image
    ctx.drawImage(image, 0, 0, canvasSize.width, canvasSize.height);

    // Draw dark overlay outside crop area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

    const cropX = crop.x * canvasSize.width;
    const cropY = crop.y * canvasSize.height;
    const cropW = crop.width * canvasSize.width;
    const cropH = crop.height * canvasSize.height;

    // Top
    ctx.fillRect(0, 0, canvasSize.width, cropY);
    // Bottom
    ctx.fillRect(0, cropY + cropH, canvasSize.width, canvasSize.height - cropY - cropH);
    // Left
    ctx.fillRect(0, cropY, cropX, cropH);
    // Right
    ctx.fillRect(cropX + cropW, cropY, canvasSize.width - cropX - cropW, cropH);

    // Draw crop border
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);

    // Draw corner handles
    const handleSize = 10;
    ctx.fillStyle = '#60a5fa';

    // Top-left
    ctx.fillRect(cropX - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize);
    // Top-right
    ctx.fillRect(cropX + cropW - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize);
    // Bottom-left
    ctx.fillRect(cropX - handleSize / 2, cropY + cropH - handleSize / 2, handleSize, handleSize);
    // Bottom-right
    ctx.fillRect(cropX + cropW - handleSize / 2, cropY + cropH - handleSize / 2, handleSize, handleSize);

    // Draw rule of thirds guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(cropX + cropW / 3, cropY);
    ctx.lineTo(cropX + cropW / 3, cropY + cropH);
    ctx.moveTo(cropX + (cropW * 2) / 3, cropY);
    ctx.lineTo(cropX + (cropW * 2) / 3, cropY + cropH);
    // Horizontal lines
    ctx.moveTo(cropX, cropY + cropH / 3);
    ctx.lineTo(cropX + cropW, cropY + cropH / 3);
    ctx.moveTo(cropX, cropY + (cropH * 2) / 3);
    ctx.lineTo(cropX + cropW, cropY + (cropH * 2) / 3);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [image, canvasSize, crop]);

  const getMousePos = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / canvasSize.width,
        y: (e.clientY - rect.top) / canvasSize.height,
      };
    },
    [canvasSize]
  );

  const getHandle = useCallback(
    (pos: { x: number; y: number }) => {
      const threshold = 0.02;
      const { x, y, width, height } = crop;

      const nearLeft = Math.abs(pos.x - x) < threshold;
      const nearRight = Math.abs(pos.x - (x + width)) < threshold;
      const nearTop = Math.abs(pos.y - y) < threshold;
      const nearBottom = Math.abs(pos.y - (y + height)) < threshold;

      if (nearTop && nearLeft) return 'nw';
      if (nearTop && nearRight) return 'ne';
      if (nearBottom && nearLeft) return 'sw';
      if (nearBottom && nearRight) return 'se';

      return null;
    },
    [crop]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const pos = getMousePos(e);
      const handle = getHandle(pos);

      if (handle) {
        setIsDragging(true);
        setDragType('resize');
        setResizeHandle(handle);
        setDragStart(pos);
      } else if (
        pos.x >= crop.x &&
        pos.x <= crop.x + crop.width &&
        pos.y >= crop.y &&
        pos.y <= crop.y + crop.height
      ) {
        setIsDragging(true);
        setDragType('move');
        setDragStart(pos);
      }
    },
    [getMousePos, getHandle, crop]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) {
        // Update cursor based on position
        const pos = getMousePos(e);
        const handle = getHandle(pos);
        if (handle) {
          const cursors: Record<string, string> = {
            nw: 'nw-resize',
            ne: 'ne-resize',
            sw: 'sw-resize',
            se: 'se-resize',
          };
          (e.currentTarget as HTMLElement).style.cursor = cursors[handle];
        } else if (
          pos.x >= crop.x &&
          pos.x <= crop.x + crop.width &&
          pos.y >= crop.y &&
          pos.y <= crop.y + crop.height
        ) {
          (e.currentTarget as HTMLElement).style.cursor = 'move';
        } else {
          (e.currentTarget as HTMLElement).style.cursor = 'crosshair';
        }
        return;
      }

      const pos = getMousePos(e);
      const deltaX = pos.x - dragStart.x;
      const deltaY = pos.y - dragStart.y;

      if (dragType === 'move') {
        setCrop((prev) => ({
          ...prev,
          x: Math.max(0, Math.min(1 - prev.width, prev.x + deltaX)),
          y: Math.max(0, Math.min(1 - prev.height, prev.y + deltaY)),
        }));
        setDragStart(pos);
      } else if (dragType === 'resize' && resizeHandle) {
        setCrop((prev) => {
          let newCrop = { ...prev };

          if (resizeHandle.includes('w')) {
            const newX = Math.max(0, Math.min(prev.x + prev.width - 0.05, prev.x + deltaX));
            const newWidth = prev.x + prev.width - newX;
            newCrop.x = newX;
            newCrop.width = newWidth;
          }
          if (resizeHandle.includes('e')) {
            newCrop.width = Math.max(0.05, Math.min(1 - prev.x, prev.width + deltaX));
          }
          if (resizeHandle.includes('n')) {
            const newY = Math.max(0, Math.min(prev.y + prev.height - 0.05, prev.y + deltaY));
            const newHeight = prev.y + prev.height - newY;
            newCrop.y = newY;
            newCrop.height = newHeight;
          }
          if (resizeHandle.includes('s')) {
            newCrop.height = Math.max(0.05, Math.min(1 - prev.y, prev.height + deltaY));
          }

          if (lockAspectRatio && image) {
            const aspectRatio = image.width / image.height;
            if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
              newCrop.height = newCrop.width / aspectRatio;
            } else {
              newCrop.width = newCrop.height * aspectRatio;
            }
          }

          return newCrop;
        });
        setDragStart(pos);
      }
    },
    [isDragging, dragType, resizeHandle, dragStart, getMousePos, getHandle, crop, lockAspectRatio, image]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
    setResizeHandle(null);
  }, []);

  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
  }, []);

  const handleSave = useCallback(() => {
    onSave(crop);
  }, [crop, onSave]);

  return (
    <Modal
      open
      onClose={onCancel}
      title="Crop Image"
      size="xl"
      initialFocus="primary"
      headerExtras={
        <>
          <button
            onClick={() => setLockAspectRatio(!lockAspectRatio)}
            className="p-2 rounded transition-colors"
            style={{
              backgroundColor: lockAspectRatio ? theme.button.primary.bg : 'transparent',
              color: lockAspectRatio ? theme.button.primary.text : theme.sidebar.textSecondary,
            }}
            onMouseEnter={(e) => {
              if (!lockAspectRatio) e.currentTarget.style.backgroundColor = theme.sidebar.hover;
            }}
            onMouseLeave={(e) => {
              if (!lockAspectRatio) e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          >
            {lockAspectRatio ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded transition-colors"
            style={{ color: theme.sidebar.textSecondary }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            title="Reset crop"
          >
            <RotateCcw size={18} />
          </button>
        </>
      }
      footer={
        <>
          <p className="text-xs mr-auto" style={{ color: theme.sidebar.textSecondary }}>
            Drag corners to resize, drag inside to move
          </p>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            <Check size={18} />
            Apply Crop
          </button>
        </>
      }
    >
      <div ref={containerRef} className="p-6">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="rounded-lg"
          style={{ display: 'block', boxShadow: theme.shadow.md }}
        />
      </div>
    </Modal>
  );
}
