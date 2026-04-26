import type { ArgumentType, SupportType } from './elements';

export type BorderStyle = 'solid' | 'dashed' | 'dotted';
export type BorderShape = 'rectangle' | 'rounded' | 'ellipse';

export interface TypeStyle {
  label: string;            // display label, e.g. "Claim" or "Conclusion"
  borderStyle: BorderStyle;
  borderShape: BorderShape;
  backgroundColor: string;  // hex, e.g. "#FFFFFF"
}

export interface OtherSubtype {
  id: string;     // stable. Six v1.2 default ids are slugs ("displays" etc.).
                  // ALL new subtypes use crypto.randomUUID() — never slug-from-label.
  label: string;  // display label, e.g. "Displays"
}

export interface StyleConfig {
  argumentTypes: Record<ArgumentType, TypeStyle>;
  supportTypes:  Record<SupportType,  TypeStyle>;
  otherSubtypes: OtherSubtype[];
}
