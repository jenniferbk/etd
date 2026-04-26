# Configurable Element Styles — Design

**Date:** 2026-04-26
**Status:** Design approved; revised after adversarial review (Gemini + self-review). Pending final spec review before plan-writing.

**Revision history:**
- v1 (initial): five sections written and approved interactively, committed at 2d7a917.
- v2 (this revision): adversarial review folded in. Changes:
  - Subtype IDs: new ones use `crypto.randomUUID()`; six v1.2 defaults keep their slug ids for backwards compat. Re-adding a deleted subtype gets a fresh id (no ghost-resurrection of orphaned references).
  - Orphan subtypes: visible error state (`[deleted subtype]` placeholder + red dashed outline + warning icon) instead of silent fallback to raw id.
  - Defaults split into two functions: `createV1_2_MigrationDefaults()` (frozen forever) and `createCurrentDefaults()` (may evolve). Loading v1.2 always uses the frozen one.
  - Resolver: `student` → dashed border now applies to supports too (was arguments-only). Joint/implicit/given overlays still arguments-only (those contributors don't exist for supports).
  - Per-export-path coverage made explicit: PDF needs no change (live-stage snapshot); SVG needs full resolver plumbing; `.diagramx` propagates renamed labels only.

## Background

Research diagrams in different studies use slightly different visual conventions on top of the same underlying Toulmin/extended-Toulmin structure: one study renders Claims as ellipses, another renames "Claim" to "Conclusion", another expands the "Other Support" subtype list with a category like "Hedging". Today the editor hardcodes shapes, colors, labels, and the six-item subtype list across `src/types/elements.ts`, `src/components/Canvas/shapes/*`, `src/utils/colors.ts`, `src/components/Palette/Palette.tsx`, `src/components/Properties/PropertiesPanel.tsx`, and `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — adapting to a new study requires code edits.

This feature makes the per-type style configurable inside the editor. Configuration travels in the saved diagram JSON, so a customized diagram renders identically when shared.

## Goals

- Add a `styleConfig` field on the diagram, stored alongside `elements` and `connections`, and bump the save schema from `1.2` to `1.3`.
- Make per-type **display label**, **border style** (solid/dashed/dotted), **border shape** (rectangle/rounded/ellipse), and **background color** editable for all six argument types and all three support types.
- Make the "Other Support" subtype list fully editable per diagram (add, rename, remove, reorder).
- Preserve existing contributor-derived visual conventions as **overlays** on top of per-type config: `student` → dashed (applies to both arguments and supports); `joint` → dot-dash (arguments only — supports don't have a `joint` contributor); `implicit` → cloud shape (arguments only); `given` → light-green background tint (arguments only).
- Reach the per-diagram config through a gear icon in the toolbar that opens a modal with a sidebar list, an edit pane, and a live preview.
- Loading a v1.2 diagram (no `styleConfig`) applies built-in defaults that exactly match today's visual conventions — no visual change for any existing diagram.

## Non-goals

- **No global / cross-diagram preference.** Config is per-diagram only. No "save as my default" or `localStorage` overlay. (Considered and rejected during brainstorm — research diagrams shouldn't quietly re-style when opened in a different context.)
- **No new top-level support types.** The three slots (`action`, `question`, `other`) stay fixed. Only their labels and styles are editable. Adding new top-level types like "Hedging" would require runtime-driven type system; deferred to a future feature if needed.
- **No internal-key renaming.** `argumentType: 'claim'` and `supportType: 'action'` keys on `DiagramElement` never change. Only the display label varies. Connections, exports, and analysis stay stable.
- **No per-contributor background config beyond the `given` overlay.** Hardcoded for now; if multiple contributor backgrounds are ever needed, add a `contributorBackgrounds` overlay map then.
- **No new style dimensions** beyond border style / border shape / background color. Border width, text color, and corner radius are not configurable (YAGNI; defaults derived from the chosen shape).
- **No shape-engine rewrite.** Existing per-type shape components (`ArgumentShape`, `SupportShape`) gain config-aware branches via targeted edits, not a generic render-by-config refactor.

## Data model

A new file `src/types/styleConfig.ts` defines the config shape:

```ts
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
  id: string;     // stable. Six default ids are slugs ("displays" etc.) for v1.2 backwards compat.
                  // ALL new subtypes use crypto.randomUUID() — never slug-from-label.
  label: string;  // display label, e.g. "Displays"
}

export interface StyleConfig {
  argumentTypes: Record<ArgumentType, TypeStyle>;
  supportTypes:  Record<SupportType,  TypeStyle>;
  otherSubtypes: OtherSubtype[];
}
```

Key choices:

- **Internal keys are immutable.** `argumentType` and `supportType` discriminators on `DiagramElement` never change at runtime. Only `TypeStyle.label` (display) varies. This protects connections, the four export paths (PNG/SVG/PDF/.diagramx), the schema, the resolver branches, and any future analysis pipelines.
- **`otherSubtypes` is an ordered array, not a `Record`.** Order matters in the dropdown UI, and entries can be added/removed at runtime. The element-side field `subtype?: SupportSubtype` (already a `string` type with custom-value support per `src/types/elements.ts:30`) stores the `id`.
- **Subtype IDs are stable and never label-derived.** The six v1.2 defaults keep their slug ids (`'displays'`, `'suggests'`, etc.) so existing diagrams' `subtype: 'displays'` references still resolve. Every subtype added through the UI gets `crypto.randomUUID()`. Decoupling id from label means renaming a subtype never breaks references, and re-adding a previously-deleted subtype gets a fresh id (it does *not* reattach orphaned elements — that would be silent ghost-resurrection).
- **Orphan subtypes show a visible error state.** If an element's `subtype` id is not present in `config.otherSubtypes`, the element renders with a placeholder label `"[deleted subtype]"`, a red dashed outline, and a small warning icon. The Properties panel for that element shows the subtype dropdown in error state with `"[Deleted Subtype — pick a new one]"` as the current value, forcing the user to assign a valid subtype to clear the error. Silent fallback to the raw id is rejected — UUIDs as on-canvas labels would leak meaningless data.
- **Backwards compatibility on load.** A v1.2 diagram has no `styleConfig` field. The loader applies `createV1_2_MigrationDefaults()` (a frozen function — see "Defaults and migration") so the diagram renders identically to before. Saving always writes v1.3.

The save schema constant in `src/utils/schema.ts` bumps:

```ts
export const SAVE_SCHEMA_VERSION = '1.3';
```

## Renderer changes

A new helper `src/utils/styleResolver.ts` layers contributor overrides on top of per-type config and returns a single resolved style object that the shape components consume directly:

```ts
import type { ArgumentElement, SupportElement } from '../types';
import type { StyleConfig, BorderStyle, BorderShape } from '../types/styleConfig';
import { getContributorColor, getSupportColors } from './colors';

export interface ResolvedStyle {
  borderColor: string;
  borderStyle: BorderStyle | 'dotdash';   // 'dotdash' is the joint contributor overlay
  borderShape: BorderShape | 'cloud';     // 'cloud' is the implicit contributor overlay
  backgroundColor: string;
  borderWidth: number;
}

export function resolveArgumentStyle(
  el: ArgumentElement,
  config: StyleConfig,
): ResolvedStyle {
  const typeStyle = config.argumentTypes[el.argumentType];

  const borderStyle: ResolvedStyle['borderStyle'] =
    el.contributor === 'student' ? 'dashed' :
    el.contributor === 'joint'   ? 'dotdash' :
    typeStyle.borderStyle;

  const borderShape: ResolvedStyle['borderShape'] =
    el.contributor === 'implicit' ? 'cloud' :
    typeStyle.borderShape;

  const backgroundColor =
    el.contributor === 'given' ? '#F0FFF0' :  // green tint overlay (preserved default)
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
  // We discard the .fill it returns; the per-type config now owns background.
  const { border } = getSupportColors(el.supportType, el.contributor);

  // Symmetric with resolveArgumentStyle: student contributor → dashed border.
  // SupportContributor only has 'teacher' | 'student' so joint/implicit/given
  // overlays from the argument resolver don't apply here.
  const borderStyle: ResolvedStyle['borderStyle'] =
    el.contributor === 'student' ? 'dashed' : typeStyle.borderStyle;

  return {
    borderColor: border,
    borderStyle,
    borderShape: typeStyle.borderShape,
    backgroundColor: typeStyle.backgroundColor,
    borderWidth: 2,
  };
}
```

The shape components change as follows (targeted edits — keep file structure):

- **`src/components/Canvas/shapes/ArgumentShape.tsx`** — read `styleConfig` via `useDiagramStore(s => s.styleConfig)`. Call `resolveArgumentStyle(element, styleConfig)` once at the top. Existing `if (isCloud)` branch becomes `if (style.borderShape === 'cloud')`. Add new branches for `borderShape === 'ellipse'` (Konva `<Ellipse>`) and `borderShape === 'rounded'` (existing `cornerRadius={8}` path generalized). The Konva `dash` prop reads from `style.borderStyle`: `solid → undefined`, `dashed → [10, 5]`, `dotted → [2, 4]`, `dotdash → [10, 5, 2, 5]`. Background reads `style.backgroundColor` (replacing the inline `'#F0FFF0' for given else white` ternary at line 151). The underlined header label reads `config.argumentTypes[el.argumentType].label`.
- **`src/components/Canvas/shapes/SupportShape.tsx`** — same shape: resolve once, branch on `style.borderShape`. The bespoke per-`supportType` branches at lines 43, 119, 194 (action=ellipse, question=rounded, other=rounded) all collapse into config-driven branches. The contributor badge ("T"/"S") behavior is preserved.
- **`src/components/Canvas/shapes/TeacherSupportShape.tsx`** — deprecated path; same treatment for consistency. (If the file is verifiably unreachable from runtime code paths it can instead be deleted.)
- **`src/components/Palette/Palette.tsx`** — the `ARGUMENT_TYPES` / `SUPPORT_SUBTYPES` const arrays at lines 17 and 34 become derived from `styleConfig` so palette buttons show current labels.
- **`src/components/Properties/PropertiesPanel.tsx`** — the `SUPPORT_TYPES` and `SUPPORT_SUBTYPES` const arrays at lines 28 and 35 become derived from `styleConfig`.
- **`src/components/TranscriptPanel/TranscriptPanelItem.tsx`** — the `OBJECT_TYPE_OPTIONS` array (the `other:displays` / `other:suggests` entries from lines 36–41) is rebuilt from `config.otherSubtypes`.

## Settings UI

**Entry point.** A gear icon in `src/components/Toolbar/Toolbar.tsx`, placed near the existing icon group. Opens the modal.

**Component tree** (new directory `src/components/Settings/`):

```
src/components/Settings/
  SettingsModal.tsx        # dialog wrapper, backdrop, esc-to-close
  SettingsSidebar.tsx      # left rail: Arguments / Supports / Subtypes sections
  TypeStyleEditor.tsx      # right pane editor for one ArgumentType or SupportType
  SubtypeListEditor.tsx    # right pane editor for the otherSubtypes array
  StylePreview.tsx         # live preview — Konva <Stage> rendering the actual shape
  index.ts
```

**State approach.** Edits write directly to the Zustand store via new actions on `useDiagramStore`:

```ts
updateArgumentTypeStyle: (type: ArgumentType, patch: Partial<TypeStyle>) => void;
updateSupportTypeStyle:  (type: SupportType,  patch: Partial<TypeStyle>) => void;
addSubtype:      (label: string) => void;          // generates id
updateSubtype:   (id: string, patch: Partial<OtherSubtype>) => void;
removeSubtype:   (id: string) => void;
reorderSubtypes: (orderedIds: string[]) => void;
resetStyleConfig: (
  scope: 'all'
       | { kind: 'argument'; type: ArgumentType }
       | { kind: 'support';  type: SupportType }
) => void;
```

No "Save"/"Cancel" buttons — edits apply immediately and the canvas behind the modal updates as you tweak. Mistakes are recovered via undo (`temporal` middleware in `src/store/diagramStore.ts:476-484` needs `styleConfig` added to its `partialize`).

**Live preview pane.** A small Konva `<Stage>` (~220×120) inside `TypeStyleEditor` renders the actual `ArgumentShape` or `SupportShape` for a representative element of the type being edited (sample contributor: `given` for arguments, `teacher` for supports; sample content: `"Sample {label} text"`). Same renderer, same code path → preview cannot drift from canvas reality.

**Subtype editor.** Reorderable list — each row has a drag handle, text input for the label, and a delete button. "+ Add subtype" button at the bottom generates a new entry with a random `id`.

**Reset.** Each editor pane has a small "Reset" link. Modal footer has "Reset all to defaults" with a confirm step.

**Accessibility.** Esc closes. Tab cycles inputs. Color picker uses native `<input type="color">`. The sidebar list is keyboard-navigable (arrow keys move selection).

## Defaults and migration

A new file `src/utils/styleConfigDefaults.ts` exposes **two** factory functions:

- `createV1_2_MigrationDefaults()` — the frozen factory used **only** for migrating v1.2 diagrams to v1.3 on load. This function MUST NOT change once shipped. It is the contract that says "a v1.2 diagram opened in any future version of the editor renders the way it did in v1.2."
- `createCurrentDefaults()` — used for new diagrams, "Reset all to defaults", and per-type resets. May evolve over time.

At launch, both functions return identical config. They diverge only if defaults are ever changed in a future release. Splitting them now (rather than later, when it would require backfilling) prevents silently re-styling every old diagram on load.

```ts
import type { StyleConfig } from '../types/styleConfig';

// FROZEN — never modify. Used only for v1.2 → v1.3 load migration.
// If defaults change in the future, change createCurrentDefaults instead.
export function createV1_2_MigrationDefaults(): StyleConfig {
  return {
    argumentTypes: {
      data:      { label: 'Data',      borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      claim:     { label: 'Claim',     borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      warrant:   { label: 'Warrant',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      backing:   { label: 'Backing',   borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      qualifier: { label: 'Qualifier', borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
      rebuttal:  { label: 'Rebuttal',  borderStyle: 'solid', borderShape: 'rectangle', backgroundColor: '#FFFFFF' },
    },
    supportTypes: {
      action:   { label: 'Action',   borderStyle: 'solid', borderShape: 'ellipse', backgroundColor: '#FFFFFF' },
      question: { label: 'Question', borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#E0FFFF' },
      other:    { label: 'Other',    borderStyle: 'solid', borderShape: 'rounded', backgroundColor: '#FFFACD' },
    },
    otherSubtypes: [
      { id: 'displays',   label: 'Displays' },
      { id: 'suggests',   label: 'Suggests' },
      { id: 'summarizes', label: 'Summarizes' },
      { id: 'restates',   label: 'Restates' },
      { id: 'highlights', label: 'Highlights' },
      { id: 'validates',  label: 'Validates' },
    ],
  };
}

// Used for new diagrams, "Reset all to defaults", and per-type resets.
// Safe to evolve in future releases.
export function createCurrentDefaults(): StyleConfig {
  return createV1_2_MigrationDefaults();  // identical at launch; will diverge if defaults change later
}
```

These match today's visual conventions exactly. The `given` contributor's green tint (`#F0FFF0`) is *not* in this defaults factory — it's applied as a contributor overlay in `resolveArgumentStyle`, symmetric with how `student=dashed` and `implicit=cloud` are applied.

**Load migration.** `diagramStore.loadDiagram()` accepts an optional `styleConfig` parameter. When absent (v1.2 file), the loader calls `createV1_2_MigrationDefaults()`:

```ts
loadDiagram: (elements, connections, name, transcript, styleConfig) => {
  set({
    // existing fields...
    styleConfig: styleConfig ?? createV1_2_MigrationDefaults(),
  });
}
```

`clearDiagram` and the "new diagram" path use `createCurrentDefaults()`. The Settings modal "Reset all to defaults" button also uses `createCurrentDefaults()`.

**Save path.** The JSON save flow in `Toolbar.tsx` writes the new `styleConfig` field. Schema version bumps to `1.3` (`SAVE_SCHEMA_VERSION` in `src/utils/schema.ts`).

**Per-export-path coverage.** The four output paths each work differently — explicit treatment needed:

| Export | Rendering path | styleConfig handling |
|---|---|---|
| **JSON save** | Direct serialization | Add `styleConfig` to the saved object; bump schema to 1.3 |
| **PDF export** (`pdfExport.ts`) | `Konva.stages[0].toDataURL()` snapshot of live stage | **No code changes.** The live canvas already renders from `styleConfig` via the updated shape components, so the PNG/PDF inherits it for free |
| **SVG export** (`svgExport.ts`) | Independent SVG-string rendering using `getContributorColor` and `getTeacherSupportColors` | **Must be updated.** Read `styleConfig` from `useDiagramStore.getState().styleConfig`; pass to a new `renderArgumentSvg(el, styleConfig)` / `renderSupportSvg(el, styleConfig)` that mirrors the resolver. Use the resolved style values for `stroke`, `stroke-dasharray`, `fill`, and the shape element (`<rect>` vs `<rect rx>` vs `<ellipse>`) |
| **`.diagramx` export** (`diagramxExport.ts`) | Independent — exports to DiagramMix's bplist format with its own shape vocabulary | **Label-only update.** The Level A MVP exports everything as rectangles per its own spec; per-type shape config doesn't translate to DiagramMix's GraphicStyle ids cleanly. But user-renamed labels SHOULD propagate — read `config.argumentTypes[type].label` instead of the hardcoded type name when emitting element text |

Verification step 9 (Export parity) must be exercised on **all three** non-JSON exports, not just one.

**Cross-version behavior.** A v1.3 file opened in a future v1.x reader can ignore unknown fields. A v1.2 (older) reader silently loses the `styleConfig` and renders with its hardcoded defaults — acceptable for a research tool with a small set of users.

## Verification

The project has no test framework installed (per `package.json`); verification is browser-driven (CLAUDE.md "Browser Testing"). Manual checklist after implementation:

1. **No-config visual parity** — open an existing v1.2 saved diagram. Every element renders identically to before the change.
2. **Save/load round-trip** — create a v1.3 diagram, customize a few types, save, reload. Config is preserved and shapes match.
3. **Cross-version load** — load a v1.2 file (no `styleConfig`) → defaults applied; visually unchanged.
4. **Contributor overrides still win** — set Claim's `borderShape` to `ellipse`. A `student` claim renders as a dashed ellipse. An `implicit` claim renders as a cloud (shape override). A `given` claim renders as an ellipse with the green tint (bg override).
5. **Subtype lifecycle** — add a subtype, assign it to an element, then delete the subtype from config. The element keeps rendering with the orphan label until reassigned (no crash).
6. **Live preview accuracy** — settings preview pane matches what appears on the canvas.
7. **Undo/redo** — change a type's color, hit Cmd+Z, color reverts. (Verifies `styleConfig` was added to the temporal `partialize`.)
8. **Palette / Properties / Transcript labels** — rename "Claim" to "Conclusion"; the palette button, Properties dropdown, and TranscriptPanel object-type dropdown all show "Conclusion".
9. **Export parity** — exercise *all three* non-JSON exports after customizing styles:
   - **PDF:** verify the snapshot inherits the configured shape and color (no code change should mean automatic inheritance — if not, that's a bug).
   - **SVG:** open the exported `.svg` and confirm strokes, dash arrays, fills, and shape elements (`<rect>` vs `<ellipse>`) match the canvas. Confirm contributor overlays (student=dashed) survive.
   - **`.diagramx`:** open in DiagramMix; user-renamed labels appear; shape changes do NOT (acceptable per Level A spec).
10. **Browser test with Claude for Chrome** — drag/drop new elements after config changes; verify dashed/dotted borders, ellipse shape, and colors render correctly (per CLAUDE.md "Critical Rendering Details" — dashed must look dashed, not dotted).

**Optional follow-up (not in scope):** add `vitest` plus a small test file for `resolveArgumentStyle` and `resolveSupportStyle`. Pure functions, ideal first tests, ~30 lines. Would catch resolver regressions without browser work.

## Risks

- **`given` background overlay vs custom per-type background.** The overlay always wins for `given`-contributor elements, intentionally — the green tint is diagnostic. Document this in a comment on `resolveArgumentStyle` so future maintainers don't read it as a bug. If a user reports wanting custom `given` backgrounds per type, the upgrade path is a `contributorBackgrounds` overlay map in `StyleConfig`.
- **Konva `dash` array values.** `[2, 4]` (dotted) and `[10, 5]` (dashed) need a quick visual check at typical zoom; they should be visually distinct from each other and from solid. CLAUDE.md flags this category of detail explicitly.
- **Modal `<Stage>` lifecycle.** The preview Konva `<Stage>` is a separate Konva root from the canvas. Verify no event-handler leakage when the modal opens/closes repeatedly.
- **Temporal `partialize` regression.** Adding `styleConfig` to undo history changes the size of each undo entry. Bounded by the `limit: 50` already in place — fine in practice, but worth noting.
- **Schema constant fan-out.** `SAVE_SCHEMA_VERSION` is consumed by every save path; the bump to `1.3` is one line, but loaders should still gracefully handle `1.2` (and earlier) by calling `createV1_2_MigrationDefaults()` when `styleConfig` is absent. No version-gated loader fork needed.

## Files affected

**New:**
- `src/types/styleConfig.ts` — `StyleConfig`, `TypeStyle`, `OtherSubtype`, `BorderStyle`, `BorderShape` types
- `src/utils/styleResolver.ts` — `resolveArgumentStyle`, `resolveSupportStyle`
- `src/utils/styleConfigDefaults.ts` — `createV1_2_MigrationDefaults` (frozen) and `createCurrentDefaults`
- `src/components/Settings/SettingsModal.tsx`
- `src/components/Settings/SettingsSidebar.tsx`
- `src/components/Settings/TypeStyleEditor.tsx`
- `src/components/Settings/SubtypeListEditor.tsx`
- `src/components/Settings/StylePreview.tsx`
- `src/components/Settings/index.ts`

**Modified:**
- `src/types/index.ts` — re-export new types
- `src/store/diagramStore.ts` — add `styleConfig` state field, new action setters, update `partialize`, update `loadDiagram` signature, update `clearDiagram` to seed defaults
- `src/components/Canvas/shapes/ArgumentShape.tsx` — config-aware shape branches
- `src/components/Canvas/shapes/SupportShape.tsx` — config-aware shape branches
- `src/components/Canvas/shapes/TeacherSupportShape.tsx` — same (or delete if verifiably unreachable)
- `src/components/Palette/Palette.tsx` — derive labels from config
- `src/components/Properties/PropertiesPanel.tsx` — derive dropdowns from config
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — rebuild `OBJECT_TYPE_OPTIONS` from config
- `src/components/Toolbar/Toolbar.tsx` — gear icon entry point
- `src/utils/schema.ts` — bump `SAVE_SCHEMA_VERSION` to `1.3`
- `src/utils/pdfExport.ts` — **no code change** (snapshots live Konva stage; inherits config automatically)
- `src/utils/svgExport.ts` — independent renderer; must read `styleConfig` from store and apply per-type shape/style/background and contributor overlays via the resolver pattern
- `src/utils/diagramxExport.ts` — propagate user-renamed labels (`config.argumentTypes[type].label`); per-type shape/style not exported (Level A limitation)
- `src/hooks/useAutoSave.ts` — include `styleConfig` in autosave payload
- `src/components/RecoveryPrompt.tsx` — accept and forward `styleConfig` on recovery
- `src/App.tsx` — wire `handleRecover` to pass `styleConfig`
