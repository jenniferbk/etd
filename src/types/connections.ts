// Connection Types for Extended Toulmin Diagrams

import type { Position } from './elements';

export type { Position };

export type ConnectionType = 'support' | 'counterclaim';

// Edge anchor positions (orthogonal routing)
export type BoxEdge = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeAnchor {
  edge: BoxEdge;
  t: number;   // 0..1, fraction along the edge from the top-left corner
}

// Target can be an element ID or an attachment to another connection
export interface ConnectionTarget {
  connectionId: string;  // ID of the connection to attach to
  position: number;      // 0-1 position along the connection polyline
}

export interface Connection {
  id: string;
  from: string;  // Element ID
  to: string | ConnectionTarget;  // Element ID or arrow attachment
  type: ConnectionType;
  waypoints?: Position[];  // Interior bend points (orthogonal). Empty/undefined → default Z-elbow at render.
  fromAnchor?: EdgeAnchor;  // Optional anchor point on source element edge
  toAnchor?: EdgeAnchor;    // Optional anchor point on target element edge
}

// Type guard for arrow attachment
export function isArrowAttachment(to: string | ConnectionTarget): to is ConnectionTarget {
  return typeof to === 'object' && 'connectionId' in to;
}
