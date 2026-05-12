# UI rehaul — design

**Date:** 2026-05-12
**Status:** Brainstorm complete; three adversarial review passes applied (v4); pending implementation plan
**Brainstorm artifacts:** `.superpowers/brainstorm/45154-1778595783/content/` (mockups for each section)

## 1. Context

The ETD editor's chrome — toolbar, side panels, properties strip, modals — has accreted across several feature additions (full-screen mode, connector routing, image import) and now feels overcrowded, generic, and stressful to work in. The primary users are Jennifer plus collaborating grad students and professors at other institutions, so the chrome should feel professional when a collaborator opens the tool for the first time.

This rehaul replaces the chrome's visual language and tightens its layout. It does **not** touch the canvas, the rendered elements, or any functional behavior.

## 2. Goals

- Lower the visual stress of the chrome. The interface should feel calm, organized, and unhurried.
- Reduce toolbar density without removing any feature, and without hiding workflow-critical actions.
- Give the side panels and properties strip breathing room without changing the four-region layout.
- Make the modal overlays feel like one consistent family.
- Replace inconsistent native dialogs (`alert()`, blocking modals where they don't fit) with a coherent notification + decision pattern.
- Ship incrementally to jenkleiman.com — each PR independently shippable.
- Meet WCAG AA for chrome text contrast.

## 3. Non-goals (sealed)

These remain exactly as they are today and are off-limits to every PR in this rehaul:

- **Canvas:** `#FFFFFF` background, `#E5E5E5` grid, gridSize / pan / zoom behavior.
- **Element rendering:** contributor-colored borders (`#228B22` given, `#0000CD` student, `#CC0000` teacher, `#800080` joint, `#000000` implicit); white fills; cloud shape for implicit; dashed warrant attachments; element typography; underlined labels; embedded timestamps; embedded images.
- **Support fills:** `#E0FFFF` (question), `#FFFACD` (other support).
- **Connection rendering:** the in-canvas line styling for both finalized connections and the in-progress drag preview (Konva-rendered).
- **Marquee selection rectangle:** rendered via `react-konva` `<Rect>` in `src/components/Canvas/SelectionRect.tsx` (fill `rgba(74, 144, 217, 0.1)`, stroke `#4A90D9` from `colors.ts`). The marquee is inside the Konva stage and stays sealed.
- **Selection highlight on a selected element:** Konva-rendered, sealed.
- **Functional behavior:** selection, drag, connect mode, undo / redo, save / load / export / import, auto-save, transcript parsing and linking, keyboard shortcuts.
- **Anything in `src/components/Canvas/**`** that renders shapes via Konva.
- **`src/utils/colors.ts`** (the contributor + support color source of truth).
- **The existing `StylePreview` component** at `src/components/Settings/StylePreview.tsx` — already Konva-based and faithful; the rehaul only restyles its outer wrapper.
- **Configurable element styles** (deferred work — its own spec, `2026-04-26-configurable-element-styles-design.md`).

When an element preview is shown *inside* chrome (the Settings modal's preview), it is rendered by the existing Konva `StylePreview`. Sage Garden tokens never reach element rendering.

## 4. Visual language — Sage Garden

A warm, sage-green light palette with clay accents. Replaces the current "Deep Void" dark theme (`src/utils/theme.ts`).

### 4.1 Palette tokens

All text tokens below pass WCAG AA (≥4.5:1) against `chrome-bg` (`#f8faf4`) for normal text. Backgrounds and borders are decorative — no contrast minimum. Accent tokens are constrained to large-text and non-text uses (≥3:1).

| Token | Hex | Contrast on `chrome-bg` | Use |
|---|---|---|---|
| `app-bg` | `#f4f7f1` | — | Outer app background, panel containers |
| `chrome-bg` | `#f8faf4` | — | Toolbar, properties strip, modal body |
| `sidebar-bg` | `#f0f4eb` | — | Palette, transcript panel, modal sidebars |
| `border` | `#d6dfca` | — | Standard borders between chrome regions |
| `border-strong` | `#c9d4be` | — | Outer frame edges, modal outlines |
| `text` | `#2a3324` | 11.4:1 | Primary text |
| `text-secondary` | `#4a5a3c` | 5.85:1 | Secondary text, labels, uppercase group labels, placeholder text |
| `accent` | `#6b7c54` | 3.95:1 | Sage — accent details, indicators, light/decorative accents. **Not used for primary button backgrounds** (fails AA at 3.39:1 with white text) or focus rings on hover/active backgrounds. |
| `accent-strong` | `#3d4a32` | 9.8:1 | Primary button background with white text (passes AA). Replaces `accent` anywhere a 4.5:1 contrast bar applies. |
| `accent-warm` | `#8a6f47` | 4.05:1 (large only) | Clay — secondary highlights, sparingly. Not used as body text. |
| `hover` | `#e7ede0` | — | Icon button hover background |
| `active` | `#dbe5cf` | — | Active toggle background |
| `danger` | `#b23a48` | 5.6:1 | Destructive action text/border — saturated wine-red, distinguishable from sage `text` under red-green color deficiency by both hue and lightness |
| `danger-bg` | `#fbe6e0` | — | Destructive action hover background |
| `danger-border` | `#e6b8b8` | — | Destructive button border |
| `focus-ring` | `#2a3324` | 11.4:1 on chrome / ≥4.5:1 on hover & active | 2px solid `outline` + **2px `outline-offset`** on every focusable chrome element. The offset places the ring outside the focused element, so the ring's contrast is measured against the element's **parent background**, not the element itself. This is mandatory — implementations must use `outline-offset: 2px` (or larger) so the ring lands on chrome-bg / app-bg, not on the element. |
| `focus-ring-on-dark` | `#FFFFFF` | 16:1 on `accent-strong` | Fallback for the rare case where the parent background is dark (`accent-strong` or darker). Used when a focused element sits flush against a dark surface and offset cannot place the ring on a light parent. Implemented via `outline-color: white` for that specific element. |

**Text on hover and active backgrounds:** the `hover` and `active` background tokens are too light for `text-secondary` (`#4a5a3c`) to pass AA. When chrome elements (icon buttons, dropdown items, palette pills) display text on a `hover` or `active` background, the text uses the `text` token (`#2a3324`), which passes AA against both backgrounds.

The previous draft included `text-muted` (`#6b7a55`, 3.55:1) and `text-faint` (`#8a9778`, 2.45:1). Both failed WCAG AA on `chrome-bg` and have been removed. Anywhere a "muted" or "faint" treatment is needed, use `text-secondary` instead — uppercase Label-scale typography (§4.2) already provides enough visual hierarchy without dropping contrast.

**Destructive actions never rely on color alone.** Every destructive affordance combines `danger` with a lucide icon (`Trash2` for delete / clear) and an explicit text label or `aria-label` (e.g., "Delete element," "Clear diagram"). This protects users with color vision deficiency.

### 4.2 Typography

Single typeface: **Inter** (system fallback: `-apple-system, BlinkMacSystemFont, sans-serif`). Mono for transcript timestamps and code-like values: `'JetBrains Mono', 'SF Mono', Menlo, monospace`. No serifs anywhere — serifs would conflict with the canvas's Konva-rendered text and feel inconsistent with Anna's diagrams.

| Scale | Size | Weight | Use |
|---|---|---|---|
| Display | 28px | 600 | Empty-state headers, modal titles in large modals |
| Title | 18px | 600 | Modal headers, About section titles |
| Body | 14px | 400 | Default body, form inputs, button labels |
| Small | 12px | 400 / 500 | Properties strip values, panel content |
| Label | 11px | 500 | Uppercase group labels in `text-secondary`, `letter-spacing: 0.05–0.07em`, `text-transform: uppercase` |
| Mono | 13px | 400 | Timestamps, code-like values |

### 4.3 Spacing scale

Tailwind-aligned: `4 / 8 / 12 / 16 / 24 / 32 / 48`. Icon button padding: 8. Component padding: 12. Panel padding: 16. Section gap: 24. Modal body padding: 22.

### 4.4 Radius scale

`4 / 6 / 8 / 12`. Inputs and pills: 4. Buttons: 6. Cards and icon buttons: 8. Modals and app panels: 12.

### 4.5 Shadow scale

| Token | Value | Use |
|---|---|---|
| `shadow-sm` | `0 1px 3px rgba(50, 65, 30, 0.08)` | Hover lift, dropdown menus |
| `shadow-md` | `0 4px 12px rgba(50, 65, 30, 0.10)` | Modals, floating popovers |
| `shadow-lg` | `0 12px 32px rgba(50, 65, 30, 0.15)` | Image lightbox, dialog scrims |

Scrim color for modal overlays: `rgba(50, 65, 30, 0.32)` — sage-tinted darkening rather than pure black.

### 4.6 Z-index ladder

A single explicit ladder for every overlay, popover, and floating element. Implemented as named tokens in `theme.ts`:

| Token | Value | Use |
|---|---|---|
| `z-canvas-bg` | `0` | Canvas background, grid |
| `z-canvas-overlay` | `1` | Empty-state HTML overlay (sibling-of-Stage, `pointer-events: none`) |
| `z-panel` | `auto` | Side panels, properties strip |
| `z-toolbar` | `10` | Static toolbar |
| `z-hover-zone` | `20` | Full-screen hover detect strip (current `z-20`) |
| `z-fs-toolbar` | `30` | Full-screen sliding toolbar (current `z-30`) |
| `z-dropdown` | `40` | Export dropdown, More menu |
| `z-fs-hint` | `50` | Full-screen entry hint pill (above dropdowns) |
| `z-modal-scrim` | `1000` | Modal backdrop |
| `z-modal` | `1001` | Modal frame (above its own scrim) |
| `z-lightbox` | `1100` | Image lightbox (above standard modals) |
| `z-toast` | `2000` | Toast notifications (above everything) |

No raw `z-index` values in components. All layering reads from these tokens.

## 5. Toolbar

A hybrid: 14 visible interactive affordances grouped into 4 clusters, plus an `Export ▾` dropdown and a `···` More overflow menu for the rest. Same icons (lucide-react) and handlers as today — only the layout and packaging change. The `100%` zoom indicator is a non-interactive display, not counted in the 14.

### 5.1 Visible affordances (left to right)

| Group | Affordance | Notes |
|---|---|---|
| (Brand) | `ETD \| <diagram name>` | Name remains an inline editable input |
| History | Undo, Redo | `⌘Z`, `⇧⌘Z` |
| File | Save, Open, Import-image, **Export ▾** | Export becomes a single dropdown button (4 variants behind it) |
| View | Legend toggle, **Load transcript**, Transcript panel toggle | Load transcript is a session-start primary action for the research workflow and stays visible. Active state uses `active`. |
| Zoom | Zoom out, `100%` indicator, Zoom in, Fit to window, **Reset view** | Reset view (`Crosshair` icon, returns to 100% / centered) stays visible. It's a panic button distinct from Fit to window — Fit fails on an empty canvas, Reset always works. `⌘-`, `⌘+`, `⌘0`. |
| Overflow | `···` More menu | Sage accent color |

Group dividers: 1px vertical line in `border` token, 22px tall, 2–4px horizontal margin. Group labels appear on hover above each group (`text-secondary`, uppercase, `letter-spacing: 0.08em`).

### 5.2 Export dropdown

Opens below the Export button on click. Contains: Export as PNG, Export as SVG, Export as PDF, Export as DiagramMix (`.diagramx`). Same handlers as today. Styled as a 220px-wide popover with `shadow-md` and `border` outline. Closes on outside click, Escape, or item selection.

### 5.3 More menu

Opens below the `···` button. Sections:

- **Settings:** Element styles, About & shortcuts (`?`)
- **(separated, danger):** Clear diagram

Three items. Closes on outside click, Escape, or item selection. Destructive items use `danger` border and `danger-bg` hover background. Keyboard navigation: arrow keys move focus, Enter activates, Esc closes.

### 5.4 Implementation hooks

- Existing `Toolbar.tsx` is split: top-level `Toolbar` orchestrates groups; new files `Toolbar/ExportMenu.tsx` and `Toolbar/MoreMenu.tsx` house the dropdowns.
- Hover labels are pure CSS (`::before` pseudo-elements positioned above each group).

## 6. Side panels

Same four-region layout — toolbar top, palette left, canvas center, transcript right, properties bottom — with consistent header treatment, narrower defaults, and softer borders.

### 6.1 Palette (left, default 200px)

- Sub-grouped with quiet uppercase headers in `text-secondary`: **Argument** (Data, Claim, Warrant, Backing, Qualifier, Rebuttal) and **Support** (Teacher action, Question, Other support).
- Element-type buttons are plain pills with the type label, white fill, `border` outline. **No invented type-color dots** — type buttons are unstyled labels.
- Contributor section below the type pills, separated by a dashed `border` line. Contributor chips carry the actual contributor colors (`#228B22` green / `#0000CD` blue / `#CC0000` red / `#800080` purple / `#000000` black) as small circular dots.
- Hover: pill background lightens to `chrome-bg`, border tightens to `border-strong`, `shadow-sm`.

### 6.2 Properties (bottom, height equal to filled-state)

- Single horizontal row of field-pairs (Label / Value), each with a small uppercase Label-scale label in `text-secondary`.
- Values are read-only chips except where editable — those become outlined inputs in `border`.
- Duplicate / Delete buttons right-aligned. Delete uses `danger` styling with a `Trash2` icon **and** the explicit "Delete" text label (color + icon + text — never color alone).
- **Empty state:** dashed-border placeholder, italic hint in `text-secondary` ("No element selected · click an element on the canvas to edit it"). Same height as the filled state so the canvas doesn't jump.

### 6.3 Transcript panel (right, default 280px open, 28px closed strip)

- Header: "Transcript" title on the left, filename in mono on the right, separated from the body by `border`.
- Search input always visible below the header.
- Lines: small mono timestamp + line text. Linked-to-selected-element line uses `active` background. Hover uses `hover`.
- Closed state: 28px vertical strip with rotated "Transcript ▸" label, `sidebar-bg`. Clickable to expand.
- **Open-but-empty state:** centered icon + "No transcript loaded · load a .txt file to link argument elements to spoken lines" + inline "Load transcript" button (mirrors the toolbar action).

### 6.4 Dynamic chrome — marquee, cursors, hit-test overlays

Several pieces of UI are dynamic and worth calling out so PR work doesn't accidentally restyle Konva-internal rendering:

- **Marquee selection rectangle:** rendered via `react-konva` `<Rect>` in `src/components/Canvas/SelectionRect.tsx`. Fill `rgba(74, 144, 217, 0.1)`, stroke `#4A90D9` (from `colors.ts:selectionHighlight`). **Sealed** — verified by code-read 2026-05-12. The marquee lives inside the Konva stage and is part of element-rendering territory.
- **Connection-in-progress line** (Konva-rendered, follows the cursor while connecting): **sealed**, no change.
- **Selection highlight on a selected element:** **sealed**, no change.
- **Mode cursors:** crosshair while connect mode is active (`cursor-crosshair` Tailwind class on `Canvas.tsx:832`); grab while panning (`cursor-grab` same line); not-allowed for disabled buttons (`cursor-not-allowed` in Toolbar, Properties, Palette). These are pure CSS cursor declarations, no color information, no behavior change. The Tailwind rule (§11 PR 1) explicitly permits `cursor-*` utilities.
- **Resize handles on canvas elements** (if present): Konva-rendered, sealed.

Rule of thumb: anything drawn by Konva on the stage is sealed; anything outside the stage (CSS-only declarations, HTML overlays) is chrome.

## 7. Modals — shared frame

A new `components/ui/Modal.tsx` component provides a shared frame for every modal overlay:

- **Header:** 16px / 22px padding, `app-bg`, `border` bottom. Title (16/600 in `text`), subtitle in `text-secondary`, close `×` button right-aligned with `hover` background.
- **Body:** 22px padding, `chrome-bg`. May contain a left sidebar (Settings) or be a single column (About, Image Import).
- **Footer:** 14px / 22px padding, `app-bg`, `border` top. Right-aligned buttons: primary (sage filled), secondary (white outlined), danger (clay outlined with `Trash2` icon).
- **Scrim:** `rgba(50, 65, 30, 0.32)`.
- **Shadow:** `0 24px 60px rgba(50, 65, 30, 0.18)`.
- **Border + radius:** 1px `border-strong`, 14px radius.

### 7.1 Focus management

The shared `Modal` component must implement standard modal accessibility:

- **Focus trap.** When the modal opens, focus moves to the first interactive element inside (typically the primary button, or the close `×` if no primary). Tab and Shift+Tab cycle focus within the modal — focus never escapes.
- **Initial focus for destructive confirmations.** Confirmation modals where one path is destructive (Clear diagram, transcript-orphan) initially focus the **non-destructive** option (Cancel) so a stray Enter cannot trigger destruction.
- **Return focus on close.** The element that triggered the modal regains focus when the modal closes. **Fallback chain (each step falls through if the prior is unavailable):**
  1. The triggering element, if it still exists in the DOM and is focusable.
  2. The originating toolbar group's first focusable button (when the trigger was inside a now-closed dropdown / More menu).
  3. `document.body` — used for **modals opened programmatically without a user action**, such as the Recovery prompt that opens on app load. The modal manager records a console warning in development builds noting which step of the chain was used, so unintended fallbacks are visible.
- **Escape closes.** Esc dismisses the modal as if the close `×` had been clicked. For confirmation modals with a destructive action, Esc behaves as Cancel (never confirms). Modals with unsaved changes (Settings) prompt before close.
- **Scrim click closes** — preserved from current behavior, with the same opt-out for unsaved changes.
- **ARIA:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the title element.

Existing modals partly implement these behaviors (Esc-to-close is wired in `App.tsx` lines 357–371). The shared `Modal` centralizes the rest so every refit gets the full treatment for free.

### 7.1.1 Confirmation modal pattern

Confirmation modals (Clear diagram, transcript-orphan) follow a strict pattern:

- **Two buttons minimum:** Cancel (secondary, white outlined) on the left, Confirm (primary or danger, filled) on the right.
- **Cancel is initially focused** for any destructive Confirm.
- **Enter activates the focused button** (Cancel by default — must explicitly Tab to Confirm).
- **Esc = Cancel.**
- **Scrim click = Cancel.**

Single-button "OK"-style dismissals are reserved for informational modals (none today) and remain valid; in those, the OK button receives focus and Enter activates it.

### 7.2 Modal refits

| Modal | Notes |
|---|---|
| Settings (Element styles) | Sidebar lists Argument / Support categories using the correct taxonomy. Main pane shows form fields. **The Konva-rendered preview inside `StylePreview` stays faithful and untouched.** Its surrounding chrome (contributor toggle button row, "Preview" label, frame border, cloud-shape caption) is currently styled with `theme.sidebar.*` and `theme.colors.void[950]` (verified `StylePreview.tsx:73, 82–84, 93, 142–144`) — those references migrate to Sage Garden tokens as part of PR 1's audit. |
| About & shortcuts | Single column. Section headers in `text-secondary` uppercase. Keyboard shortcuts use `<kbd>` styled as 2px-bottom-border chips. |
| Image Import | Drop zone with dashed `border-strong`, sage hover. File picker preserved. Loading state preserved. Error states migrated from `alert()` to the new toast component (§9). |
| Image Lightbox | Centered image, `shadow-lg`, scrim covers full viewport. Existing controls. |
| Image Crop | Same frame. Crop tool styling preserved (operational, not decorative). |
| Recovery prompt | **Stays a modal** — must block the canvas because the user has not yet decided whether to restore or discard auto-saved work, and interacting with a stale or empty diagram before that decision risks confusion or data loss. Adopts the Sage Garden frame. **Initial focus on Restore** (the more likely intended action and the safer accidental-Enter outcome — Restore preserves work and can be reversed by saving over; Discard permanently destroys auto-saved state). Note: the Recovery prompt is not a destructive-confirm in the §7.1.1 sense — Discard is the destructive action and it is the secondary button. Focus follows the §7.1 chain on close, falling through to `document.body` since the prompt opens without a triggering element. |

## 8. Empty states

| Surface | Treatment |
|---|---|
| Canvas (empty diagram) | Faint centered hint inside the canvas viewport: small left-arrow icon + "Drag an element from the palette to start. Or import from an image." Color `#aaa`, font-size 12. Disappears when the first element is added. **Rendered as a sibling `<div>` to the Konva `<Stage>` inside `Canvas.tsx`, not as a child of the Stage.** The wrapper has `pointer-events: none` so it never intercepts canvas mouse / drag events. Its `z-index` sits above the canvas background but below any toolbar overlay. The Konva stage's rendering is not touched. |
| Transcript open, none loaded | See §6.3. |
| Properties, nothing selected | See §6.2. |
| Palette | No empty state — always populated. |

## 9. Notifications + error states

Today the chrome uses three patterns inconsistently: `alert()` (Toolbar.tsx for export failures, "Invalid diagram file," "Failed to read transcript," etc.), modals (Recovery, Image Import error), and `confirm()` (Clear diagram, transcript-orphan check). A coherent rehaul replaces `alert()` with a shared toast component and keeps `confirm()` only where a true two-step decision is required.

### 9.1 Toast component

A new `components/ui/Toast.tsx` plus a small `useToasts()` store hook:

- Bottom-right corner, 24px from edges. Stacks vertically with 8px gap.
- Per toast: 320–520px wide, `chrome-bg` background, `border-strong` outline, 3px left border in the variant color, `shadow-md`.
- Variants: `info` (sage left border), `warning` (clay left border), `error` (`danger` left border).
- **Dismiss policy:** `info` toasts auto-dismiss after 5 seconds. `warning` and `error` toasts persist until manually dismissed — warnings often contain actionable information (e.g., "Embedded images were dropped from the DiagramMix export") that a user may need to read after the moment.
- **Stacking limit:** maximum **4 persistent toasts** visible at once (warning + error combined). If a 5th persistent toast would appear, the oldest existing persistent toast is auto-dismissed (FIFO) to make room. `info` toasts don't count toward the limit since they auto-dismiss quickly. In development builds, the eviction logs a console warning so the team notices noisy error paths.
- Each toast has a close `×` button (top-right inside the toast frame).
- **Copy:** `error` toasts have a small "Copy" button next to the close `×`. Click copies the error text to the clipboard for bug reports. No click-anywhere-to-copy behavior — that conflicts with selection and accidental clicks.

### 9.2 What replaces what

PR 4 must **replace every call to `alert()` in the codebase** with a toast of the appropriate variant. The table below is illustrative, not exhaustive — verification is `grep -rEn '\balert\(' src/` returning zero results after PR 4. The same grep is added as a pre-commit hook so new `alert()` calls can't slip in via future commits.

**Known sites (16, verified 2026-05-12):**

| File:line | Today | After |
|---|---|---|
| `App.tsx:209` | `alert('No valid transcript lines found in …')` | `error` toast |
| `App.tsx:217` | `alert('Failed to read transcript file.')` | `error` toast |
| `TranscriptPanel.tsx:57` | `alert('No valid transcript lines found in …')` (duplicate of App.tsx logic) | `error` toast |
| `TranscriptPanel.tsx:64` | `alert('Failed to read transcript file.')` (duplicate) | `error` toast |
| `Toolbar.tsx:125` | `alert('Invalid diagram file format')` | `error` toast |
| `Toolbar.tsx:128` | `alert('Failed to parse diagram file')` | `error` toast |
| `Toolbar.tsx:134` | `alert(err.message ?? 'Failed to load file')` | `error` toast |
| `Toolbar.tsx:147` | `alert('No canvas found to export')` | `error` toast |
| `Toolbar.tsx:175, 190` | `alert('No elements to export')` (SVG, DiagramMix) | `info` toast: "No elements to export yet." |
| `Toolbar.tsx:196` | `alert('Embedded images were dropped — DiagramMix does not support inline images.')` | `warning` toast (persistent) |
| `Toolbar.tsx:200` | `alert('Failed to export .diagramx')` | `error` toast |
| `Toolbar.tsx:217` | `alert('Failed to export PDF')` | `error` toast |
| `ImageUpload.tsx:34` | `alert('Please select an image file')` | `error` toast |
| `ImageUpload.tsx:40` | `alert('Image must be less than 5MB')` | `error` toast |
| `useImagePaste.ts:25` | `alert('Image must be less than 5MB')` | `error` toast |

**Confirmation modals (kept, restyled):**

| Today | After |
|---|---|
| `confirm('Are you sure you want to clear the diagram?')` | Sage Garden confirmation modal per §7.1.1. |
| `confirm('Loading a new transcript will orphan N existing element reference(s). Proceed?')` | Sage Garden confirmation modal per §7.1.1. |

**Note on duplication.** `App.tsx` and `TranscriptPanel.tsx` both contain transcript-load logic with identical alerts — PR 4 should consider whether to dedupe, but at minimum both call sites get toast-replaced.

### 9.3 Implementation note

`useToasts()` is a new Zustand store at `src/store/toastStore.ts`. It follows the project's Zustand conventions (see `useLightboxStore` for the file-layout pattern), but its **state shape is a list, not a singleton** — the lightbox store handles a single image at a time, whereas the toast store manages a queue of zero-to-many concurrent toasts.

Expected shape:

```ts
type ToastVariant = 'info' | 'warning' | 'error';
interface Toast {
  id: string;          // nanoid or crypto.randomUUID()
  variant: ToastVariant;
  message: string;
  createdAt: number;   // for FIFO eviction at the 4-persistent cap
}
interface ToastState {
  toasts: Toast[];
  addToast: (variant: ToastVariant, message: string) => string; // returns id
  dismissToast: (id: string) => void;
  clearAll: () => void;
}
```

A `<Toaster>` portal mounts once at the App root, subscribes to `toasts`, and renders each toast positioned per §9.1. `addToast` enforces the 4-persistent cap by evicting the oldest persistent toast (FIFO) when a 5th would exceed it.

## 10. Full-screen toolbar

The existing full-screen hover toolbar (`App.tsx` lines 415–442) keeps its behavior (hover-reveal from the top, 180ms slide, F/Esc toggle) but adopts Sage Garden styling:

- Wrapper background `chrome-bg`, `border-strong` bottom border, `shadow-md` (replaces the current hardcoded `rgba(0,0,0,0.15)` shadow).
- Entry hint pill: `text` on `chrome-bg`, `border-strong` outline, `shadow-sm`, in the bottom-right — replaces the current hardcoded `rgba(0,0,0,0.75)` black pill with white text. Same 2.5s timeout and dismissal behavior.

## 11. Implementation strategy

Five incremental PRs, each independently shippable to jenkleiman.com. After each merge: build, copy to `~/Documents/GitHub/jenkleiman.com/public/tools/etd/`, commit and push to jenkleiman.com per the dual-repo dance in `CLAUDE.md`.

### PR 1 — Foundation: Sage Garden tokens

The Deep Void → Sage Garden swap is wider than "change `theme.ts`." Several components inline hardcoded colors that survive a token swap, and a few use Tailwind color utilities. PR 1 addresses all of these so the app does not ship in a half-themed state.

**PR 1 is an audit-and-migration PR, not a token swap.** The implementer must:

1. Rewrite `src/utils/theme.ts` and `src/index.css` to express Sage Garden tokens (palette, type, spacing, radii, shadows, z-index ladder).
2. Audit every component for hardcoded hex literals, `rgba()` values, Tailwind color utilities, and references to removed `theme.colors.*` keys.
3. Migrate every find to the new tokens.

Verification command after the audit (uses `grep -E` for portable POSIX-extended regex):

```bash
grep -rEn '#[0-9a-fA-F]{3,8}|rgba\(|theme\.colors\.(void|error|success|accent\.glow|highlight|secondary)|bg-(gray|blue|red|zinc|slate)|text-(gray|blue|red|zinc|slate)|border-gray|bg-\[#|text-\[#|hover:bg-\[|ring-|divide-|\bz-[0-9]+\b' src/
```

The grep must return only canvas / element-rendering hits — every other match is a chrome site that needs migration. Hits inside the sealed paths (`src/components/Canvas/**`, `src/utils/colors.ts`, and the Konva-rendered portions of `StylePreview.tsx`) are expected and don't block the PR. Optional hardening: add the same grep as a pre-commit hook with the sealed paths excluded, so future commits can't reintroduce forbidden patterns to chrome.

**Known sites to migrate (verified by code-read 2026-05-12, not exhaustive):**

| File | Issue |
|---|---|
| `src/index.css` (entire file) | 364 lines including a `:root` block of `--void-*`, `--accent`, `--accent-glow`, `--secondary`, `--highlight`, `--text-*` CSS custom properties. Rewrite the `:root` to express Sage Garden tokens; rewrite any selectors that reference Deep Void variables. |
| `src/App.tsx` | `bg-gray-50` Tailwind class on root → `chrome-bg` token; full-screen wrapper `boxShadow: '0 2px 12px rgba(0,0,0,0.15)'` → `shadow-md`; entry hint pill `rgba(0, 0, 0, 0.75)` + white → sage-toned pill per §10. |
| `src/components/Toolbar/Toolbar.tsx` | `IconButton` danger hover `rgba(239, 68, 68, 0.15)` → `danger-bg`; reference to `theme.colors.error` (line 268) → `danger` token. |
| `src/components/Toolbar/AboutModal.tsx` | Hardcoded Catppuccin hex `hover:bg-[#45475a]` (line 63), `bg-[#313244]/50` (line 141) → theme tokens. These are not even from the current Deep Void theme and need to go. |
| `src/components/Toolbar/ImageImportModal.tsx` | Tailwind color utilities throughout: `bg-white`, `dark:bg-gray-900`, `text-gray-700`, `dark:text-gray-300`, `bg-blue-600` (×2), `bg-gray-200`, `bg-blue-500`, `text-gray-600`, `dark:text-gray-400` (lines 98–164). Migrate to token-driven styles. |
| `src/components/Settings/SettingsModal.tsx:144` | `theme.colors.void[950]` → token. |
| `src/components/Settings/StylePreview.tsx` | `theme.colors.void[950]` (line 84); `theme.sidebar.muted` / `surface` / `text` / `border` / `accent` (lines 73, 82–83, 93, 142–144). Migrate wrapper styling; the Konva-rendered preview content stays unchanged. |
| `src/components/Palette/Palette.tsx` | `theme.colors.void[950]` (lines 202, 225); `theme.colors.accent.glow` (line 203). Migrate. |
| `src/components/RecoveryPrompt.tsx` | Uses `theme.sidebar.*` extensively for the (currently dark) modal styling. Even though PR 4 wraps this in the shared Modal frame, PR 1 must migrate the inline styles so the prompt doesn't look broken between PR 1 and PR 4 ships. |
| `src/components/ui/Tooltip.tsx` | Inferred from Toolbar's use of `<Tooltip>`. Audit and migrate any color references. |
| `src/App.tsx` (closed transcript strip) | Uses `theme.sidebar.bgGradient`, `theme.sidebar.border`, `theme.sidebar.textSecondary` for the closed-state strip rendering (lines ~470–480). Migrate to chrome tokens. |

**Tailwind rule (concrete).** The following Tailwind classes are **forbidden** anywhere in the codebase after PR 1:

- Any class setting `color`, `background-color`, `border-color`, `ring-color`, `outline-color`, `fill`, `stroke`, or `accent-color`. This includes named-color utilities (`bg-blue-600`, `text-gray-700`, `border-red-500`, etc.), arbitrary-value color utilities (`bg-[#45475a]`, `text-[#313244]`), and color-from-variable utilities.
- Opacity modifiers on color utilities (`bg-opacity-*`, `text-opacity-*`, `/50`, `/75`, etc.) — color and opacity together come from `rgba()` values or pre-computed tokens.
- **The entire `ring-*` utility family** (`ring`, `ring-2`, `ring-offset-*`, etc.). These set a ring with a default color via CSS variables — banned to prevent invisible color leakage. Use the `focus-ring` token implemented via plain CSS `outline` + `outline-offset` instead.
- **The entire `divide-*` utility family** (`divide-y`, `divide-x`, `divide-gray-200`, etc.). Same reason — implicit color via variables. Use explicit borders from the `border` token.
- **The entire `z-*` utility family** (`z-0`, `z-10`, `z-20`, `z-30`, `z-50`, etc.). The z-index ladder in §4.6 is the single source of truth — all layering uses named tokens, never Tailwind utilities. App.tsx currently uses `z-20`, `z-30`, `z-40`; PR 1 migrates these to `z-hover-zone`, `z-fs-toolbar`, `z-fs-hint`.
- `dark:*` variants of any of the above (the app does not implement a dark mode).

The following Tailwind utilities are **permitted**:

- Layout: `flex`, `grid`, `gap-*`, `min-w-*`, `max-w-*`, `h-*`, `w-*`, `p-*`, `m-*`, `px-*`, `py-*`, etc.
- Typography (non-color): `text-sm`, `text-base`, `font-medium`, `tracking-*`, `leading-*`.
- Borders (non-color): `rounded-*`, `border` (width only), `border-2`.
- Cursor utilities: `cursor-pointer`, `cursor-not-allowed`, `cursor-crosshair`, `cursor-grab` — these set the CSS `cursor` property only, no color.
- Animation: `animate-*`, `transition-*`, `duration-*`, `ease-*`.
- Interactivity: `disabled:*`, `hover:*`, `focus:*` modifiers when paired with permitted utilities.

All color information after PR 1 flows from `theme.ts` tokens via inline `style={{...}}` or CSS variables in `index.css`.

**Touches:** `src/utils/theme.ts`, `src/index.css`, every file in the verification grep that matched chrome.
**Off-limits:** `src/utils/colors.ts`, `src/components/Canvas/**`, the Konva-rendered content inside `src/components/Settings/StylePreview.tsx` (its wrapper styling migrates).
**Verify:** load `test_diagram.json`, confirm canvas + elements pixel-identical; chrome turns sage with no remnants of black shadow, red Tailwind, Catppuccin hex, or removed `theme.colors.*` keys. The verification grep returns only canvas/element hits. Run an AA contrast check (axe DevTools or equivalent) — no violations.

### PR 2 — Toolbar

- Split `Toolbar.tsx` into `Toolbar` (orchestrator) + `ExportMenu.tsx` + `MoreMenu.tsx`.
- Restructure into 4 visible groups with **Load transcript visible** in the View group, plus Export dropdown and a 4-item More menu.
- Implement keyboard navigation for the dropdowns (arrow keys, Enter, Esc, outside-click).
- **Touches:** `src/components/Toolbar/*`, `src/App.tsx` (toolbar props).
- **Off-limits:** Canvas/**, colors.ts.
- **Verify:** every existing toolbar handler still wired; manual test of Save, Open, Import-image, each Export variant, Load transcript, Clear, Reset view, Settings, About; tab order through visible affordances is intuitive; dropdowns close on Escape and outside-click.

### PR 3 — Panels

- Restyle Palette (group headers, plain pills, contributor chips with real colors).
- Restyle Properties (single horizontal row, empty state, Delete-with-icon-and-text).
- Restyle Transcript panel (header, search, line states, closed-strip vertical label, empty state).
- Implement marquee selection styling per §6.4.
- **Touches:** `Palette/Palette.tsx`, `Properties/PropertiesPanel.tsx`, `TranscriptPanel/*.tsx`, the marquee selection chrome (visual styling only), layout glue in `App.tsx`.
- **Off-limits:** Canvas/**, colors.ts, element rendering.
- **Verify:** drag-drop still works from palette; contributor selection preserved; transcript line-to-element linking unchanged; marquee selection still selects the same elements; AA contrast checks pass.

### PR 4 — Modals + notifications

This PR fixes the chrome's overlay system: shared frame for modals, shared toast component for notifications, and `alert()` replacement.

- Extract shared `components/ui/Modal.tsx` (header / body / footer / scrim / focus trap per §7.1).
- Build `components/ui/Toast.tsx` + `useToasts()` Zustand store + `<Toaster>` portal (§9).
- Refit Settings, About, Image Import, Image Lightbox, Image Crop — all wrap their content in `Modal`.
- Refit Recovery prompt with the Sage Garden modal frame (**stays a modal**; see §7.2).
- Replace every `alert()` site per the §9.2 table.
- Restyle the two surviving `confirm()` dialogs (Clear diagram, transcript-orphan) as Sage Garden confirmation modals using the shared `Modal` frame.
- **Touches:** `+components/ui/Modal.tsx`, `+components/ui/Toast.tsx`, `+components/ui/Toaster.tsx`, `+store/toastStore.ts`, `Settings/*.tsx`, `Toolbar/AboutModal.tsx`, `Toolbar/ImageImportModal.tsx`, `ImageEditor/*.tsx`, `RecoveryPrompt.tsx`, anywhere `alert(` or `confirm(` is currently called.
- **Off-limits:** Canvas/**, colors.ts, the existing `StylePreview` Konva component.
- **Verify:** every modal opens / closes; focus traps cycle correctly; tab order inside modals is sensible; Esc closes; Settings edits propagate to canvas; Recovery still restores correctly; every former `alert()` site now shows a toast with the right variant; Clear diagram still requires explicit confirmation.

### PR 5 — Polish

- Canvas empty-state HTML overlay per §8 (sibling to Stage, `pointer-events: none`, isolated z-index).
- Properties + Transcript empty-state final polish.
- Full-screen toolbar Sage Garden restyle per §10.
- Hover / focus / active / disabled state audit across all chrome.
- Cursor styles per §6.4 confirmed for each mode.
- **Touches:** `Canvas/Canvas.tsx` (sibling DOM overlay only — not the Konva stage), `TranscriptPanel/*`, `Properties/PropertiesPanel.tsx`, full-screen logic in `App.tsx`.
- **Off-limits:** Konva stage rendering, colors.ts.
- **Verify:** empty-state hint disappears as soon as an element is added; clicking on the empty canvas still works for drag-drop targeting (confirms `pointer-events: none` is correctly applied); full-screen entry / exit still smooth; tab focus order intact across the entire app.

## 12. Safeguards

Each PR enforces these protections:

1. **Locked-file list.** PR descriptions list `src/components/Canvas/**` and `src/utils/colors.ts` as off-limits. Reviewer (Jennifer) verifies the diff doesn't touch them. PR 5 touches `Canvas/Canvas.tsx` to add an empty-state overlay — that exception is called out explicitly and is limited to adding a sibling `<div>` outside the Konva `<Stage>`.
2. **Visual regression check.** Before merging each PR: load `test_diagram.json`, screenshot the canvas, diff against a pre-rehaul reference screenshot. Element rendering must be pixel-identical. Chrome difference is expected.
3. **Token-driven boundary.** Chrome reads from `theme.ts`; element rendering reads from `colors.ts`. The two files stay disjoint — no value flows between them. The Settings preview achieves faithful element rendering by using the existing Konva `StylePreview` component.
4. **Accessibility gate.** Each PR runs an automated AA contrast check (axe DevTools or equivalent) on the changed surfaces. PR 4 additionally verifies modal focus management with a manual keyboard-only run-through.
5. **Behavior preservation.** Each PR's verify section enumerates the workflows that must still pass. No PR is merged until those workflows confirm.

## 13. Open questions

None at this time. All directional choices answered during brainstorm and two Gemini adversarial reviews:

- Aesthetic: Sage Garden (light, organic, calm).
- Toolbar: hybrid — 14 visible (including Load transcript and Reset view) + Export dropdown + 3-item More overflow.
- Panels: keep 4-region layout, just breathe.
- Scope: chrome only, canvas + elements + connection rendering + marquee selection sealed; HTML overlay is sibling-of-Stage with `pointer-events: none`.
- Intensity: considered rehaul (palette + toolbar + panels + modals + notifications + empty states + polish).
- Recovery: stays a modal.
- Build: 5 incremental PRs.
- Accessibility: WCAG AA contrast for chrome text; AA non-text contrast for focus rings against every chrome background; destructive actions combine `danger` token + icon + text (never color alone); confirmation modals default-focus Cancel; warning toasts persist.
- Toast policy: only `info` auto-dismisses (5s). `warning` + `error` persist. `error` has explicit Copy button (no click-anywhere-to-copy).
- Z-index: explicit numeric ladder per §4.6, no raw z-index values in components.
- `alert()`: every call site replaced in PR 4. Verification is `grep` returning zero hits.
- Tailwind: layout / typography / cursor / animation utilities allowed; every color-related utility forbidden, including arbitrary-value (`bg-[#…]`) and opacity modifiers.
- Tablet / mobile: out of scope; deferred until requested.

## 14. References

- Brainstorm mockups: `.superpowers/brainstorm/45154-1778595783/content/` (Section 1 visual language, Section 2 toolbar, Section 3 panels, Section 4 modals, Section 5 build, corrected-element-rendering screen).
- Adversarial reviews (Gemini 2.5 Pro, 2026-05-12): v1 reviewed → v2; v2 reviewed → v3; v3 reviewed → v4. All three rounds folded in.
- Element rendering rules: `src/utils/colors.ts`, `docs/REQUIREMENTS.md` §2.2 and §2.3.
- Existing theme tokens (to be replaced): `src/utils/theme.ts`, `src/index.css` (`:root` CSS custom properties).
- Existing Settings preview (Konva content unchanged; wrapper migrates): `src/components/Settings/StylePreview.tsx`.
- Marquee selection (verified Konva-rendered, sealed): `src/components/Canvas/SelectionRect.tsx`.
- Deferred work that may interact with this rehaul: `2026-04-26-configurable-element-styles-design.md`.
- Project memories that constrain this work: `etd-design-decisions-anchor-on-annas-diagrams.md`, `etd-ui-rehaul-scope.md`, `etd-element-taxonomy.md`.
