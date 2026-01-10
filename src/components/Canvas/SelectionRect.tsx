import { Rect } from 'react-konva';

interface SelectionRectProps {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export function SelectionRect({ x, y, width, height, visible }: SelectionRectProps) {
  if (!visible) return null;

  // Normalize coordinates for negative width/height (dragging left/up)
  const normalizedX = width < 0 ? x + width : x;
  const normalizedY = height < 0 ? y + height : y;
  const normalizedWidth = Math.abs(width);
  const normalizedHeight = Math.abs(height);

  return (
    <Rect
      x={normalizedX}
      y={normalizedY}
      width={normalizedWidth}
      height={normalizedHeight}
      fill="rgba(74, 144, 217, 0.1)"
      stroke="#4A90D9"
      strokeWidth={1}
      dash={[4, 4]}
    />
  );
}
