import { Rect } from 'react-konva';
import type { Cluster } from '../../../utils/clusters';
import { unionBbox } from '../../../utils/clusters';

interface ClusterHaloProps {
  cluster: Cluster;
  mode: 'drag' | 'select';
}

const PAD = 8;
const CORNER_RADIUS = 12;
const STROKE = '#4A90D9';

export function ClusterHalo({ cluster, mode }: ClusterHaloProps) {
  const bbox = unionBbox([cluster.argument, ...cluster.supports]);
  const isDrag = mode === 'drag';
  return (
    <Rect
      x={bbox.x - PAD}
      y={bbox.y - PAD}
      width={bbox.width + 2 * PAD}
      height={bbox.height + 2 * PAD}
      cornerRadius={CORNER_RADIUS}
      fill={isDrag ? 'rgba(74, 144, 217, 0.10)' : 'rgba(74, 144, 217, 0.06)'}
      stroke={STROKE}
      strokeWidth={isDrag ? 2 : 1.5}
      dash={isDrag ? undefined : [6, 4]}
      listening={false}
    />
  );
}
