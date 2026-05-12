# UI rehaul — design

**Date:** 2026-05-12
**Status:** Brainstorm complete; pending implementation plan
**Brainstorm artifacts:** `.superpowers/brainstorm/45154-1778595783/content/` (mockups for each section)

## 1. Context

The ETD editor's chrome — toolbar, side panels, properties strip, modals — has accreted across several feature additions (full-screen mode, connector routing, image import) and now feels overcrowded, generic, and stressful to work in. The primary users are Jennifer plus collaborating grad students and professors at other institutions, so the chrome should also feel professional when a collaborator opens the tool for the first time.

This rehaul replaces the chrome's visual language and tightens its layout. It does **not** touch the canvas, the rendered elements, or any functional behavior.

## 2. Goals

- Lower the visual stress of the chrome. The interface should feel calm, organized, and unhurried.
- Reduce toolbar density without removing any feature.
- Give the side panels and properties strip breathing room without changing the four-region layout.
- Make the six modal overlays feel like one consistent family.
- Ship incrementally to jenkleiman.com — each PR independently shippable.

## 3. Non-goals (sealed)

These remain exactly as they are today and are off-limits to every PR in this rehaul:

- **Canvas:** `#FFFFFF` background, `#E5E5E5` grid, gridSize/pan/zoom behavior.
- **Element rendering:** contributor-colored borders (`#228B22` given, `#0000CD` student, `#CC0000` teacher, `#800080` joint, `#000000` implicit); white fills; cloud shape for implicit; dashed warrant attachments; element typography; underlined labels; embedded timestamps; embedded images.
- **Support fills:** `#E0FFFF` (question), `#FFFACD` (other support).
- **Functional behavior:** selection, drag, connect mode, undo/redo, save/load/export/import, auto-save, transcript parsing and linking, keyboard shortcuts.
- **Anything in `src/components/Canvas/**`** that renders shapes via Konva.
- **`src/utils/colors.ts`** (the contributor + support color source of truth).
- **Configurable element styles** (deferred work — its own spec, `2026-04-26-configurable-element-styles-design.md`).

When an element preview is shown *inside* chrome (the Settings modal's preview, palette pills, hypothetical thumbnails), the preview renders the element using the exact same rules Konva uses on the canvas. Sage Garden tokens never reach element rendering.

## 4. Visual language — Sage Garden

A warm, sage-green light palette with clay accents. Replaces the current "Deep Void" dark theme (`src/utils/theme.ts`).

### 4.1 Palette tokens

| Token | Hex | Use |
|---|---|---|
| `app-bg` | `#f4f7f1` | Outer app background, panel containers |
| `chrome-bg` | `#f8faf4` | Toolbar, properties strip, modal body |
| `sidebar-bg` | `#f0f4eb` | Palette, transcript panel, modal sidebars |
| `border` | `#d6dfca` | Standard borders between chrome regions |
| `border-strong` | `#c9d4be` | Outer frame edges, modal outlines |
| `text` | `#2a3324` | Primary text |
| `text-secondary` | `#4a5a3c` | Secondary text, labels |
| `text-muted` | `#6b7a55` | Tertiary text, hints, captions |
| `text-faint` | `#8a9778` | Uppercase group labels, empty-state hints |
| `accent` | `#6b7c54` | Sage — primary buttons, focus rings, active states |
| `accent-warm` | `#8a6f47` | Clay — secondary highlights only (sparing use) |
| `hover` | `#e7ede0` | Icon button hover background |
| `active` | `#dbe5cf` | Active toggle background |
| `danger` | `#8a3a2a` | Destructive action text/border |
| `danger-bg` | `#fbe6e0` | Destructive action hover background |
| `danger-border` | `#e6c4b8` | Destructive button border |

### 4.2 Typography

Single typeface: **Inter** (system fallback: `-apple-system, BlinkMacSystemFont, sans-serif`). Mono for transcript timestamps and code-like values: `'JetBrains Mono', 'SF Mono', Menlo, monospace`. No serifs anywhere — serifs would conflict with the canvas's Konva-rendered text and feel inconsistent with Anna's diagrams.

| Scale | Size | Weight | Use |
|---|---|---|---|
| Display | 28px | 600 | Empty-state headers, modal titles in large modals |
| Title | 18px | 600 | Modal headers, About page section titles |
| Body | 14px | 400 | Default body, form inputs, button labels |
| Small | 12px | 400 / 500 | Properties strip values, panel content |
| Label | 11px | 500 | Uppercase group labels, `letter-spacing: 0.05–0.07em`, `text-transform: uppercase` |
| Mono | 13px | 400 | Timestamps, code-like values |

### 4.3 Spacing scale

Tailwind-aligned: `4 / 8 / 12 / 16 / 24 / 32 / 48`. Icon button padding: 8. Component padding: 12. Panel padding: 16. Section gap: 24. Modal body padding: 22 (between 16 and 24 for a more generous feel).

### 4.4 Radius scale

`4 / 6 / 8 / 12`. Inputs and pills: 4. Buttons: 6. Cards and icon buttons: 8. Modals and app panels: 12.

### 4.5 Shadow scale

| Token | Value | Use |
|---|---|---|
| `shadow-sm` | `0 1px 3px rgba(50, 65, 30, 0.08)` | Hover lift, dropdown menus |
| `shadow-md` | `0 4px 12px rgba(50, 65, 30, 0.10)` | Modals, floating popovers |
| `shadow-lg` | `0 12px 32px rgba(50, 65, 30, 0.15)` | Image lightbox, dialog scrims |

Scrim color for modal overlays: `rgba(50, 65, 30, 0.32)` — sage-tinted darkening rather than pure black.

## 5. Toolbar

A hybrid: 12 visible interactive affordances grouped into 4 clusters, plus an `Export ▾` dropdown and a `···` More overflow menu for the rest. Same icons (lucide-react) and handlers as today — only the layout and packaging change. The `100%` zoom indicator is a non-interactive display, not counted in the 12.

### 5.1 Visible affordances (left to right)

| Group | Affordance | Notes |
|---|---|---|
| (Brand) | `ETD | <diagram name>` | Name remains an inline editable input |
| History | Undo, Redo | `⌘Z`, `⇧⌘Z` |
| File | Save, Open, Import-image, **Export ▾** | Export becomes a single dropdown button (4 variants behind it) |
| View | Legend toggle, Transcript panel toggle | Active state uses `active` token |
| Zoom | Zoom out, `100%` indicator, Zoom in, Fit to window | `⌘-`, `⌘+`, `⌘0` |
| Overflow | `···` More menu | Sage accent color |

Group dividers: 1px vertical line in `border` token, 22px tall, 2–4px horizontal margin. Group labels appear on hover above the group (`text-faint`, uppercase, `letter-spacing: 0.08em`).

### 5.2 Export dropdown

Opens below the Export button on click. Contains: Export as PNG, Export as SVG, Export as PDF, Export as DiagramMix (`.diagramx`). Same handlers as today. Styled as a 220px-wide popover with `shadow-md` and `border` outline.

### 5.3 More menu

Opens below the `···` button. Sections:

- **Transcript:** Load transcript
- **View:** Reset view (100%, centered)
- **Settings:** Element styles, About & shortcuts (`?`)
- **(separated, danger):** Clear diagram

Visual treatment matches the Export dropdown. Destructive items get the danger token border and hover background.

### 5.4 Implementation hooks

- Existing `Toolbar.tsx` is split: top-level `Toolbar` orchestrates groups; new files `Toolbar/ExportMenu.tsx` and `Toolbar/MoreMenu.tsx` house the dropdowns.
- Hover labels are pure CSS (`::before` pseudo-elements positioned above each group).

## 6. Side panels

Same four-region layout — toolbar top, palette left, canvas center, transcript right, properties bottom — with consistent header treatment, narrower defaults, and softer borders.

### 6.1 Palette (left, default 200px)

- Sub-grouped with quiet uppercase headers: **Argument** (Data, Claim, Warrant, Backing, Qualifier, Rebuttal) and **Support** (Teacher action, Question, Other support).
- Element-type buttons are plain pills with the type label, white fill, `border` outline. **No invented type-color dots** — type buttons are unstyled labels.
- Contributor section below the type pills, separated by a dashed `border` line. Contributor chips carry the actual contributor colors (`#228B22` green / `#0000CD` blue / `#CC0000` red / `#800080` purple / `#000000` black) as small circular dots.
- Hover: pill background lightens to `chrome-bg`, border tightens to `border-strong`, `shadow-sm`.

### 6.2 Properties (bottom, height equal to filled-state)

- Single horizontal row of field-pairs (Label / Value), each with a small uppercase label in `text-faint`.
- Values are read-only chips except where editable — those become outlined inputs in `border`.
- Duplicate / Delete buttons right-aligned. Delete uses danger styling.
- **Empty state:** dashed-border placeholder, italic muted hint ("No element selected · click an element on the canvas to edit it"). Same height as filled state so the canvas doesn't jump.

### 6.3 Transcript panel (right, default 280px when open, 28px closed strip)

- Header: "Transcript" title on the left, filename in mono on the right, separated from the body by `border`.
- Search input always visible below the header.
- Lines: small mono timestamp + line text. Linked-to-selected-element line uses `active` background. Hover uses `hover`.
- Closed state: 28px vertical strip with rotated "Transcript ▸" label, `sidebar-bg`. Clickable to expand.
- **Open-but-empty state:** centered icon + "No transcript loaded · load a .txt file to link argument elements to spoken lines" + inline "Load transcript" button.

## 7. Modals — shared frame

A new `components/ui/Modal.tsx` component provides a shared frame for all six overlays:

- **Header:** 16px / 22px padding, `app-bg`, `border` bottom. Title (16/600), subtitle in `text-muted`, close `×` button right-aligned with `hover` background.
- **Body:** 22px padding, `chrome-bg`. May contain a left sidebar (Settings) or be a single column (About, Image Import).
- **Footer:** 14px / 22px padding, `app-bg`, `border` top. Right-aligned buttons: primary (sage filled), secondary (white outlined), danger (clay outlined).
- **Scrim:** `rgba(50, 65, 30, 0.32)`. Closing on scrim click is preserved from current behavior.
- **Shadow:** `0 24px 60px rgba(50, 65, 30, 0.18)`.
- **Border + radius:** 1px `border-strong`, 14px radius.

Refitted in PR 4:

| Modal | Notes |
|---|---|
| Settings (Element styles) | Sidebar lists Argument / Support categories using the correct taxonomy. Main pane shows form fields and a **live preview** that renders the element using the actual Konva styling (white fill, contributor-colored border, etc.). |
| About & shortcuts | Single column. Section headers in `text-faint` uppercase. Keyboard shortcuts use `<kbd>` styled as 2px-bottom-border chips. |
| Image Import | Drop zone with dashed `border-strong`, sage hover. File picker preserved. Loading / error states use existing logic. |
| Image Lightbox | Centered image, `shadow-lg`, scrim covers full viewport. Existing controls. |
| Image Crop | Same frame. Crop tool styling preserved (operational, not decorative). |

### 7.1 Recovery prompt — demoted to toast

Today the recovery prompt is a center-screen modal that blocks the canvas. It becomes a bottom-corner toast:

- 520px max width, bottom-right corner, 24px margin from edges.
- `chrome-bg`, `border-strong` outline, 3px left border in `accent`.
- Contents: small icon, title ("Unsaved work from your last session"), subtitle with timestamp + counts, Discard (secondary) + Restore (primary) buttons.
- Dismissed only by clicking Discard or Restore — same decision points as the current modal, so no recovery-flow behavior changes. Toast persists across canvas interactions until the user chooses.

## 8. Empty states

| Surface | Treatment |
|---|---|
| Canvas (empty diagram) | Faint centered hint inside the canvas grid: small left-arrow icon + "Drag an element from the palette to start. Or import from an image." Color `#aaa`, font-size 12. Disappears when first element is added. Rendered as an HTML overlay on top of the Konva stage — does **not** touch the Konva rendering layer. |
| Transcript open, none loaded | See §6.3. |
| Properties, nothing selected | See §6.2. |
| Palette | No empty state — always populated. |

## 9. Full-screen toolbar

The existing full-screen hover toolbar (`App.tsx` lines 415–442) keeps its behavior (hover-reveal from the top, 180ms slide, F/Esc toggle) but adopts the new Sage Garden styling. Backdrop softens to `chrome-bg` with `shadow-md` instead of a heavy black drop-shadow. The entry hint pill becomes a sage toast in the bottom-right rather than the current black-pill style.

## 10. Implementation strategy

Five incremental PRs, each independently shippable to jenkleiman.com. After each merge: build, copy to `~/Documents/GitHub/jenkleiman.com/public/tools/etd/`, commit and push to jenkleiman.com per the dual-repo dance in `CLAUDE.md`.

### PR 1 — Foundation: Sage Garden tokens

- Rewrite `src/utils/theme.ts` to export the Sage Garden palette, type ramp, spacing, radii, shadows.
- Grep for hardcoded Deep Void hex strings (`#050a14`, `#0a1019`, `#00f0ff`, `#141824`, etc.) and replace with token references. Most components already read from `theme.toolbar.*` / `theme.sidebar.*`.
- **Touches:** `src/utils/theme.ts`, any component referencing Deep Void hexes directly.
- **Off-limits:** `src/utils/colors.ts`, `src/components/Canvas/**`.
- **Verify:** load `test_diagram.json`, confirm canvas + elements pixel-identical; chrome turns sage.

### PR 2 — Toolbar

- Split `Toolbar.tsx` into `Toolbar` (orchestrator) + `ExportMenu.tsx` + `MoreMenu.tsx`.
- Restructure into 4 visible groups with hover labels, Export dropdown, More menu.
- **Touches:** `src/components/Toolbar/*`.
- **Off-limits:** Canvas/**, colors.ts.
- **Verify:** every existing toolbar handler still wired; manual test of Save, Export-PNG, Load-transcript, Clear, etc.

### PR 3 — Panels

- Restyle Palette (group headers, plain pills, contributor chips with real colors).
- Restyle Properties (single horizontal row, empty state).
- Restyle Transcript panel (header, search, line states, closed-strip vertical label, empty state).
- **Touches:** `Palette/Palette.tsx`, `Properties/PropertiesPanel.tsx`, `TranscriptPanel/*.tsx`, layout glue in `App.tsx`.
- **Off-limits:** Canvas/**, colors.ts, element rendering.
- **Verify:** drag-drop still works from palette; contributor selection preserved; transcript line-to-element linking unchanged.

### PR 4 — Modals

- Extract shared `components/ui/Modal.tsx` (header / body / footer / scrim).
- Refit Settings, About, Image Import, Image Lightbox, Image Crop.
- Demote Recovery prompt to toast (`components/RecoveryToast.tsx`).
- Settings preview renders an element with faithful styling (white fill, contributor border, etc.) — implemented as a small dedicated preview component that reads from `colors.ts` rather than reconstructing styling.
- **Touches:** `+components/ui/Modal.tsx`, `Settings/*.tsx`, `Toolbar/AboutModal.tsx`, `Toolbar/ImageImportModal.tsx`, `ImageEditor/*.tsx`, `RecoveryPrompt.tsx` → `RecoveryToast.tsx`.
- **Off-limits:** Canvas/**, colors.ts.
- **Verify:** every modal still opens/closes; Settings edits still propagate to canvas; Image Import still uploads and parses; Recovery toast still restores correctly.

### PR 5 — Polish

- Canvas empty-state HTML overlay (positioned absolutely above the Konva stage; does not touch the stage's rendering).
- Properties + Transcript empty-state polish (final pass).
- Full-screen toolbar Sage Garden restyle.
- Hover / focus / active / disabled state audit across all chrome.
- **Touches:** `Canvas/Canvas.tsx` (overlay layer only — not rendered shapes), `TranscriptPanel/*`, `Properties/PropertiesPanel.tsx`, full-screen logic in `App.tsx`.
- **Off-limits:** Konva stage rendering, colors.ts.
- **Verify:** empty-state hint disappears as soon as an element is added; full-screen entry/exit still smooth; tab focus order intact.

## 11. Safeguards

Each PR enforces three protections:

1. **Locked-file list.** PR descriptions list `src/components/Canvas/**` and `src/utils/colors.ts` as off-limits. Reviewer (Jennifer) verifies the diff doesn't touch them. PR 5 needs Canvas.tsx for the empty-state overlay — that exception is called out explicitly and the change is the addition of an HTML overlay layer outside the Konva stage.
2. **Visual regression check.** Before merging each PR: load `test_diagram.json`, screenshot the canvas, diff against a pre-rehaul reference screenshot. Element rendering must be pixel-identical. Chrome difference is expected.
3. **Token-driven boundary.** Chrome reads from `theme.ts`; element rendering reads from `colors.ts`. The two files stay disjoint — no value flows between them. The Settings preview achieves faithful element rendering by reading from `colors.ts`, not by replicating styling inside chrome code.

## 12. Open questions

None at this time. All directional choices answered during brainstorm:

- Aesthetic: Sage Garden (light, organic, calm).
- Toolbar: hybrid — 12 visible + Export dropdown + More overflow.
- Panels: keep 4-region layout, just breathe.
- Scope: chrome only, canvas + elements sealed.
- Intensity: considered rehaul (palette + toolbar + panels + modals + empty states + polish).
- Build: 5 incremental PRs.

## 13. References

- Brainstorm mockups: `.superpowers/brainstorm/45154-1778595783/content/` (Section 1 visual language, Section 2 toolbar, Section 3 panels, Section 4 modals, Section 5 build, and the corrected-element-rendering screen).
- Element rendering rules: `src/utils/colors.ts`, `docs/REQUIREMENTS.md` §2.2 and §2.3.
- Existing theme tokens (to be replaced): `src/utils/theme.ts`.
- Deferred work that may interact with this rehaul: `2026-04-26-configurable-element-styles-design.md`.
- Project memories that constrain this work: `etd-design-decisions-anchor-on-annas-diagrams.md`, `etd-ui-rehaul-scope.md`, `etd-element-taxonomy.md`.
