# Configurable Element Styles — Design

**Date:** 2026-04-26
**Status:** Design approved; revised after adversarial review (Gemini + self-review). Pending final spec review before plan-writing.

**Revision history:**
- v1 (initial): five sections written and approved interactively, committed at 2d7a917.
- v2: first adversarial review folded in. Subtype IDs use UUIDs; orphan subtypes get visible error state; defaults split into frozen v1.2 + evolvable current; student=dashed extended to supports; per-export-path coverage made explicit. Committed at 366a371.
- v3 (this revision): second adversarial review folded in. Changes:
  - **Settings UI moved from direct-write-to-store to Apply/Cancel pattern with a local working copy.** Reverses the v1 decision after the undo-buffer-flooding hit was framed: each Apply is one undo entry instead of 50 per session.
  - **"Reset all" scoped.** Modal-footer reset only touches `argumentTypes` and `supportTypes`; subtype reset has its own button inside the Subtypes editor. Eliminates silent data loss of custom subtypes.
  - **Subtype delete in use** now requires confirmation showing the affected element count.
  - **Orphan visual marker simplified** to a single warning icon (⚠) at top-right of the bounding box. Border color, dash, shape preserved — no collision with student-dashed-blue, joint dot-dash, implicit cloud, or selection highlight.
  - **`createCurrentDefaults` is now an independent literal**, not a pass-through to `createV1_2_MigrationDefaults` — prevents future-developer footgun.
  - **Preview pane gets a contributor toggle** so the user can see how each type style composes with student-dashed, implicit-cloud, given-tint, etc.
  - **Text inputs commit `onBlur`**, not `onChange` — eliminates per-keystroke flicker.
  - **Default modal selection:** first argument type (`Data`).
  - **SVG orphan rendering specified:** inline `<text>⚠` at top-right; placeholder label in body. No external icon dependency.
  - **Per-subtype styling explicitly punted** — added "Out of scope" section.

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
- **Orphan subtypes show a visible error state.** If an element's `subtype` id is not present in `config.otherSubtypes`, the element renders with a placeholder label `"[deleted subtype]"` and a single visual marker: a small warning icon (⚠) drawn at the top-right corner of the element's bounding box (8px outside the border). The element's **shape, border style, border color, dash pattern, and background are unchanged** — orphan-state does NOT recolor the border or alter the dash, because that would collide with the existing student-dashed-blue convention, the joint dot-dash convention, the implicit cloud silhouette, and the selection-highlight `#4A90D9` dashed outline. The Properties panel for an orphaned element shows the subtype dropdown in error state with `"[Deleted Subtype — pick a new one]"` as the current value (in red text), forcing the user to assign a valid subtype to clear the warning. Silent fallback to the raw id is rejected — UUIDs as on-canvas labels would leak meaningless data.
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

**State approach.** The modal holds a **local working copy** of `styleConfig` in component state, seeded from the store on open. Edits mutate the working copy, not the store. The live preview reads from the working copy (so it updates instantly), but the canvas behind the modal stays on the committed store config until Apply is clicked.

```
Open modal:
  workingConfig := { ...store.styleConfig }   // shallow + deep clone

Edits within modal:
  workingConfig.argumentTypes.claim.borderShape = 'ellipse'
  // preview re-renders; canvas does not

Apply:
  store.replaceStyleConfig(workingConfig)     // single store write -> single undo entry
  close modal

Cancel (or Esc, or backdrop click):
  discard workingConfig
  close modal
```

The store gets **one** new action: `replaceStyleConfig(config: StyleConfig)`. The granular per-type setters (`updateArgumentTypeStyle`, etc.) are not needed — all mutation happens locally in the modal until Apply. Subtype add/remove/rename also operates on the working copy.

This pattern means a 30-second tweaking session produces exactly one undo entry, not 50. `styleConfig` is added to the temporal `partialize` (`src/store/diagramStore.ts:476-484`); each Apply is one undo step.

**Text input commit policy.** Label edits in `TypeStyleEditor` and `SubtypeListEditor` commit to `workingConfig` on `onBlur`, not on every `onChange`. This avoids per-keystroke flicker in the preview pane and matches conventional form behavior. Color picker (`<input type="color">`) commits on `onChange` since it doesn't have intermediate states.

**Default selection on open.** The right pane defaults to the **first argument type (`Data`)** when the modal opens. Sidebar selection state lives in the modal's local state, reset on each open.

**Live preview pane.** A small Konva `<Stage>` (~220×120) inside `TypeStyleEditor` renders the actual `ArgumentShape` or `SupportShape` for a representative element of the type being edited. The preview reads from `workingConfig`. Same renderer, same code path → preview cannot drift from canvas reality.

The preview pane has a **contributor toggle** above the rendered shape — a row of small buttons letting the user flip the previewed contributor between all valid options (`given`/`student`/`teacher`/`joint`/`implicit` for arguments; `teacher`/`student` for supports). This is the only way to see how the chosen type style composes with the contributor overlays (`student=dashed`, `implicit=cloud`, `given=green tint`) without leaving the modal. Default contributor: `given` for arguments, `teacher` for supports.

**Subtype editor.** Reorderable list — each row has a drag handle, text input for the label (commit on blur), and a delete button. "+ Add subtype" button at the bottom generates a new entry with `crypto.randomUUID()` as the `id` and a default label of `"New subtype"` for the user to rename.

**Destructive-action confirmations.**
- **Deleting a subtype that is in use by elements:** confirm dialog reads `"This subtype is used by N elements. Deleting it will leave them with no assigned subtype. Continue?"` Computed by counting `elements` whose `subtype === id`. Deleting an unused subtype skips confirmation.
- **"Reset all type styles" (modal footer):** confirms with `"Reset all argument and support type styles to defaults? This does NOT affect your custom subtypes."` This action only resets `argumentTypes` and `supportTypes` — `otherSubtypes` is preserved.
- **"Reset subtypes to defaults" (button inside `SubtypeListEditor`):** scoped subtype reset. Confirms with `"Replace your custom subtypes with the six defaults? Elements using removed subtypes will be orphaned."` Only this action touches `otherSubtypes`.
- **Per-type "Reset" link** in `TypeStyleEditor`: no confirm — single-type reset is small enough to undo.

**Accessibility.** Esc cancels (discards working copy + closes). Tab cycles inputs. Color picker uses native `<input type="color">`. Sidebar list is keyboard-navigable (arrow keys move selection). Apply is the default button (Enter triggers it when focus is in a non-textarea field).

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

// Used for new diagrams, "Reset all type styles", "Reset subtypes to defaults",
// and per-type resets. Safe to evolve in future releases.
//
// IMPORTANT: this function MUST NOT delegate to createV1_2_MigrationDefaults().
// They are intentionally independent literal copies at launch so that future
// edits here cannot accidentally modify the frozen v1.2 contract. Six months
// from now if Claim's default shape becomes 'ellipse', edit it here only.
export function createCurrentDefaults(): StyleConfig {
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
| **SVG export** (`svgExport.ts`) | Independent SVG-string rendering using `getContributorColor` and `getTeacherSupportColors` | **Must be updated.** Read `styleConfig` from `useDiagramStore.getState().styleConfig`; pass to `renderArgumentSvg(el, styleConfig)` / `renderSupportSvg(el, styleConfig)` that mirrors the resolver. Use the resolved style values for `stroke`, `stroke-dasharray`, `fill`, and the shape element (`<rect>` vs `<rect rx>` vs `<ellipse>`). **Orphan elements:** render the warning marker as a small inline SVG `<text>` element with `⚠` (single character, no external icon dependency) at top-right corner; element body uses the placeholder label `[deleted subtype]` |
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
7. **Undo/redo** — open settings modal, change three different things across multiple types, click Apply. Hit Cmd+Z **once** — all three changes revert together (verifies single-undo-entry-per-Apply behavior). Hit Cmd+Y, all three return.
7a. **Cancel discards** — open modal, change a type's color, click Cancel. The change is gone; the canvas is unaffected; no undo entry was created.
7b. **Subtype delete confirmation** — add three elements with `subtype: 'displays'`. Open settings, attempt to delete the `Displays` subtype. Confirmation says "used by 3 elements". Confirm → elements show orphan warning marker (⚠) at top-right.
7c. **Reset scoping** — modify two type styles AND add a custom subtype, click Apply. Reopen modal, click "Reset all type styles" in modal footer → confirm. Type styles revert to defaults; custom subtype is still present. Then click "Reset subtypes to defaults" inside the Subtypes editor → confirm. Custom subtype removed; any elements using it become orphans.
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
- **Temporal `partialize` size.** Adding `styleConfig` to undo history grows each entry slightly (a few KB at most). Bounded by `limit: 50`. The Apply/Cancel pattern keeps the entry *count* per session at 1 — no flooding risk.
- **Schema constant fan-out.** `SAVE_SCHEMA_VERSION` is consumed by every save path; the bump to `1.3` is one line, but loaders should still gracefully handle `1.2` (and earlier) by calling `createV1_2_MigrationDefaults()` when `styleConfig` is absent. No version-gated loader fork needed.

## Out of scope (documented for future work)

- **Per-subtype styling.** All Other-Support subtypes (`Displays`, `Suggests`, custom ones) share the parent `Other` type's style — they differ only in the displayed label text. A user adding "Hedging" and "Restating" as custom subtypes will see them as visually identical goldenrod rounded rectangles distinguished only by label. If a research convention emerges that wants visually distinct subtypes (e.g., "Hedging" as a parallelogram), this would require promoting `OtherSubtype` to a full `TypeStyle`-bearing entity and adding another resolver layer. Punted from MVP because the current brainstorm did not surface it as a need; revisit if the limitation bites.
- **Configurable contributor border color.** Border color stays speaker-derived per the original brainstorm. If a user customizes a type's background to clash with the contributor color (red bg + blue student border), there is no in-tool fix. Acceptable trade-off for now.

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
- `src/store/diagramStore.ts` — add `styleConfig` state field, single `replaceStyleConfig(config)` action, add `styleConfig` to temporal `partialize`, update `loadDiagram` signature to accept optional `styleConfig`, update `clearDiagram` to seed `createCurrentDefaults()`
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
