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
  | 'joint'
  | 'implicit';

export type TeacherSupportType =
  | 'action'
  | 'question'
  | 'other';

export type OtherSupportSubtype =
  | 'displays'
  | 'suggests'
  | 'summarizes'
  | 'restates'
  | 'highlights'
  | 'validates'
  | string; // Allow custom subtypes

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

export interface BaseElement {
  id: string;
  position: Position;
  size: Size;
  content: string;
  attribution?: Attribution;
  image?: string | null; // Base64 or URL
}

export interface ArgumentElement extends BaseElement {
  type: 'argument';
  argumentType: ArgumentType;
  contributor: ContributorType;
  label: string; // e.g., "Claim 1", "Warrant/Data 2"
}

export interface TeacherSupportElement extends BaseElement {
  type: 'teacherSupport';
  supportType: TeacherSupportType;
  subtype?: OtherSupportSubtype;
}

export interface InfoBoxElement extends BaseElement {
  type: 'infoBox';
  label: string;
}

export type DiagramElement = ArgumentElement | TeacherSupportElement | InfoBoxElement;

// Type guards
export function isArgumentElement(el: DiagramElement): el is ArgumentElement {
  return el.type === 'argument';
}

export function isTeacherSupportElement(el: DiagramElement): el is TeacherSupportElement {
  return el.type === 'teacherSupport';
}

export function isInfoBoxElement(el: DiagramElement): el is InfoBoxElement {
  return el.type === 'infoBox';
}
