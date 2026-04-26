import type { ArgumentElement, SupportElement } from '../types';
import type { StyleConfig, BorderStyle, BorderShape } from '../types/styleConfig';
import { getContributorColor, getSupportColors } from './colors';

export type ResolvedBorderStyle = BorderStyle | 'dotdash';
export type ResolvedBorderShape = BorderShape | 'cloud';

export interface ResolvedStyle {
  borderColor: string;
  borderStyle: ResolvedBorderStyle;
  borderShape: ResolvedBorderShape;
  backgroundColor: string;
  borderWidth: number;
}

export function resolveArgumentStyle(
  el: ArgumentElement,
  config: StyleConfig,
): ResolvedStyle {
  const typeStyle = config.argumentTypes[el.argumentType];

  // Contributor overlays. Spec: contributor wins for shape/style for arguments.
  const borderStyle: ResolvedBorderStyle =
    el.contributor === 'student' ? 'dashed' :
    el.contributor === 'joint'   ? 'dotdash' :
    typeStyle.borderStyle;

  const borderShape: ResolvedBorderShape =
    el.contributor === 'implicit' ? 'cloud' :
    typeStyle.borderShape;

  // Given-tint overlay. ALWAYS wins for given contributor — see spec Risks.
  // Document the precedence here so future readers don't see this as a bug.
  const backgroundColor =
    el.contributor === 'given' ? '#F0FFF0' :
    typeStyle.backgroundColor;

  return {
    borderColor: getContributorColor(el.contributor),
    borderStyle,
    borderShape,
    backgroundColor,
    borderWidth: el.contributor === 'implicit' ? 2 : 3,
  };
}

export function resolveSupportStyle(
  el: SupportElement,
  config: StyleConfig,
): ResolvedStyle {
  const typeStyle = config.supportTypes[el.supportType];
  // Border color stays contributor-derived (existing getSupportColors logic).
  // We discard the .fill it returns; per-type config now owns background.
  const { border } = getSupportColors(el.supportType, el.contributor);

  // Symmetric with resolveArgumentStyle: student → dashed.
  // SupportContributor only has 'teacher' | 'student' so joint/implicit/given
  // overlays from the argument resolver don't apply here.
  const borderStyle: ResolvedBorderStyle =
    el.contributor === 'student' ? 'dashed' : typeStyle.borderStyle;

  return {
    borderColor: border,
    borderStyle,
    borderShape: typeStyle.borderShape,
    backgroundColor: typeStyle.backgroundColor,
    borderWidth: 2,
  };
}

// Konva dash-array values for each resolved border style.
// Used by both ArgumentShape/SupportShape (Konva) and svgExport.ts.
export function dashArrayForBorderStyle(style: ResolvedBorderStyle): number[] | undefined {
  switch (style) {
    case 'solid':   return undefined;
    case 'dashed':  return [10, 5];
    case 'dotted':  return [2, 4];
    case 'dotdash': return [10, 5, 2, 5];
    default: {
      // Exhaustiveness guard: if a new ResolvedBorderStyle variant is added,
      // TypeScript will error here because `style` will no longer narrow to `never`.
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
}
