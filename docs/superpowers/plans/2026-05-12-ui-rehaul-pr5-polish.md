# UI rehaul · PR 5 — Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the last set of finishing touches for the Sage Garden chrome rehaul — a canvas empty-state HTML overlay, a small icon for the Properties empty state, a verified-clean Transcript empty state, a verified-clean full-screen toolbar / hint, a hover/focus/active/disabled state audit across all chrome (focus rings are the biggest gap), and verified mode cursors. After this PR, the rehaul is complete and the dual repo (jenkleiman.com) is redeployed.

**Architecture:** PR 5 is finishing work, not new architecture. The only net-new code is (a) a sibling `<div>` inside `Canvas.tsx` (outside the Konva `<Stage>`) that renders a faint hint when the diagram is empty, and (b) a small `MousePointer2` icon in the Properties empty state. Everything else is targeted edits to existing styled elements: add Sage focus rings to the ~14 form controls / inputs in Properties + the diagram-title input + the Transcript search input, verify the full-screen wrapper + entry hint already conform to §10 from PR 1 work (and patch if they don't), and verify mode cursors via grep + browser test.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS (layout / typography / cursor utilities only — color utilities still forbidden in chrome per PR 1 rule), `lucide-react` icons (`ArrowLeft`, `MousePointer2`). No new runtime dependencies. No new files.

**Spec:** `docs/superpowers/specs/2026-05-12-ui-rehaul-design.md` (v4) §6.2 + §6.3 + §6.4 + §8 + §10 + §11 "PR 5 — Polish". This plan implements PR 5 only — the final PR of the UI rehaul.

**Sealed (do not touch in this PR):**
- `src/components/Canvas/**` Konva rendering — the `<Stage>` block, every `<Layer>` / `<Group>` / element shape, marquee rect (`SelectionRect.tsx`), connection lines, selection highlights, resize handles. **PR 5's one Canvas-area edit is a sibling `<div>` next to `<Stage>` in `Canvas.tsx`** — the Stage block itself is untouched.
- `src/utils/colors.ts` — element / contributor / support semantic colors.
- `src/utils/theme.ts` — every token PR 5 needs is already present from PR 1 (`focus.ring`, `sidebar.*`, `button.*`, `shadow.*`, `z.canvasOverlay`, `z.fsToolbar`, `z.fsHint`). No new tokens required.
- The two existing status overlays in `Canvas.tsx` (connect-mode banner line 838–846, pan-mode banner line 849–853) — they still use Tailwind color utilities (`bg-blue-500`, `bg-gray-700`, `text-white`). These are out of scope for PR 5 (they're informational status, not part of the hover/focus/active/disabled interactive-state audit), but flagged here so a reviewer doesn't expect them to change. Future cleanup ticket.
- All store actions and reducer logic.
- `Toolbar/*`, `Palette/*`, `Settings/*`, modal contents — the audit *reads* their interactive classes to verify focus / hover / active / disabled coverage, and patches any focus-ring gaps found, but does not restyle anything else. Edits are limited to adding focus-ring outline styles to inputs / buttons that currently have `focus:outline-none` with no replacement.

---

## File map

**Create:** none.

**Modify (6 files):**
- `src/components/Canvas/Canvas.tsx` — add empty-state sibling `<div>` between the existing status-banner overlays and the `<Stage>`. Reads `elements` from `useDiagramStore()` (already destructured in the component). Renders only when `elements.length === 0`. Uses `theme.z.canvasOverlay` for z-index and `pointer-events: none` so canvas drag/drop still works.
- `src/components/Properties/PropertiesPanel.tsx` — (a) add a small `MousePointer2` icon above the italic hint in the empty state (Sage muted color, 24px), (b) replace `focus:outline-none` on every `<select>` / `<input>` / `<textarea>` with a Sage focus ring (2px outline in `theme.focus.ring`, 2px offset). ~14 form controls.
- `src/components/TranscriptPanel/TranscriptPanel.tsx` — replace `focus:outline-none` on the search input with the same Sage focus-ring treatment.
- `src/components/Toolbar/Toolbar.tsx` — replace the title input's `outline-none` (line 241) with the Sage focus-ring treatment. The input is the diagram-name field at the top-left of the toolbar.
- `src/App.tsx` — verify the full-screen wrapper + entry-hint pill already conform to spec §10 (they should — PR 1's foundation work landed the `theme.sidebar.*` / `theme.shadow.*` swap). If a discrepancy is found during the audit task, patch it. No proactive edits.
- `src/components/Canvas/InlineEditor.tsx` — out of scope. It lives inside the Konva stage as an HTML overlay positioned over the editing element. PR 5 doesn't touch it.

---

## Coordinated edits and naming

- The Sage focus-ring pattern is applied identically to every patched control. The exact attribute is `style={{ outlineColor: theme.focus.ring }}` plus the Tailwind classes `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`. **Always remove the existing `focus:outline-none` from the className when adding this pattern** — the two conflict.
- `focus-visible` (not `focus`) so the ring only shows for keyboard navigation. Mouse-clicked inputs don't get the ring, matching WCAG AAA practice and avoiding visual noise.
- Form-control elements that already have a colored `borderFocus` reaction (PR 3 wired up `theme.input.borderFocus` via JS `onFocus` handlers in some places) keep that behavior. The Sage outline ring is *additional*, not a replacement. They coexist: border reacts to mouse focus, outline ring only appears on keyboard focus.

---

## Verification baseline

Before Task 1 (and again before Task 7's final verification), confirm the working tree is clean and lint+typecheck are green:

```bash
git status                       # expect: clean tree, or only untracked files
npm run lint                     # expect: 0 errors, 0 warnings (clean from PR 4 audit)
npm run typecheck                # expect: clean
```

If either command reports issues before PR 5 starts, stop and report — the baseline must be clean before this plan can be trusted.

---

## Task 1: Canvas empty-state HTML overlay

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx` (insert sibling `<div>` after the pan-mode banner, before `<Stage>`)

The spec (§8) calls for a faint centered hint inside the canvas viewport when the diagram is empty: small left-arrow icon + "Drag an element from the palette to start. Or import from an image." Color `#aaa`, font-size 12. Disappears when the first element is added. **Rendered as a sibling `<div>` to the Konva `<Stage>` inside `Canvas.tsx`, not as a child of the Stage.** Wrapper has `pointer-events: none` so it never intercepts canvas mouse / drag events. Its `z-index` sits above the canvas background but below any toolbar overlay (use `theme.z.canvasOverlay = 1`).

- [ ] **Step 1: Verify `elements` is already destructured from the store and add the `ArrowLeft` import**

Open `src/components/Canvas/Canvas.tsx`. Find line 103 — `elements,` should already be in the destructure block from `useDiagramStore()`. Confirm it is. If it's not (it should be — many handlers reference `elements`), this plan needs revisiting.

Find the existing `lucide-react` import line at the top of the file. (Grep: `grep -n "from 'lucide-react'" src/components/Canvas/Canvas.tsx`.) If `ArrowLeft` is not already imported, add it. If `lucide-react` isn't imported anywhere in this file yet, add a fresh import:

```tsx
import { ArrowLeft } from 'lucide-react';
```

- [ ] **Step 2: Add the empty-state overlay just before the `<Stage>` element**

Locate the existing block:

```tsx
      {/* Pan mode indicator */}
      {isPanMode && (
        <div className="absolute top-16 left-64 z-10 bg-gray-700 text-white px-3 py-1 rounded-b text-sm flex items-center gap-2">
          <span>Pan Mode</span>
          <span className="text-gray-400 text-xs">Release Space to exit</span>
        </div>
      )}

      <Stage
```

Insert the empty-state overlay between the pan-mode block's closing `)}` and the `<Stage` opening tag:

```tsx
      {/* Empty-state hint — sibling of <Stage>, NEVER a child.
          pointer-events:none so canvas drag/drop is unaffected. */}
      {elements.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ zIndex: theme.z.canvasOverlay }}
          aria-hidden="true"
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: '#aaa' }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Drag an element from the palette to start. Or import from an image.</span>
          </div>
        </div>
      )}

      <Stage
```

Confirm `theme` is already imported in this file. (Grep: `grep -n "from '\.\./\.\./utils/theme'" src/components/Canvas/Canvas.tsx`.) If not, add `import { theme } from '../../utils/theme';` to the import block.

- [ ] **Step 3: Run lint + typecheck**

```bash
npm run lint
npm run typecheck
```

Expected: clean. If lint flags an unused import or typecheck flags a missing symbol, fix it before moving on.

- [ ] **Step 4: Browser-verify the overlay**

```bash
npm run dev
```

Open the dev URL. Empty canvas should show the centered hint with the left-arrow icon and the exact wording. Verify:
- Hint is centered horizontally and vertically.
- Color is faint gray (`#aaa`), small font.
- Drag an element from the palette onto the canvas — the hint disappears as soon as the element lands.
- Press Cmd+Z to undo (or click the trash to clear) — hint reappears.
- Hover the empty canvas — cursor remains default (not blocked). Drag-drop a palette item directly onto the spot the hint covered — drop works (confirms `pointer-events: none`).
- Press F to enter full-screen — hint still visible, still doesn't intercept clicks.

If any of these fail, fix and re-verify before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "feat(pr5): canvas empty-state hint — sibling of Konva Stage, pointer-events: none

Per spec §8: when elements.length === 0, render a faint centered hint
inside the canvas viewport with a left-arrow icon + 'Drag an element
from the palette to start. Or import from an image.' The hint is a
sibling of <Stage> (not a child), wrapped in pointer-events: none so it
never intercepts drag/drop. z-index reads from theme.z.canvasOverlay (1)
— above the canvas background, below the toolbar.

Konva stage rendering is untouched."
```

---

## Task 2: Properties empty-state icon

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx`

The Properties empty state already has a dashed-border placeholder with italic hint text. Spec §6.2 only mandates the dashed border + italic hint + matched height — all three are already in place from PR 3. The "final polish" item in PR 5 is interpretive — for visual parity with the Transcript empty state (which has a `FileText` icon above its hint), add a small `MousePointer2` icon above the italic line. Use the same color token (`theme.sidebar.muted`) and same `aria-hidden` pattern.

- [ ] **Step 1: Add the `MousePointer2` import**

Open `src/components/Properties/PropertiesPanel.tsx`. Find the existing `lucide-react` import line. (Grep: `grep -n "from 'lucide-react'" src/components/Properties/PropertiesPanel.tsx`.) Add `MousePointer2` to the named import. Example before / after:

```tsx
// before
import { Trash2 } from 'lucide-react';
// after
import { MousePointer2, Trash2 } from 'lucide-react';
```

If `lucide-react` isn't imported in this file yet (it should be — Trash2 is used for Delete), add the import.

- [ ] **Step 2: Place the icon above the existing italic hint**

Find the current empty-state block at lines 179–189:

```tsx
        <div
          className="m-4 rounded-md flex items-center justify-center text-sm italic h-[calc(100%-2rem)] min-h-20"
          style={{
            color: theme.sidebar.textSecondary,
            borderWidth: '1px',
            borderStyle: 'dashed',
            borderColor: theme.sidebar.border,
          }}
        >
          No element selected · click an element on the canvas to edit it
        </div>
```

Replace the single text child with a flex column containing the icon + the text. Keep the outer container's classes and styles unchanged so the height match against the filled-state is preserved:

```tsx
        <div
          className="m-4 rounded-md flex flex-col items-center justify-center gap-2 text-sm italic h-[calc(100%-2rem)] min-h-20"
          style={{
            color: theme.sidebar.textSecondary,
            borderWidth: '1px',
            borderStyle: 'dashed',
            borderColor: theme.sidebar.border,
          }}
        >
          <MousePointer2
            size={24}
            aria-hidden="true"
            style={{ color: theme.sidebar.muted }}
          />
          <span>No element selected · click an element on the canvas to edit it</span>
        </div>
```

Three changes from the original:
- `flex items-center justify-center` → `flex flex-col items-center justify-center gap-2` (stack vertically with 8px gap)
- text child wrapped in `<span>` so the icon sits on its own line above
- `<MousePointer2 size={24}>` icon added above the span, hidden from a11y tree, muted color

- [ ] **Step 3: Run lint + typecheck**

```bash
npm run lint
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Browser-verify the icon**

With `npm run dev` running, click an empty area of the canvas to deselect everything. Properties panel at the bottom shows the empty state. Verify:
- `MousePointer2` icon (small mouse arrow) sits above the italic hint.
- Icon color is the Sage muted color (matches the hint text color closely — both reading from `theme.sidebar.*`).
- Gap between icon and hint is comfortable (~8px from `gap-2`).
- Empty-state height still matches the filled-state height — load `test_diagram.json` and select an element, then deselect; the canvas above shouldn't shift.

- [ ] **Step 5: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "feat(pr5): add MousePointer2 icon to Properties empty state

Matches the visual treatment of the Transcript empty state (icon above
hint). MousePointer2 at 24px in theme.sidebar.muted, flex-col with
gap-2. Outer container retains its height-match against the filled
state so the canvas doesn't shift when selection changes."
```

---

## Task 3: Transcript empty-state — verification only

**Files:**
- Read: `src/components/TranscriptPanel/TranscriptPanel.tsx`

PR 3 already implemented the Transcript empty state to spec §6.3: `FileText` icon, italic hint, inline "Load transcript" button. PR 5's "final polish" is a verification pass — nothing should need to change.

- [ ] **Step 1: Open the empty state in the browser and verify against spec §6.3**

Reload the dev page and ensure no transcript is loaded (click the trash on any transcript, or refresh into a clean state). Open the Transcript panel via the toolbar toggle. Verify:
- Centered `FileText` icon (~28px) in Sage muted color.
- Single-line italic hint: "No transcript loaded · load a .txt file to link argument elements to spoken lines."
- Inline "Load transcript" button below the hint with `Upload` icon, Sage secondary button styling.
- Clicking "Load transcript" opens the file picker. Picking a valid `.txt` transcribes loads it (existing behavior).

If anything in the rendered state diverges from spec §6.3, log the divergence in this task block as a follow-up step and patch it. Otherwise, no code change.

- [ ] **Step 2: No commit if no code changed**

If no edits were needed, do not create an empty commit. Move on to Task 4.

---

## Task 4: Full-screen toolbar — spec §10 verification

**Files:**
- Read: `src/App.tsx` (lines 415–442 full-screen wrapper, lines 489–504 entry hint)

PR 1's foundation work migrated the full-screen wrapper shadow and the entry-hint pill from hardcoded `rgba(0,0,0,*)` values to `theme.shadow.md` / `theme.sidebar.*` tokens. The pre-flight read on 2026-05-12 confirms both blocks already consume Sage Garden tokens. This task is a spec-conformance verification, not an edit.

- [ ] **Step 1: Re-read `src/App.tsx:421–449` and `src/App.tsx:489–504`**

Confirm:
- Wrapper (lines 425–442): uses `theme.z.fsToolbar` for z-index; uses `theme.shadow.md` for `boxShadow` when toolbar is hovered; translate animation reads `prefersReducedMotion`.
- Entry hint pill (lines 489–504): uses `theme.z.fsHint`, `theme.sidebar.bg`, `theme.sidebar.text`, `theme.sidebar.border`, `theme.shadow.sm`. No raw `rgba(0,0,0,*)` values.

Spec §10 also mentions a "`chrome-bg` background" and "`border-strong` bottom border" on the wrapper. In practice, the inner `<Toolbar>` component (`src/components/Toolbar/Toolbar.tsx:222–227`) carries its own `theme.toolbar.bgGradient` background + `theme.toolbar.border` bottom border. The wrapper itself stays transparent — the Toolbar inside provides the chrome surface. This is consistent with spec intent: the visible full-screen toolbar surface uses Sage tokens. **No code change required for this item** — note the resolution in the commit message of the final ship task (Task 8).

- [ ] **Step 2: Browser-verify the full-screen flow**

Press F to enter full-screen. Verify:
- Toolbar slides up off the top; entry-hint pill appears bottom-right with Sage styling (light sage background, dark sage text, sage border, soft shadow).
- After 2.5s, the hint fades out.
- Move the mouse to the very top of the screen — toolbar slides down. Shadow is soft Sage shadow, not harsh black.
- Toolbar styling (gradient + border + button colors) is identical to non-full-screen Toolbar.
- Press F again — toolbar / hint behavior reverses cleanly.
- Press Esc inside full-screen — exits full-screen.

If everything checks out, no edit. If anything looks wrong (still using black rgba values, hint pill positioned wrong, shadow off), patch with a targeted edit and commit. Otherwise, no commit.

---

## Task 5: Focus-ring audit — Properties panel form controls

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx`

Every form control in the Properties panel currently has `focus:outline-none` with no replacement ring — a WCAG AA failure for keyboard users. There are ~14 controls (selects, inputs, textareas) that need the Sage focus-ring pattern. Spec §11 PR 1 + PR 5 §11 mandate: keyboard focus shows a visible 2px outline in `theme.focus.ring` color with 2px offset.

The pattern to apply:
- Tailwind: add `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`
- Inline style: add `outlineColor: theme.focus.ring` to the existing `style={...}` object (or create one if absent)
- Remove the existing `focus:outline-none` class from the className string

`focus-visible` (not `focus`) is intentional — keyboard navigation triggers the ring; mouse clicks don't, matching WCAG AAA practice.

- [ ] **Step 1: Enumerate every `focus:outline-none` site in `PropertiesPanel.tsx`**

```bash
grep -n "focus:outline-none" src/components/Properties/PropertiesPanel.tsx
```

Expected: ~14 lines (matching the grep results recorded during plan-writing: lines 234, 243, 262, 282, 306, 326, 343, 370, 401, 422, 449, 465, 476 — plus any new ones added since). Hold this list — every line gets the same edit.

- [ ] **Step 2: Apply the focus-ring pattern to each control**

For each enumerated line, edit the className string and the style object together. Example transformation:

```tsx
// before (line 234, label input):
<input
  type="text"
  ...
  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-32 focus:outline-none"
  style={{
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
  }}
/>

// after:
<input
  type="text"
  ...
  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-32 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
  style={{
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  }}
/>
```

Repeat for every line from Step 1's grep output. The change is mechanical and identical at every site. The exact starting className may vary (`capitalize`, `w-32`, `w-20`, `min-h-[60px]`, etc.) — only the `focus:outline-none` → `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2` swap matters, plus the `outlineColor: theme.focus.ring` addition to the style object.

When a control has no `style={...}` object (rare in this file — most reach for theme tokens), introduce one with just `outlineColor: theme.focus.ring`.

- [ ] **Step 3: Grep again to confirm zero `focus:outline-none` instances remain**

```bash
grep -n "focus:outline-none" src/components/Properties/PropertiesPanel.tsx
```

Expected: no output (zero matches). If matches remain, return to Step 2 and patch them.

Also confirm the replacement is in place:

```bash
grep -c "focus-visible:outline-offset-2" src/components/Properties/PropertiesPanel.tsx
```

Expected: a number matching the count from Step 1's grep (i.e., every removed `focus:outline-none` was replaced).

- [ ] **Step 4: Run lint + typecheck**

```bash
npm run lint
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Browser-verify the focus rings**

With `npm run dev` running and a diagram element selected (so the Properties panel is filled), Tab through every control:
- Label input, Value textarea, Contributor select (or pills), Argument-type select (or pills), Image-related controls, color picker, etc.
- Each focused control must show a dark Sage outline (2px, 2px gap from the border).
- Click each control with the mouse — outline should NOT appear (because `focus-visible`, not `focus`).
- Tab again from elsewhere — outline reappears.

If any control doesn't show the ring on keyboard focus, Step 2 missed it. Re-grep and patch.

- [ ] **Step 6: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "feat(pr5): Properties form controls — Sage focus rings for keyboard a11y

Every <select>, <input>, and <textarea> in the Properties panel had
focus:outline-none with no replacement ring — WCAG AA failure for
keyboard users. Replace with focus-visible:outline + outline-2 +
outline-offset-2 + outlineColor: theme.focus.ring. focus-visible (not
focus) means mouse clicks don't trigger the ring — only keyboard
navigation does, matching WCAG AAA practice.

~14 controls patched. Behavior unchanged for mouse users."
```

---

## Task 6: Focus-ring audit — Transcript search input + Toolbar title input

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx`
- Modify: `src/components/Toolbar/Toolbar.tsx`

Same pattern as Task 5, applied to two more sites discovered during the audit grep:
- `TranscriptPanel.tsx:225` — search input above the transcript list, uses `focus:outline-none`.
- `Toolbar.tsx:241` — diagram-name input at the top-left of the toolbar, uses `outline-none` (no `focus:` prefix).

- [ ] **Step 1: Patch the Transcript search input**

Open `src/components/TranscriptPanel/TranscriptPanel.tsx`, find line 225 (or grep `focus:outline-none src/components/TranscriptPanel/TranscriptPanel.tsx`).

Edit the input from:

```tsx
className="w-full pl-8 pr-2.5 py-1.5 text-sm rounded-md border transition-colors duration-150 focus:outline-none"
```

to:

```tsx
className="w-full pl-8 pr-2.5 py-1.5 text-sm rounded-md border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
```

Add `outlineColor: theme.focus.ring` to the existing `style={...}` object on the same element. (`theme` is already imported in this file.)

- [ ] **Step 2: Patch the Toolbar title input**

Open `src/components/Toolbar/Toolbar.tsx`, find line 241 (the `<input>` with the diagram name).

Edit from:

```tsx
className="text-base font-semibold tracking-tight bg-transparent border-none outline-none min-w-[200px]"
style={{ color: theme.sidebar.text }}
```

to:

```tsx
className="text-base font-semibold tracking-tight bg-transparent border-none min-w-[200px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
style={{ color: theme.sidebar.text, outlineColor: theme.focus.ring }}
```

Three changes from the original:
- Drop `outline-none` from the className.
- Add the four `focus-visible:` outline classes.
- Add `rounded-sm` so the outline ring has a small rounded shape rather than sharp corners that would draw attention. (The input has no visible border, so the outline is the only frame.)
- Add `outlineColor: theme.focus.ring` to the style object.

- [ ] **Step 3: Run lint + typecheck + grep verification**

```bash
npm run lint
npm run typecheck
grep -n "focus:outline-none\|outline-none" src/components/TranscriptPanel/TranscriptPanel.tsx src/components/Toolbar/Toolbar.tsx
```

Expected: lint + typecheck clean; the grep returns no matches in either file (both `focus:outline-none` and standalone `outline-none` are gone from these two files).

- [ ] **Step 4: Browser-verify both inputs**

With `npm run dev`:
- Tab into the Transcript search input — Sage outline appears.
- Tab into the toolbar title input (click somewhere else first, then Tab repeatedly until focus lands there, or Shift+Tab from the next control) — Sage outline appears around the diagram-name text.
- Type in each input — focus stays, outline stays.
- Click each with the mouse — no outline (because `focus-visible`).

- [ ] **Step 5: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanel.tsx src/components/Toolbar/Toolbar.tsx
git commit -m "feat(pr5): Transcript search + Toolbar title input — Sage focus rings

Two more focus:outline-none / outline-none sites flagged by the audit
grep. Same pattern as the Properties panel: focus-visible:outline +
outline-2 + outline-offset-2 + outlineColor: theme.focus.ring.

Toolbar title input also gains rounded-sm so the keyboard focus ring
has a softened shape — the input itself has no visible border, so the
outline is the only frame."
```

---

## Task 7: Hover / focus / active / disabled audit — verification pass across remaining chrome

**Files:**
- Read: `src/components/Palette/Palette.tsx`, `src/components/Toolbar/IconButton.tsx`, `src/components/Toolbar/MenuItem.tsx`, `src/components/Settings/*`, `src/components/ui/Modal.tsx`, `src/components/ui/Toast.tsx`, `src/App.tsx`

The remaining chrome was styled during PR 1–4 and most interactive elements already have hover / disabled coverage. This task is a focused audit pass to verify nothing was missed:
- **Hover:** Every button and clickable surface should change appearance on hover (background lightens, shadow grows, border tightens, or some combination).
- **Focus:** Every interactive element reachable by Tab should show the Sage focus ring on `focus-visible`. (Buttons that don't have explicit ring styling fall back to the browser default outline — verify that's still visible against the Sage backgrounds; if not, add the ring pattern.)
- **Active:** Every button that supports a toggled or pressed state (toolbar groups, palette type pills, mode toggles) should visually reflect that state.
- **Disabled:** Every disabled control should have `disabled:opacity-40 disabled:cursor-not-allowed` or equivalent. PR 4's audit found `IconButton.tsx`, `MenuItem.tsx`, `PropertiesPanel.tsx` (Duplicate/Delete), `Palette.tsx` (type buttons) already carry this — verify each is still in place.

- [ ] **Step 1: Audit grep — find any remaining `focus:outline-none` or naked `outline-none` in `src/`**

```bash
grep -rn "focus:outline-none\|\boutline-none\b" src/
```

Expected output after Tasks 5 + 6: the only remaining match is `src/components/Canvas/InlineEditor.tsx` line 82 (`outline-none` on the inline text editor for Konva elements). **InlineEditor is canvas-internal — out of scope for PR 5.** Verify the only match is this one line. If anything else shows up, patch it with the focus-ring pattern (Tasks 5/6 template) before continuing.

- [ ] **Step 2: Audit grep — confirm `cursor-not-allowed` coverage on disabled chrome buttons**

```bash
grep -rn "disabled:" src/components/Toolbar/ src/components/Palette/ src/components/Properties/ src/components/TranscriptPanel/
```

Expected: every interactive control that can be disabled (toolbar IconButtons, MenuItems, palette type buttons, Properties Duplicate/Delete) carries `disabled:opacity-40 disabled:cursor-not-allowed` (or equivalent). If any disabled site is missing the cursor class, patch it.

- [ ] **Step 3: Browser-walk every interactive surface**

With `npm run dev` running and a non-empty diagram loaded:

**Toolbar (top):**
- Hover each icon button — background lightens, slight scale-up.
- Tab through icon buttons — Sage outline ring on each `focus-visible`.
- Open Export dropdown — hover each menu item, item background changes.
- Trigger a disabled state (e.g., Undo when no history exists) — button shows `cursor-not-allowed` + opacity 40% + no hover change.

**Palette (left):**
- Hover each type pill — background lightens to Sage `chrome-bg`, border tightens, soft shadow.
- Tab through type pills — Sage outline ring on each.
- Hover each contributor chip — same hover pattern.
- Click a type pill to begin drag — active feedback (the pill stays styled while held).

**Properties (bottom, filled state):**
- Tab through every input/select/textarea — Sage outline ring (verified in Task 5).
- Hover the Duplicate and Delete buttons — Delete should darken to `danger.bgHover`, Duplicate to `secondary.bgHover`.
- If a Duplicate-disable condition exists, trigger it and confirm `cursor-not-allowed` + opacity.

**Transcript panel:**
- Hover the close button (X) on the panel header — background changes.
- Tab into the search input — Sage ring (verified in Task 6).
- Hover a transcript line that's linked to a selected element — `theme.sidebar.surfaceActive` background.
- Hover an unlinked transcript line — `theme.sidebar.hover` background.
- Tab through the close button + search input — Sage rings on both.

**Settings modal (open via toolbar gear):**
- Tab through each section — Sage rings appear on inputs / type pills / contributor swatches / Reset / Done buttons.
- Hover each button — Sage hover background.
- Esc closes the modal (verified during PR 4); confirm again.

**Toasts:**
- Trigger an error toast (e.g., try loading an invalid file). Hover the close `×` and Copy buttons — both have hover states.
- Tab into the toast — both buttons reachable; both show Sage outline rings.

**Confirmation modals (Clear diagram, transcript-orphan):**
- Trigger Clear-diagram confirm. Tab through buttons. Cancel is default-focused (per PR 4 spec). Both buttons show Sage rings.

For every surface, log any divergence in this task block. If a divergence is small and clear-fix (e.g., a single button missing `disabled:cursor-not-allowed`), patch it. If a divergence is large and ambiguous, flag it as a follow-up and continue.

- [ ] **Step 4: Patch any audit findings**

For each finding from Step 3, apply a targeted edit. Examples:
- If a button is missing `disabled:cursor-not-allowed`, add it to the className.
- If a button has no visible focus ring against the Sage backgrounds and the browser default is invisible, apply the focus-ring pattern from Task 5.
- If a hover state is missing on a clickable surface, add an `onMouseEnter`/`onMouseLeave` pair that tweaks `backgroundColor` (matching the established Sage hover pattern in `TranscriptPanel.tsx`, `Toolbar.tsx`, etc.).

If no findings, no edit. If findings exist, run lint + typecheck after patching.

- [ ] **Step 5: Commit (only if Step 4 made edits)**

If any audit patches were applied:

```bash
git add <files-edited-in-step-4>
git commit -m "feat(pr5): hover/focus/active/disabled audit — fix <specific findings>

Audit pass per spec §11 PR 5 found <one-line description of what was
missing>. Applied <one-line description of the patch>. Behavior
otherwise unchanged."
```

If no audit patches were applied, do not create an empty commit. Log "Audit clean — no patches needed" in the task block and move on.

---

## Task 8: Cursor styles — §6.4 verification

**Files:**
- Read: `src/components/Canvas/Canvas.tsx:832`, `src/components/Toolbar/IconButton.tsx:49`, `src/components/Toolbar/MenuItem.tsx:33`, `src/components/Properties/PropertiesPanel.tsx:147`, `src/components/Palette/Palette.tsx:254`

Spec §6.4 mandates three cursor states:
- `cursor-crosshair` when connect mode is active.
- `cursor-grab` while panning.
- `cursor-not-allowed` on disabled chrome buttons (Toolbar, Properties, Palette).

This task is verification — these cursors were already wired up during PR 1–4. Confirm with grep + browser.

- [ ] **Step 1: Grep-verify the three cursor patterns**

```bash
grep -n "cursor-crosshair" src/components/Canvas/Canvas.tsx
grep -n "cursor-grab" src/components/Canvas/Canvas.tsx
grep -rn "cursor-not-allowed" src/components/
```

Expected:
- `Canvas.tsx:832` shows both `cursor-crosshair` (when `connectMode`) and `cursor-grab` (when `isPanMode`) in the same className ternary.
- `cursor-not-allowed` appears in `IconButton.tsx`, `MenuItem.tsx`, `Palette.tsx`, `PropertiesPanel.tsx`.

If any are missing, this plan needs revisiting — log the gap and patch with a targeted edit.

- [ ] **Step 2: Browser-verify each cursor**

With `npm run dev` running:
- Toggle connect mode (palette toggle or keyboard shortcut C). Move the cursor over the canvas — pointer is a crosshair.
- Toggle off connect mode. Press and hold Space — pointer is a grab cursor (open hand).
- Trigger a disabled state on a Toolbar button (e.g., Undo when no history). Hover the disabled button — pointer is the `not-allowed` symbol.
- Test the same on a disabled Palette type button (rare — most palette buttons are always enabled), and a disabled Duplicate / Delete in Properties.

- [ ] **Step 3: No commit if grep + browser checks pass**

No edits expected. If a verification fails and a patch is needed, commit it with the message:

```bash
git commit -m "feat(pr5): cursor state — fix <missing cursor>

Spec §6.4 requires <cursor-X> on <surface>. Added <className>."
```

Otherwise, move to Task 9.

---

## Task 9: Full PR verification

**Files:** all of `src/` (verification only)

Before shipping, run the final battery:

- [ ] **Step 1: Lint + typecheck + build**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all three clean. The build must succeed — PR 5 is deploy-bound.

- [ ] **Step 2: Spec-compliance summary grep**

```bash
# Should return only InlineEditor.tsx:82 (canvas-internal, out of scope):
grep -rn "focus:outline-none\|\boutline-none\b" src/

# Should return zero matches — every alert() was replaced in PR 4:
grep -rEn '\balert\(' src/

# Should return only the two remaining intentional confirm() calls inside
# SubtypeListEditor + Settings — top-level confirms were replaced in PR 4:
grep -rEn '\bconfirm\(' src/
```

Expected results per the comment on each grep. Document each grep's output in the task block as a final spec-compliance receipt.

- [ ] **Step 3: Full browser workflow**

With `npm run dev` running, walk every PR-5-affected surface once more:
1. Fresh empty diagram → see Canvas empty-state hint with arrow icon.
2. Click empty Properties area → see Properties empty-state with MousePointer2 icon.
3. Open Transcript panel with nothing loaded → see Transcript empty state with FileText icon + Load button.
4. Tab through Properties form controls (with an element selected) → every focus gets Sage ring.
5. Tab into Transcript search → Sage ring.
6. Tab into Toolbar title input → Sage ring.
7. Drag-drop an element onto the empty hint → drop works (no `pointer-events` block).
8. Enter full-screen with F → toolbar slides up; hint pill appears with Sage styling; auto-dismisses after 2.5s.
9. Move mouse to top in full-screen → toolbar slides back in with Sage shadow.
10. Trigger an error (load an invalid file) → error toast appears, has Sage focus ring on close + copy.
11. Click "Clear diagram" → confirmation modal opens with Sage frame, Cancel default-focused.
12. Hover every cursor state — crosshair (connect mode), grab (Space-held pan), not-allowed (any disabled chrome button).

If every step works without visual regression, PR 5 is ready to ship.

- [ ] **Step 4: Visual regression check — load `test_diagram.json`**

Spec §11 safeguard #2: "load `test_diagram.json`, screenshot the canvas, diff against a pre-rehaul reference screenshot. Element rendering must be pixel-identical."

Load `test_diagram.json` via the toolbar Load button. The Konva-rendered elements should look identical to pre-rehaul. PR 5 touches no canvas-internal rendering, so this should pass trivially — but it's the final safeguard against any regression slipping in through the empty-state overlay.

If a regression shows up (an element's color, border, or shape changes), stop. PR 5 should not be shipping. Diagnose and revert.

---

## Task 10: Ship — commit, push, build, dual-repo deploy

**Files:** `dist/` (build output), `~/Documents/GitHub/jenkleiman.com/public/tools/etd/` (target)

The dual-repo deploy ritual per `CLAUDE.md`.

- [ ] **Step 1: Verify all PR 5 commits are on `main` (this branch)**

```bash
git log --oneline -20
```

Expected: every PR 5 commit from Tasks 1–8 visible in recent history. Earlier PR 1–4 commits also visible.

- [ ] **Step 2: Push to origin**

```bash
git push origin main
```

Expected: clean push, no upstream conflicts (we've been working on `main` linearly per PR 1–4 precedent).

- [ ] **Step 3: Build production bundle**

```bash
npm run build
```

Expected: clean build, `dist/` populated.

- [ ] **Step 4: Copy build output to jenkleiman.com repo**

```bash
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
```

- [ ] **Step 5: Commit and push jenkleiman.com**

```bash
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: PR 5 — polish (empty states + focus rings + cursor audit)"
git push
```

Netlify auto-deploys on push.

- [ ] **Step 6: Update memory + announce completion**

Add a new auto-memory entry: `etd-ui-rehaul-pr5-shipped.md` summarizing what shipped (canvas empty-state overlay, Properties icon, ~16 focus rings, full audit pass). Update `MEMORY.md` index with a one-line pointer. Update the prior `etd-ui-rehaul-pr4-shipped.md` entry's "1 PR remains" line to "UI rehaul complete — 5/5 PRs shipped".

Announce in chat: "PR 5 shipped + deployed. UI rehaul complete (5/5 PRs)."

---

## Done criteria for PR 5

1. Canvas empty-state hint renders when `elements.length === 0`, disappears when an element is added, and never blocks drag/drop.
2. Properties empty state shows the `MousePointer2` icon above the existing italic hint.
3. Transcript empty state verified against spec §6.3 (no edit expected; logged if any divergence).
4. Full-screen toolbar + entry-hint pill verified against spec §10 (no edit expected; logged if any divergence).
5. Every chrome `<input>` / `<select>` / `<textarea>` that was using `focus:outline-none` now uses the Sage `focus-visible` outline ring (Properties: ~14, Transcript: 1, Toolbar title: 1). Grep returns zero `focus:outline-none` / naked `outline-none` matches outside `Canvas/InlineEditor.tsx`.
6. Disabled chrome buttons have `cursor-not-allowed` (verified by grep + browser).
7. Mode cursors (`cursor-crosshair`, `cursor-grab`) verified active in connect / pan modes.
8. `npm run lint`, `npm run typecheck`, `npm run build` all clean.
9. `test_diagram.json` renders identically to pre-PR 5 (canvas safeguard).
10. Production build copied to `~/Documents/GitHub/jenkleiman.com/public/tools/etd/`, committed, pushed. Netlify deploy live.
11. Memory updated with `etd-ui-rehaul-pr5-shipped.md` + MEMORY.md index entry.

---

## Self-review notes

Spec coverage check against §11 PR 5 list:
- "Canvas empty-state HTML overlay per §8" → Task 1.
- "Properties + Transcript empty-state final polish" → Task 2 (Properties) + Task 3 (Transcript verify).
- "Full-screen toolbar Sage Garden restyle per §10" → Task 4 (verify; PR 1 already did the heavy lifting).
- "Hover / focus / active / disabled state audit across all chrome" → Task 5 (Properties focus rings) + Task 6 (Transcript + Toolbar focus rings) + Task 7 (broader audit).
- "Cursor styles per §6.4 confirmed for each mode" → Task 8.

Placeholder scan: none. Every step contains the exact code or command. The `<filename>` placeholder in Step 5 of Task 7's commit message is intentional — that step is conditional on findings.

Type/name consistency: `ArrowLeft`, `MousePointer2`, `FileText` all imported from `lucide-react`. `theme.focus.ring`, `theme.z.canvasOverlay`, `theme.sidebar.muted`, `theme.shadow.md` — all confirmed present in `src/utils/theme.ts` (read 2026-05-12). `elements` destructured from `useDiagramStore()` already present in `Canvas.tsx:103`.

Sealed-zone respect: Task 1 adds a sibling `<div>` to `<Stage>`, never inside. Task 2 touches Properties empty-state container (PR 5 territory per spec §11). All other tasks touch existing chrome files (Properties, Transcript, Toolbar, App) for focus-ring patches only — no Canvas-internal edits.
