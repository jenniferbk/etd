import type { ArgumentType, SupportType } from './elements';

export type BorderStyle = 'solid' | 'dashed' | 'dotted';
export type BorderShape = 'rectangle' | 'rounded' | 'ellipse';

export interface TypeStyle {
  label: string;            // display label, e.g. "Claim" or "Conclusion"
  borderStyle: BorderStyle;
  borderShape: BorderShape;
  backgroundColor: string;  // hex, e.g. "#FFFFFF"
}

export interface Subtype {
  id: string;     // stable. v1.2 default ids are slugs ("displays" etc.).
                  // ALL new subtypes use generateUuid() (utils/uuid) — never slug-from-label.
  label: string;  // display label, e.g. "Displays"
}

// Deprecated alias — kept so existing imports keep compiling during the transition.
export type OtherSubtype = Subtype;

export interface StyleConfig {
  argumentTypes: Record<ArgumentType, TypeStyle>;
  supportTypes:  Record<SupportType,  TypeStyle>;
  subtypes:      Record<SupportType, Subtype[]>;
}
