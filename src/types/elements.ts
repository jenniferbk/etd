// Element Types for Extended Toulmin Diagrams

export type ArgumentType =
  | 'data'
  | 'claim'
  | 'warrant'
  | 'backing'
  | 'qualifier'
  | 'rebuttal';

export type ContributorType =
  | 'given'
  | 'student'
  | 'teacher'
  | 'joint'
  | 'implicit';

export type SupportType =
  | 'action'
  | 'question'
  | 'other';

export type SupportSubtype =
  | 'displays'
  | 'suggests'
  | 'summarizes'
  | 'restates'
  | 'highlights'
  | 'validates'
  | string; // Allow custom subtypes

export type SupportContributor = 'teacher' | 'student';

// Deprecated - use SupportType instead
export type TeacherSupportType = SupportType;
export type OtherSupportSubtype = SupportSubtype;

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Attribution {
  speaker: string;
  timestamp: string;
}

export interface CropArea {
  x: number;      // 0-1 percentage from left
  y: number;      // 0-1 percentage from top
  width: number;  // 0-1 percentage of original width
  height: number; // 0-1 percentage of original height
}

export interface ImageSettings {
  displayWidth?: number;   // User-resized width (px) - deprecated, use scale
  displayHeight?: number;  // User-resized height (px) - deprecated, use scale
  scale?: number;          // Proportional scale (0.2 to 3.0, default 1.0; see utils/imageLayout)
  offsetX?: number;        // X offset within element (px from default position)
  offsetY?: number;        // Y offset within element (px from default position)
  cropArea?: CropArea;     // Non-destructive crop region
}

export interface BaseElement {
  id: string;
  position: Position;
  size: Size;
  content: string;
  attribution?: Attribution;
  image?: string | null;       // Base64 or URL
  imageSettings?: ImageSettings; // Resize/crop settings
  sourceTranscript?: { transcriptId: string; lineIndex: number };
}

export interface ArgumentElement extends BaseElement {
  type: 'argument';
  argumentType: ArgumentType;
  contributor: ContributorType;
  label: string; // e.g., "Claim 1", "Warrant/Data 2"
  // Only meaningful when argumentType === 'qualifier'. Pins the qualifier to
  // a parent connection at a fractional position along its polyline (0..1,
  // same convention as ConnectionTarget.position). Undefined → orphan/legacy
  // qualifier (renders with dashed red + ⚠).
  attachedTo?: { connectionId: string; position: number };
}

export interface SupportElement extends BaseElement {
  type: 'support';
  contributor: SupportContributor;
  supportType: SupportType;
  subtype?: SupportSubtype;
  associatedWith?: string;   // argument element id; sticky after first auto-suggest
}

// Deprecated - use SupportElement instead
export interface TeacherSupportElement extends BaseElement {
  type: 'teacherSupport';
  supportType: SupportType;
  subtype?: SupportSubtype;
}

export interface InfoBoxElement extends BaseElement {
  type: 'infoBox';
  label: string;
}

export type DiagramElement = ArgumentElement | SupportElement | TeacherSupportElement | InfoBoxElement;

// Type guards
export function isArgumentElement(el: DiagramElement): el is ArgumentElement {
  return el.type === 'argument';
}

export function isSupportElement(el: DiagramElement): el is SupportElement {
  return el.type === 'support';
}

// Deprecated - use isSupportElement instead
export function isTeacherSupportElement(el: DiagramElement): el is TeacherSupportElement {
  return el.type === 'teacherSupport';
}

export function isInfoBoxElement(el: DiagramElement): el is InfoBoxElement {
  return el.type === 'infoBox';
}
