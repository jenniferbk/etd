import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Image as KonvaImage, Group, Rect } from 'react-konva';
import type Konva from 'konva';
import type { CropArea } from '../../../types';
import { useLightboxStore, useDiagramStore } from '../../../store';

interface EmbeddedImageProps {
  imageData: string;
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
  displayWidth?: number;
  displayHeight?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  cropArea?: CropArea;
  elementLabel?: string;
  elementId?: string;
  isSelected?: boolean;
}

// Reserved for future resize handle implementation
// const HANDLE_SIZE = 10;
const HANDLE_COLOR = '#00f0ff'; // Cyan accent - matches jenkleiman.com
// const HANDLE_STROKE = '#00c0cc';
// const MIN_SIZE = 40;

export function EmbeddedImage({
  imageData,
  x,
  y,
  maxWidth,
  maxHeight,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  cropArea,
  elementLabel,
  elementId,
  isSelected = false,
}: EmbeddedImageProps) {
  const openLightbox = useLightboxStore((state) => state.openLightbox);
  const setElementImageSettings = useDiagramStore((state) => state.setElementImageSettings);

  const handleDoubleClick = () => {
    openLightbox(imageData, elementLabel);
  };

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  // Base dimensions (at 100% scale): fit the (cropped) source into the box.
  const baseDimensions = useMemo(() => {
    if (!image) return { width: 0, height: 0 };
    const sourceWidth = cropArea ? cropArea.width * image.width : image.width;
    const sourceHeight = cropArea ? cropArea.height * image.height : image.height;
    const ratio = sourceWidth / sourceHeight;

    let width = maxWidth;
    let height = width / ratio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
    return { width, height };
  }, [image, cropArea, maxWidth, maxHeight]);

  // Calculate actual dimensions based on scale. Above 100% the caller grows
  // maxHeight instead (see utils/imageLayout), so only shrinking applies here.
  const renderScale = Math.min(scale, 1);
  const dimensions = {
    width: baseDimensions.width * renderScale,
    height: baseDimensions.height * renderScale,
  };

  // Track image drag for repositioning
  const imageDragStartRef = useRef<{ startOffsetX: number; startOffsetY: number; startMouseX: number; startMouseY: number } | null>(null);

  // Load (and crop) the image only when the source or crop changes. Sizing
  // is derived synchronously above so a box resize doesn't wait on a reload
  // (which left the selection transformer measuring the stale size).
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      // If crop area is specified, create a cropped canvas
      if (cropArea) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const srcX = cropArea.x * img.width;
          const srcY = cropArea.y * img.height;
          const srcW = cropArea.width * img.width;
          const srcH = cropArea.height * img.height;

          canvas.width = srcW;
          canvas.height = srcH;
          ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
          setCroppedCanvas(canvas);
        }
      } else {
        setCroppedCanvas(null);
      }
      setImage(img);
    };
    img.src = imageData;
  }, [imageData, cropArea]);

  // Handle image drag start for repositioning
  const handleImageDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    setIsDraggingImage(true);

    const stage = e.target.getStage();
    const pointerPos = stage?.getPointerPosition();

    imageDragStartRef.current = {
      startOffsetX: offsetX,
      startOffsetY: offsetY,
      startMouseX: pointerPos?.x || 0,
      startMouseY: pointerPos?.y || 0,
    };
  }, [offsetX, offsetY]);

  // Handle image drag for repositioning
  const handleImageDrag = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;

    if (!imageDragStartRef.current) return;

    const stage = e.target.getStage();
    const pointerPos = stage?.getPointerPosition();
    if (!pointerPos) return;

    const { startOffsetX, startOffsetY, startMouseX, startMouseY } = imageDragStartRef.current;

    // Calculate delta from drag start
    const deltaX = pointerPos.x - startMouseX;
    const deltaY = pointerPos.y - startMouseY;

    // Calculate new offsets with bounds checking
    const newOffsetX = Math.max(-dimensions.width / 2, Math.min(maxWidth - dimensions.width / 2, startOffsetX + deltaX));
    const newOffsetY = Math.max(-dimensions.height / 2, Math.min(maxHeight - dimensions.height / 2, startOffsetY + deltaY));

    // Update position in real-time
    if (elementId) {
      setElementImageSettings(elementId, { offsetX: newOffsetX, offsetY: newOffsetY });
    }
  }, [elementId, setElementImageSettings, dimensions, maxWidth, maxHeight]);

  // Handle image drag end
  const handleImageDragEnd = useCallback(() => {
    setIsDraggingImage(false);
    imageDragStartRef.current = null;
  }, []);

  if (!image || baseDimensions.width === 0) {
    return null;
  }

  // Use cropped canvas if available, otherwise use original image
  const imageSource = croppedCanvas || image;

  // Calculate actual position with offsets
  const actualX = x + offsetX;
  const actualY = y + offsetY;

  return (
    <Group>
      {/* Image - draggable when selected for repositioning */}
      <KonvaImage
        image={imageSource}
        x={actualX}
        y={actualY}
        width={dimensions.width}
        height={dimensions.height}
        draggable={isSelected}
        onDragStart={handleImageDragStart}
        onDragMove={handleImageDrag}
        onDragEnd={handleImageDragEnd}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onMouseEnter={(e) => {
          if (isSelected) {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'move';
          }
        }}
        onMouseLeave={(e) => {
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = 'default';
        }}
      />

      {/* Selection border */}
      {isSelected && (
        <Rect
          x={actualX - 2}
          y={actualY - 2}
          width={dimensions.width + 4}
          height={dimensions.height + 4}
          stroke={HANDLE_COLOR}
          strokeWidth={2}
          dash={isDraggingImage ? undefined : [4, 4]}
          listening={false}
        />
      )}
    </Group>
  );
}
