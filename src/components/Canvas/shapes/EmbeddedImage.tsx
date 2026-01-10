import { useEffect, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';

interface EmbeddedImageProps {
  imageData: string;
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
}

export function EmbeddedImage({ imageData, x, y, maxWidth, maxHeight }: EmbeddedImageProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      // Calculate dimensions to fit within bounds while maintaining aspect ratio
      const aspectRatio = img.width / img.height;
      let width = maxWidth;
      let height = width / aspectRatio;

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      setDimensions({ width, height });
      setImage(img);
    };
    img.src = imageData;
  }, [imageData, maxWidth, maxHeight]);

  if (!image || dimensions.width === 0) {
    return null;
  }

  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={dimensions.width}
      height={dimensions.height}
    />
  );
}
