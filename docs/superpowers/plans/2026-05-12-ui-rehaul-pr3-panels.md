# UI rehaul · PR 3 — Panels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the three side panels (Palette, Properties, Transcript) per Sage Garden §6 of the design spec — quieter chrome, plain element pills, contributor chips as small circular dots in real contributor colors, a horizontal Properties row with empty state and explicit Duplicate / Delete buttons, a transcript header with a mono filename, a search input, a selected-element line link highlight, an open-but-empty state with an inline Load button, and a closed 28px vertical strip with a rotated "Transcript ▸" label. All behavior preserved verbatim: drag-drop, contributor selection, transcript line-to-element linking, marquee selection.

**Architecture:** Modify-in-place restyle of three existing panel files. No structural splits this PR — the panels are small and cohesive (Palette 444 LOC, PropertiesPanel 478 LOC, TranscriptPanel + Item 430 LOC combined). Only the closed-transcript-strip JSX migrates out of `App.tsx` into a new `TranscriptPanel/TranscriptClosedStrip.tsx` so the open and closed states sit in the same feature folder. All visual changes read from `theme.ts` tokens; contributor circular-dot colors continue to come from `colors.ts` via `getContributorColor()` (per the §6.1 rule — real contributor colors, not invented chrome accents).

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS (layout / typography / cursor only — color utilities forbidden per PR 1 rule), lucide-react icons (already a dependency — `Trash2`, `Copy`, `FileText`, `Search`, `Upload`, `PanelRightOpen`). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-12-ui-rehaul-design.md` (v4) §6 + §11 "PR 3 — Panels". This plan implements PR 3 only.

> **Spec wording to resolve:** spec line 415 says "Implement marquee selection styling per §6.4," but §6.4 explicitly marks the Konva-rendered marquee rectangle as **sealed**. The right reading: §6.4 enumerates the dynamic chrome and confirms which pieces are sealed (marquee, connection-in-progress line, selection highlight, resize handles) versus which are CSS-only and stay as-is (mode cursors). For PR 3 this means **verifying** none of the changes touch `SelectionRect.tsx`, `colors.ts`, or Konva-stage rendering, and confirming the cursor classes (`cursor-crosshair`, `cursor-grab`, `cursor-not-allowed`) remain present. Task 10 codifies that verification — there is nothing visual to "implement."

**Sealed (do not touch in this PR):**
- `src/components/Canvas/**` — including `SelectionRect.tsx` (marquee), `Canvas.tsx` Konva stage rendering, and every element shape under `Canvas/shapes/**`.
- `src/utils/colors.ts` — element / contributor / support semantic colors.
- `src/utils/theme.ts` — every Sage Garden token already exists from PR 1; no new tokens needed.
- Every existing store action (`addElement`, `removeElement`, `duplicateElements`, `updateElement`, `setTranscript`, `updateTranscriptLine`, `setSelectedIds`, `resetConnectionRouting`, etc.). Signatures and side effects do not change.
- `src/components/Toolbar/**` — finished in PR 2.
- All modals (`Settings/**`, `Toolbar/AboutModal.tsx`, `Toolbar/ImageImportModal.tsx`, `ImageEditor/**`, `RecoveryPrompt.tsx`) — owned by PR 4.

---

## File map

**Create (1 new file):**
- `src/components/TranscriptPanel/TranscriptClosedStrip.tsx` — 28px vertical strip with rotated "Transcript ▸" label. Replaces the inline `<button>` currently rendered from `App.tsx:469–483`. Same `onClick` semantics — clicking expands the panel. Reads `theme.sidebar.bgGradient`, `theme.sidebar.border`, `theme.sidebar.textSecondary`.

**Modify (5 files):**
- `src/components/Palette/Palette.tsx` — Restyle: two top-level group headers ("Argument" / "Support") in `text-secondary` uppercase, plain element pills (white fill, 1px `border`, no invented border colors, no scale animations), contributor chips as small circular dots carrying the real contributor colors, dashed `border` separator between the type pills and the contributor section, Connect-mode toggle kept but restyled to match the sage button tokens. Annotations section folds back into Argument or stays as a third group — see Task 4. **No behavioral changes.**
- `src/components/Properties/PropertiesPanel.tsx` — Restyle: single horizontal row of field-pairs with `text-secondary` uppercase labels, dashed-border italic empty state at the same height as the filled state, right-aligned `Copy` (Duplicate) + `Trash2` "Delete" action buttons (Delete uses `theme.button.danger` filled, icon + text — never icon alone). Connection-routing variant of the empty row also gets the new visual treatment.
- `src/components/TranscriptPanel/TranscriptPanel.tsx` — Restyle: header carries the title left + filename right (mono, truncated, full-text `title=` for hover), always-visible `Search` input below the header, line filtering by query (case-insensitive, matches `speaker` + `text`), open-but-empty state with `FileText` icon + the §6.3 hint copy + an inline `Upload` button. **No behavioral change to drag-drop or persistence.**
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — Restyle: added "linked to currently-selected element" highlight using `theme.sidebar.surfaceActive` background when any element in `selectedIds` has `sourceTranscript.transcriptId === transcriptId && sourceTranscript.lineIndex === line.index`. Reuses the existing `used` prop machinery — the new highlight is a sibling boolean, not a replacement.
- `src/App.tsx` — Replace the inline closed-strip `<button>` (lines 469–483) with `<TranscriptClosedStrip onClick={() => setTranscriptPanelOpen(true)} />`. **Only that block changes.** All other props, layout, and effects stay.

**Untouched but verified intact at audit (Task 11):**
- `src/components/Canvas/**`, `src/utils/colors.ts`, `src/utils/theme.ts`.
- `src/store/diagramStore.ts` — `selectedIds` already exists; we read it, we never write to it from this PR.
- `src/components/Properties/ImageUpload.tsx` — used by PropertiesPanel for argument-element images; unchanged. The image-upload column stays in the row.

**Forbidden patterns (audit grep gate at Task 11):**
- Raw `z-index` numbers — use `theme.z.*`.
- Hardcoded colors (`#xxx`, `rgba(...)`) anywhere in the five modified chrome files — use `theme.*` tokens or the `getContributorColor()` / `getSupportColors()` helpers from `colors.ts`. (Calls into `colors.ts` are explicitly allowed — that's where contributor / support semantic colors live.)
- Tailwind color utilities (`bg-*`, `text-*-N00`, `border-*-N00`, `ring-*`, `focus:ring-*`) — use inline `style={{...}}`.
- `alert()` / `confirm()` — keep the one existing `confirm()` call in `TranscriptPanel.tsx:43` for now (PR 4 replaces it). Do **not** add any new `alert()` or `confirm()` site.

---

## Task 1: Create a feature branch

**Files:** (none modified yet)

Match the PR 1 + PR 2 workflow.

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `On branch main`, working tree clean (or only the four untracked `IMG_3*.HEIC` / `IMG_3*.json` files left over from prior debugging — those stay untracked).

- [ ] **Step 2: Create + switch to the PR 3 branch**

```bash
git checkout -b feat/ui-rehaul-pr3-panels
```

Expected: `Switched to a new branch 'feat/ui-rehaul-pr3-panels'`.

- [ ] **Step 3: Confirm the branch**

```bash
git branch --show-current
```

Expected: `feat/ui-rehaul-pr3-panels`.

---

## Task 2: Palette — replace invented type-pill borders with plain pills

**Files:**
- Modify: `src/components/Palette/Palette.tsx:240–264` (the Argument grid block)

The current Argument grid colors each pill's border from the **currently-selected contributor**, with a dashed border when `student`. Per spec §6.1: "Element-type buttons are plain pills with the type label, white fill, `border` outline. **No invented type-color dots** — type buttons are unstyled labels." The pill should look the same regardless of which contributor is selected; the contributor only changes the color of the element when it lands on the canvas.

- [ ] **Step 1: Replace the Argument grid block**

Open `src/components/Palette/Palette.tsx`. Find the block starting `{expandedSections.arguments && (` at roughly line 239 and replace through its closing `)}` (around line 263) with:

```tsx
{expandedSections.arguments && (
  <div className="grid grid-cols-2 gap-2 px-1">
    {ARGUMENT_TYPES.map(({ type, label }) => {
      // Implicit contributor can only create warrants.
      const isDisabled = selectedContributor === 'implicit' && type !== 'warrant';
      return (
        <button
          key={type}
          onClick={() => !isDisabled && handleAddArgument(type)}
          disabled={isDisabled}
          className="px-3 py-2 text-left text-sm rounded-md transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: theme.sidebar.surface,
            color: theme.sidebar.text,
            borderWidth: '1px',
            borderColor: theme.sidebar.border,
            borderStyle: 'solid',
          }}
          onMouseEnter={(e) => {
            if (isDisabled) return;
            e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
            e.currentTarget.style.borderColor = theme.sidebar.accent;
          }}
          onMouseLeave={(e) => {
            if (isDisabled) return;
            e.currentTarget.style.backgroundColor = theme.sidebar.surface;
            e.currentTarget.style.borderColor = theme.sidebar.border;
          }}
        >
          {label}
        </button>
      );
    })}
  </div>
)}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no new errors. (If pre-existing errors are present, they should be unchanged.)

- [ ] **Step 3: Lint**

Run: `npm run lint -- --max-warnings 200 src/components/Palette/Palette.tsx`
Expected: no new errors in the modified file.

- [ ] **Step 4: Commit**

```bash
git add src/components/Palette/Palette.tsx
git commit -m "chore(pr3): palette — plain argument pills (no contributor-tinted borders)"
```

---

## Task 3: Palette — contributor chips become small circular dots in real colors

**Files:**
- Modify: `src/components/Palette/Palette.tsx:273–328` (the contributor selector block)

Per spec §6.1: "Contributor chips carry the actual contributor colors (`#228B22` green / `#0000CD` blue / `#CC0000` red / `#800080` purple / `#000000` black) as small circular dots." The colors already live in `COLORS` (imported as `getContributorColor` indirectly via `CONTRIBUTOR_TYPES`). The current implementation draws 20×20 squares with thick double-borders and animated scale — we replace those with quiet 10×10 circles.

- [ ] **Step 1: Replace the contributor selector block**

Find `{expandedSections.contributor && (` at roughly line 273 and replace through its closing `)}` (around line 327) with:

```tsx
{expandedSections.contributor && (
  <div className="space-y-0.5 px-1">
    {CONTRIBUTOR_TYPES.map(({ type, label, color }) => {
      const isSelected = selectedContributor === type;
      return (
        <label
          key={type}
          className="flex items-center gap-2.5 cursor-pointer px-2.5 py-1.5 rounded-md transition-colors duration-100"
          style={{
            backgroundColor: isSelected ? theme.sidebar.surfaceActive : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <input
            type="radio"
            name="contributor"
            value={type}
            checked={isSelected}
            onChange={() => setSelectedContributor(type)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: color,
              borderWidth: type === 'student' ? '1px' : '0',
              borderStyle: 'dashed',
              borderColor: color,
              boxShadow: isSelected ? `0 0 0 2px ${theme.sidebar.bg}, 0 0 0 3px ${color}` : 'none',
            }}
          />
          <span
            className="text-sm"
            style={{
              color: isSelected ? theme.sidebar.text : theme.sidebar.textSecondary,
              fontWeight: isSelected ? 500 : 400,
            }}
          >
            {label}
          </span>
        </label>
      );
    })}
  </div>
)}
```

Note: `student` keeps a 1px dashed outline on the dot — preserves the semantic cue that student contributions render with a dashed element border on the canvas. `joint` and `implicit` remain solid dots; the canvas renders their special borders via colors.ts (out of scope here).

- [ ] **Step 2: Visual sanity check — dev server**

Start (or confirm running) the dev server:

```bash
npm run dev
```

Open `http://localhost:5173/`. Click each contributor — the selected one shows a sage ring around its dot and the row gets a faint sage background. Hover an unselected row — it gets a lighter sage hover.

Expected: dots are obviously real contributor colors (green / blue / red / purple / black); student's dot has a dashed outline; selection is visible without animation.

- [ ] **Step 3: Commit**

```bash
git add src/components/Palette/Palette.tsx
git commit -m "chore(pr3): palette — contributor chips as small circular dots in real colors"
```

---

## Task 4: Palette — Support section, Connect-mode, and Annotations cleanup

**Files:**
- Modify: `src/components/Palette/Palette.tsx:192–230` (Connect mode), `:331–404` (Support block), `:407–440` (Annotations block)

The Connect-mode toggle uses a Tailwind shadow utility (`shadow-lg`) — forbidden by PR 1 rule. The Support section's `border-t` divider is fine but the "Teacher / Student" contributor toggle uses semantic color tinting (`color + '20'`) and the three support buttons (`action`, `question`, `other`) use the semantic support colors as borders — those remain (they are contributor / element semantic colors from `colors.ts`, explicitly allowed). The Annotations section's hover state and the surrounding `space-y-2 border-t pt-4` are kept but the button's micro-animations (`hover:scale-[1.02]`, `active:scale-[0.98]`) come out.

- [ ] **Step 1: Restyle the Connect-mode toggle**

Replace the `<button onClick={onToggleConnectMode} …>` block (roughly lines 192–230) with:

```tsx
<button
  onClick={onToggleConnectMode}
  className="w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-150 flex items-center justify-center gap-2"
  style={connectMode ? {
    backgroundColor: theme.button.primary.bg,
    color: theme.button.primary.text,
    boxShadow: theme.shadow.sm,
  } : {
    backgroundColor: theme.sidebar.surface,
    color: theme.sidebar.text,
    borderWidth: '1px',
    borderColor: theme.sidebar.border,
    borderStyle: 'solid',
  }}
  onMouseEnter={(e) => {
    if (connectMode) {
      e.currentTarget.style.backgroundColor = theme.button.primary.bgHover;
    } else {
      e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
    }
  }}
  onMouseLeave={(e) => {
    if (connectMode) {
      e.currentTarget.style.backgroundColor = theme.button.primary.bg;
    } else {
      e.currentTarget.style.backgroundColor = theme.sidebar.surface;
    }
  }}
>
  <Link2 size={16} />
  {connectMode ? 'Connecting…' : 'Connect Mode'}
  <kbd
    className="ml-auto px-1.5 py-0.5 text-[10px] rounded font-mono"
    style={{
      // Translucent dark-sage overlay on the primary-button background.
      // This is the single allowed rgba literal in PR 3 (matches the pre-PR-3
      // value verbatim so the audit reads cleanly). If we ever add a token
      // for "translucent overlay on primary button," migrate it then.
      backgroundColor: connectMode ? 'rgba(61, 74, 50, 0.35)' : theme.sidebar.bg,
      color: connectMode ? theme.button.primary.text : theme.sidebar.muted,
    }}
  >
    C
  </kbd>
</button>
```

- [ ] **Step 2: Restyle the Support contributor toggle row**

Inside the Support block, find the `<div className="flex gap-2 mb-2">` containing the `SUPPORT_CONTRIBUTORS.map(...)` (around lines 343–359) and replace with:

```tsx
<div className="flex gap-2 mb-2">
  {SUPPORT_CONTRIBUTORS.map(({ type, label, color }) => {
    const isSelected = selectedSupportContributor === type;
    return (
      <button
        key={type}
        onClick={() => setSelectedSupportContributor(type)}
        className="flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 flex items-center justify-center gap-1.5"
        style={{
          backgroundColor: isSelected ? theme.sidebar.surfaceActive : theme.sidebar.surface,
          color: isSelected ? theme.sidebar.text : theme.sidebar.textSecondary,
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: isSelected ? theme.sidebar.accent : theme.sidebar.border,
        }}
      >
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        {label}
      </button>
    );
  })}
</div>
```

The 8px colored dot mirrors the Argument contributor dots (smaller because the Support row is tighter).

- [ ] **Step 3: Remove micro-animations from the three Support type buttons**

Find the three buttons (`handleAddSupport('action')`, `handleAddSupport('question')`, `handleAddSupport('other')`) and remove the `hover:scale-[1.02] active:scale-[0.98]` Tailwind utilities from each `className`. Replace `border-2` with `border` (1px is enough). The semantic support colors (`COLORS.action* / COLORS.question* / COLORS.otherSupport*`) stay — they're the element's actual color. The result should look like (excerpted for the `action` button):

```tsx
<button
  onClick={() => handleAddSupport('action')}
  className="w-full px-4 py-2 text-left text-sm border rounded-full transition-colors duration-150 font-medium"
  style={{
    borderColor: getSupportColors('action', selectedSupportContributor).border,
    color: getSupportColors('action', selectedSupportContributor).border,
    backgroundColor: 'transparent',
  }}
>
  {styleConfig.supportTypes.action.label}
</button>
```

Apply the same `border` (not `border-2`), `transition-colors`, removed-animation pattern to the `question` and `other` buttons. Keep their existing `rounded-lg`, `borderColor`, `backgroundColor`, and `color` styles.

- [ ] **Step 4: Restyle the Annotations Info Box button**

Inside the Annotations block, the Info Box `<button>` (around lines 419–437) loses its animations and uses 1px border:

```tsx
<button
  onClick={handleAddInfoBox}
  className="w-full px-4 py-2 text-left text-sm border rounded-md transition-colors duration-150 font-medium"
  style={{
    borderColor: theme.sidebar.border,
    color: theme.sidebar.text,
    backgroundColor: 'transparent',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor = theme.sidebar.accent;
    e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = theme.sidebar.border;
    e.currentTarget.style.backgroundColor = 'transparent';
  }}
>
  Info Box
</button>
```

- [ ] **Step 5: Tighten the outer container padding**

The outermost `<div className="w-64 border-r flex flex-col overflow-y-auto" …>` stays 256px wide (spec target is 200px default, but ETD currently has fixed 256px; do not change the width in this PR — that's layout-glue territory and Jennifer should see the visual change before the resize). The inner `<div className="p-4 flex flex-col gap-4">` is fine as-is.

- [ ] **Step 6: Typecheck + lint**

```bash
npm run typecheck
npm run lint -- src/components/Palette/Palette.tsx
```

Expected: no new errors / warnings introduced.

- [ ] **Step 7: Browser smoke check**

Refresh `http://localhost:5173/`. Confirm:
- Connect Mode pill has no `shadow-lg` ring, hovers to a slightly darker sage, kbd chip readable.
- Support row's Teacher/Student tabs show a small dot + label; selected one has the accent border.
- The three support type buttons have a 1px (not 2px) colored border and no jump on hover.
- Info Box button has a quiet `border` border.

- [ ] **Step 8: Commit**

```bash
git add src/components/Palette/Palette.tsx
git commit -m "chore(pr3): palette — connect-mode + support + annotations restyle (no scale animations, 1px borders)"
```

---

## Task 5: Properties — empty state + connection-routing state restyle

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx:125–172` (the connection-only and empty-state branches)

The current empty state is a single line of text centered in a 64-px row. Per spec §6.2: "Empty state: dashed-border placeholder, italic hint in `text-secondary` ('No element selected · click an element on the canvas to edit it'). Same height as the filled state so the canvas doesn't jump."

We can't make the empty state the same height as the filled state without knowing the filled height — but the current code uses `h-16` for empty and a `useMemo` for filled (`min-h-32` / `min-h-40` / `min-h-28`). We bump the empty state to `min-h-28` so it matches the lowest filled state (support / info-box), giving a stable bottom row in the common case. (The canvas will only jump when switching between argument-with-image and empty — that's fine for this PR; an exact-match-height empty state can come back in PR 5 Polish if Jennifer flags it.)

- [ ] **Step 1: Replace the empty-state branch**

Find:

```tsx
if (!selectedElement) {
  return (
    <div
      className="h-16 border-t px-5 flex items-center justify-center text-sm panel-transition"
      ...
    >
      Select an element to edit its properties
    </div>
  );
}
```

Replace with:

```tsx
if (!selectedElement) {
  return (
    <div
      className="min-h-28 border-t panel-transition"
      style={{
        background: theme.properties.bgGradient,
        borderColor: theme.properties.border,
        boxShadow: theme.properties.shadow,
      }}
    >
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
    </div>
  );
}
```

- [ ] **Step 2: Restyle the connection-only branch**

Find the `if (selectedConnection)` block and replace with:

```tsx
if (selectedConnection) {
  const hasManualRouting =
    (selectedConnection.waypoints && selectedConnection.waypoints.length > 0) ||
    selectedConnection.fromAnchor !== undefined ||
    selectedConnection.toAnchor !== undefined;
  return (
    <div
      className="min-h-28 border-t px-5 py-4 panel-transition"
      style={{
        background: theme.properties.bgGradient,
        borderColor: theme.properties.border,
        boxShadow: theme.properties.shadow,
      }}
    >
      <div className="flex items-center gap-4 h-full">
        <span className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
          Connection — {hasManualRouting ? 'manual routing applied' : 'auto-routed'}
        </span>
        <button
          onClick={() => resetConnectionRouting(selectedConnection.id)}
          disabled={!hasManualRouting}
          className="px-3 py-1.5 text-sm border rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          style={{
            borderColor: theme.input.border,
            color: theme.input.text,
            backgroundColor: theme.input.bg,
          }}
          onMouseEnter={(e) => {
            if (!hasManualRouting) return;
            e.currentTarget.style.backgroundColor = theme.input.bgHover;
          }}
          onMouseLeave={(e) => {
            if (!hasManualRouting) return;
            e.currentTarget.style.backgroundColor = theme.input.bg;
          }}
        >
          Reset routing
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Browser smoke check**

Open the app. With nothing selected, the bottom panel shows a dashed-bordered, italic, secondary-colored hint. Click an element — the panel grows into the filled state. Click a connection — the panel shows "Connection — auto-routed" with a disabled Reset routing button. Drag a waypoint to make it manual, then click the connection — the button enables.

- [ ] **Step 5: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "chore(pr3): properties — empty state (dashed border + italic) + connection-routing row restyle"
```

---

## Task 6: Properties — add right-aligned Duplicate + Delete action buttons

**Files:**
- Modify: `src/components/Properties/PropertiesPanel.tsx` — top of file (imports + store actions), bottom of `<div className="flex gap-6 items-start h-full">` row.

Per spec §6.2: "Duplicate / Delete buttons right-aligned. Delete uses `danger` styling with a `Trash2` icon **and** the explicit 'Delete' text label (color + icon + text — never color alone)." The store already exposes `duplicateElements(ids: string[])` and `removeElement(id: string)` (verified in `diagramStore.ts:84` and `:182`). The keyboard shortcuts in `App.tsx:290` / `:344` stay — the buttons are an additional affordance.

- [ ] **Step 1: Import the icons and pull the actions from the store**

At the top of `PropertiesPanel.tsx`, change the imports + destructure:

```tsx
import { useCallback, useMemo } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { useDiagramStore } from '../../store';
```

And update the `useDiagramStore` call inside the component:

```tsx
const {
  elements,
  selectedIds,
  updateElement,
  setElementImage,
  setElementImageSettings,
  changeSupportType,
  convertToArgument,
  convertToSupport,
  duplicateElements,
  removeElement,
} = useDiagramStore();
```

- [ ] **Step 2: Append the action-button cluster as the last child of the row**

Inside the filled-state return, the existing JSX ends with:

```tsx
        {/* Image Upload (for argument elements) */}
        {isArgumentElement(selectedElement) && (
          <div className="w-40 flex-shrink-0">
            <ImageUpload ... />
          </div>
        )}
      </div>
    </div>
  );
}
```

Add a new flex column **before** the closing `</div>` of the row (i.e., as the last child of `<div className="flex gap-6 items-start h-full">`):

```tsx
        {/* Actions */}
        <div className="flex flex-col gap-1.5 ml-auto flex-shrink-0 self-start">
          <span style={labelStyle}>Actions</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => duplicateElements([selectedElement.id])}
              className="px-3 py-2 text-sm border rounded-md inline-flex items-center gap-1.5 transition-colors duration-150"
              style={{
                backgroundColor: theme.button.secondary.bg,
                color: theme.button.secondary.text,
                borderColor: theme.button.secondary.border,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.secondary.bg;
              }}
              title="Duplicate (⌘D)"
            >
              <Copy size={14} aria-hidden="true" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => removeElement(selectedElement.id)}
              className="px-3 py-2 text-sm rounded-md inline-flex items-center gap-1.5 transition-colors duration-150"
              style={{
                backgroundColor: theme.button.danger.bg,
                color: theme.button.danger.text,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: theme.button.danger.bg,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.danger.bgHover;
                e.currentTarget.style.borderColor = theme.button.danger.bgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.danger.bg;
                e.currentTarget.style.borderColor = theme.button.danger.bg;
              }}
              title="Delete (Del / Backspace)"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
```

`ml-auto` pushes the cluster to the right edge of the row, after the optional Image Upload column. `self-start` keeps the buttons top-aligned even when the Content textarea grows.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Browser smoke check**

- Click an argument element → Properties row shows fields + ImageUpload column + the new Duplicate / Delete cluster pinned right.
- Click an info box → row shows fields + Duplicate / Delete (no image column).
- Click a support → row shows fields + Duplicate / Delete.
- Click Duplicate → an identical element appears slightly offset and becomes the new selection (existing behavior).
- Click Delete → element is removed, panel returns to empty state.
- Hover Delete → button darkens; the icon + "Delete" label are both visible.

- [ ] **Step 5: Commit**

```bash
git add src/components/Properties/PropertiesPanel.tsx
git commit -m "chore(pr3): properties — add right-aligned Duplicate + Delete action buttons (icon + text)"
```

---

## Task 7: Transcript panel — header with mono filename and consistent border

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx:89–151` (header block + filename row)

Per spec §6.3: "Header: 'Transcript' title on the left, filename in mono on the right, separated from the body by `border`." Today the header has a title left and a close button right; the filename lives in its own row below. We collapse the filename into the header row (right-aligned, truncated, hover-revealed full name via `title=`), and keep the close button accessible but below the title so the filename always has room.

- [ ] **Step 1: Restructure the header**

Replace the `<div className="px-5 py-4 border-b flex items-center justify-between" …>` block (lines 89–109) plus the `transcript &&` filename block (lines 136–151) with a single header layout:

```tsx
<div
  className="px-5 py-3 border-b"
  style={{ borderColor: theme.sidebar.border }}
>
  <div className="flex items-center justify-between gap-2 mb-1">
    <h2
      className="font-semibold text-sm uppercase tracking-wider"
      style={{ color: theme.sidebar.text }}
    >
      Transcript
    </h2>
    {transcript && (
      <button
        onClick={handleClose}
        className="p-1 rounded transition-colors duration-150"
        title="Hide panel"
        aria-label="Hide transcript panel"
        style={{ color: theme.sidebar.textSecondary }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.sidebar.hover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <PanelRightClose size={16} />
      </button>
    )}
  </div>
  {transcript && (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span
        className="font-mono truncate flex-1 min-w-0"
        style={{ color: theme.sidebar.textSecondary }}
        title={transcript.filename}
      >
        {transcript.filename}
      </span>
      <span
        className="flex-shrink-0"
        style={{ color: theme.sidebar.muted }}
      >
        {transcript.lines.length} line{transcript.lines.length === 1 ? '' : 's'}
        {transcript.parseWarnings.length > 0 && ` · ${transcript.parseWarnings.length} skipped`}
      </span>
    </div>
  )}
</div>
```

Then, inside the existing `transcript && (<>...</>)` fragment, **remove** the now-duplicate `<div className="px-5 py-2 text-xs" …>` filename block — the new header subsumes it. The fragment should drop straight into the lines list.

After deletion, the `transcript && ` block should look like:

```tsx
{transcript && (
  <>
    <div className="flex-1 overflow-y-auto">
      {transcript.lines.map((line, idx) => (
        <TranscriptPanelItem ...existing props />
      ))}
    </div>
  </>
)}
```

(The `<>...</>` fragment stays — Task 8 adds the search input as a sibling above the lines list.)

- [ ] **Step 2: Typecheck + browser smoke check**

```bash
npm run typecheck
```

Open `http://localhost:5173/`. Load a transcript (Toolbar → load transcript button, or the inline button when the panel is empty — Task 9 restyles that). Confirm:
- Header shows "Transcript" on the left, the panel-close icon button on the right.
- Below the title row: mono filename truncated on the left, "X lines" on the right.
- Hover the filename — the full name shows in the native title tooltip.

- [ ] **Step 3: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanel.tsx
git commit -m "chore(pr3): transcript panel — header with mono filename + line count, drop redundant filename row"
```

---

## Task 8: Transcript panel — always-visible search input + filter logic

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx` — add `useState` import + search input below header + filter the rendered lines.

Per spec §6.3: "Search input always visible below the header." The input is **only** rendered when a transcript is loaded — there's nothing to search when empty. The match is case-insensitive against `speaker` + `text`; timestamps remain unfiltered so users can find a moment by quote rather than time. The empty `usedLineIndexes` derivation does not change — only the rendering filters.

- [ ] **Step 1: Add the imports**

At the top of `TranscriptPanel.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { PanelRightClose, Search } from 'lucide-react';
```

- [ ] **Step 2: Add the search state**

Inside the component, just below the existing hooks (after `useMemo(...)`):

```tsx
const [searchQuery, setSearchQuery] = useState('');

const filteredLines = useMemo(() => {
  if (!transcript) return [];
  const q = searchQuery.trim().toLowerCase();
  if (!q) return transcript.lines;
  return transcript.lines.filter(
    (line) =>
      line.text.toLowerCase().includes(q) ||
      (line.speaker?.toLowerCase().includes(q) ?? false),
  );
}, [transcript, searchQuery]);
```

- [ ] **Step 3: Insert the search input as a sibling above the lines list**

Inside the `transcript && (<>...</>)` fragment, **before** `<div className="flex-1 overflow-y-auto">`, add:

```tsx
<div
  className="px-3 py-2 border-b"
  style={{ borderColor: theme.sidebar.border }}
>
  <div className="relative">
    <Search
      size={14}
      className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: theme.sidebar.muted }}
      aria-hidden="true"
    />
    <input
      type="search"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="Search transcript…"
      aria-label="Search transcript lines"
      className="w-full pl-8 pr-2.5 py-1.5 text-sm rounded-md border transition-colors duration-150 focus:outline-none"
      style={{
        backgroundColor: theme.input.bg,
        borderColor: theme.input.border,
        color: theme.input.text,
      }}
    />
  </div>
</div>
```

- [ ] **Step 4: Render `filteredLines` instead of `transcript.lines`**

Change:

```tsx
{transcript.lines.map((line, idx) => (
```

to:

```tsx
{filteredLines.map((line, idx) => (
```

Each item already receives `line.index` (the **original** index from the parser, not the position in `filteredLines`) — the `key={line.index}` and the `usedLineIndexes` set still work because they're keyed by parser-assigned index, not array position. `altRow` is derived from `idx` (zebra striping of the **filtered** view), which is the correct UX: filtering should renumber the alt rows.

- [ ] **Step 5: Add a "no matches" hint when filtered is empty but query is non-empty**

Right after `{filteredLines.map(...)}`, add:

```tsx
{filteredLines.length === 0 && searchQuery.trim() !== '' && (
  <div
    className="px-5 py-6 text-center text-sm italic"
    style={{ color: theme.sidebar.textSecondary }}
  >
    No lines match "{searchQuery.trim()}".
  </div>
)}
```

- [ ] **Step 6: Typecheck + browser smoke check**

```bash
npm run typecheck
```

In the app, load a transcript, then type in the search box. Confirm:
- Lines visibly filter as you type.
- Speakers and text both match (case-insensitive).
- Empty query restores the full list.
- A query with no matches shows the italic hint.
- Drag-drop still works from a filtered line into the canvas.

- [ ] **Step 7: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanel.tsx
git commit -m "chore(pr3): transcript panel — always-visible search input + filter logic"
```

---

## Task 9: Transcript panel — open-but-empty state with icon + inline Load button

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx:111–132` (the `{!transcript && (…)}` block)

Per spec §6.3: "Open-but-empty state: centered icon + 'No transcript loaded · load a .txt file to link argument elements to spoken lines' + inline 'Load transcript' button (mirrors the toolbar action)."

- [ ] **Step 1: Add the `FileText` and `Upload` icons to the import**

```tsx
import { PanelRightClose, Search, FileText, Upload } from 'lucide-react';
```

- [ ] **Step 2: Replace the empty-state block**

Replace `{!transcript && (...)}` with:

```tsx
{!transcript && (
  <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
    <FileText
      size={28}
      aria-hidden="true"
      style={{ color: theme.sidebar.muted }}
    />
    <p
      className="text-sm leading-relaxed"
      style={{ color: theme.sidebar.textSecondary }}
    >
      No transcript loaded · load a .txt file to link argument elements to spoken lines.
    </p>
    <button
      onClick={handleLoadClick}
      className="px-3 py-2 text-sm font-medium rounded-md border transition-colors duration-150 inline-flex items-center gap-2"
      style={{
        backgroundColor: theme.button.secondary.bg,
        color: theme.button.secondary.text,
        borderColor: theme.button.secondary.border,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = theme.button.secondary.bg;
      }}
    >
      <Upload size={14} aria-hidden="true" />
      Load transcript
    </button>
  </div>
)}
```

- [ ] **Step 3: Browser smoke check**

Refresh the app with no transcript loaded — the panel shows the icon + hint + inline button. Click the button → native file picker opens. Cancel → back to the empty state.

- [ ] **Step 4: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanel.tsx
git commit -m "chore(pr3): transcript panel — open-but-empty state (icon + hint + inline Load button)"
```

---

## Task 10: Transcript panel — selected-element line link highlight

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx` — derive `linkedLineIndexes` and pass to each item.
- Modify: `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — accept new `linkedToSelection` prop and use `surfaceActive` background when set.

Per spec §6.3: "Linked-to-selected-element line uses `active` background." Today `usedLineIndexes` tracks lines referenced by **any** element. We add `linkedLineIndexes` — lines referenced by the **currently-selected** elements only — and use it for the active background. The existing `used` badge stays.

- [ ] **Step 1: Derive `linkedLineIndexes` in `TranscriptPanel.tsx`**

Just below the existing `usedLineIndexes` `useMemo`, add:

```tsx
const selectedIds = useDiagramStore((s) => s.selectedIds);

const linkedLineIndexes = useMemo(() => {
  if (!transcript) return new Set<number>();
  const selected = new Set(selectedIds);
  const set = new Set<number>();
  for (const el of elements) {
    if (!selected.has(el.id)) continue;
    if (el.sourceTranscript?.transcriptId === transcript.id) {
      set.add(el.sourceTranscript.lineIndex);
    }
  }
  return set;
}, [elements, selectedIds, transcript]);
```

- [ ] **Step 2: Pass the new prop to `TranscriptPanelItem`**

In the `filteredLines.map` block, update the props:

```tsx
<TranscriptPanelItem
  key={line.index}
  line={line}
  transcriptId={transcript.id}
  used={usedLineIndexes.has(line.index)}
  linkedToSelection={linkedLineIndexes.has(line.index)}
  dismissed={line.dismissed === true}
  altRow={idx % 2 === 1}
  onContributorChange={(value) =>
    updateTranscriptLine(line.index, { contributor: value })
  }
  onObjectTypeChange={(objectType, subtype) =>
    updateTranscriptLine(line.index, { objectType, subtype })
  }
  onDismissChange={(value) =>
    updateTranscriptLine(line.index, { dismissed: value })
  }
/>
```

- [ ] **Step 3: Update the `TranscriptPanelItemProps` interface**

In `TranscriptPanelItem.tsx`, add the new prop:

```tsx
export interface TranscriptPanelItemProps {
  line: TranscriptLine;
  transcriptId: string;
  used: boolean;
  linkedToSelection: boolean;
  dismissed: boolean;
  altRow: boolean;
  onContributorChange: (value: ContributorType | null) => void;
  onObjectTypeChange: (objectType: TranscriptObjectType | null, subtype?: SupportSubtype) => void;
  onDismissChange: (dismissed: boolean) => void;
}
```

And destructure it in the function signature:

```tsx
export function TranscriptPanelItem({
  line,
  transcriptId,
  used,
  linkedToSelection,
  dismissed,
  altRow,
  onContributorChange,
  onObjectTypeChange,
  onDismissChange,
}: TranscriptPanelItemProps) {
```

- [ ] **Step 4: Use `surfaceActive` when linked to selection**

Find the `cardBg` derivation (around line 131):

```tsx
const baseBg = altRow ? theme.sidebar.hover : theme.sidebar.surface;
const cardBg = isHovered && canDrag ? theme.sidebar.surfaceHover : baseBg;
```

Replace with:

```tsx
const baseBg = altRow ? theme.sidebar.hover : theme.sidebar.surface;
const hoverBg = isHovered && canDrag ? theme.sidebar.surfaceHover : baseBg;
const cardBg = linkedToSelection ? theme.sidebar.surfaceActive : hoverBg;
```

Selection takes precedence over hover/zebra — a linked line is always visibly the linked one.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Browser smoke check**

In the app:
1. Load a transcript that has at least one line and create an element from that line (drag the line onto the canvas).
2. Click the element on the canvas.
3. Confirm the corresponding transcript line shows the sage `surfaceActive` background.
4. Click away (or select another element with no transcript link) → the highlight clears.
5. Select multiple elements → all their linked lines highlight.

- [ ] **Step 7: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptPanel.tsx src/components/TranscriptPanel/TranscriptPanelItem.tsx
git commit -m "chore(pr3): transcript panel — highlight lines linked to currently-selected element(s)"
```

---

## Task 11: Closed transcript strip — extract component + rotated label

**Files:**
- Create: `src/components/TranscriptPanel/TranscriptClosedStrip.tsx`
- Modify: `src/components/TranscriptPanel/index.ts` (export the new component)
- Modify: `src/App.tsx:465–484` (replace the inline `<button>` with the new component)

Per spec §6.3: "28px vertical strip with rotated 'Transcript ▸' label, `sidebar-bg`. Clickable to expand."

- [ ] **Step 1: Create the closed strip component**

Create `src/components/TranscriptPanel/TranscriptClosedStrip.tsx`:

```tsx
import { theme } from '../../utils/theme';

interface TranscriptClosedStripProps {
  onOpen: () => void;
}

export function TranscriptClosedStrip({ onOpen }: TranscriptClosedStripProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Show transcript panel"
      aria-label="Show transcript panel"
      className="w-7 border-l flex items-center justify-center transition-colors duration-150"
      style={{
        background: theme.sidebar.bgGradient,
        borderColor: theme.sidebar.border,
        color: theme.sidebar.textSecondary,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '';
      }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap"
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
        }}
      >
        Transcript ▸
      </span>
    </button>
  );
}
```

`writingMode: vertical-rl` + `rotate(180deg)` produces a bottom-to-top reading direction, which is the convention for vertical side labels. The 28px target width is encoded as Tailwind `w-7` (28px). `onMouseLeave` resets to `''` so the inline-style override clears and the gradient `background` style takes over again.

- [ ] **Step 2: Re-export from the panel barrel**

The current file (verified `cat src/components/TranscriptPanel/index.ts`) is one line:

```ts
export { TranscriptPanel } from './TranscriptPanel';
```

Append a sibling line:

```ts
export { TranscriptPanel } from './TranscriptPanel';
export { TranscriptClosedStrip } from './TranscriptClosedStrip';
```

- [ ] **Step 3: Wire into `App.tsx`**

In `src/App.tsx`, update the import (current line 12 is `import { TranscriptPanel } from './components/TranscriptPanel';`):

```tsx
import { TranscriptPanel, TranscriptClosedStrip } from './components/TranscriptPanel';
```

Then find the closed-strip block (currently lines 469–483):

```tsx
<button
  type="button"
  onClick={() => setTranscriptPanelOpen(true)}
  title="Show transcript panel"
  aria-label="Show transcript panel"
  className="w-8 border-l flex items-start justify-center pt-4 hover:opacity-80"
  style={{
    background: theme.sidebar.bgGradient,
    borderColor: theme.sidebar.border,
    color: theme.sidebar.textSecondary,
  }}
>
  <PanelRightOpen size={16} />
</button>
```

Replace with:

```tsx
<TranscriptClosedStrip onOpen={() => setTranscriptPanelOpen(true)} />
```

If `PanelRightOpen` is no longer used elsewhere in `App.tsx`, remove it from the `lucide-react` import.

```bash
grep -n "PanelRightOpen" src/App.tsx
```

If the only remaining match is the (now-stale) `import` line, drop `PanelRightOpen` from that import.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. (`theme` stays used elsewhere in `App.tsx` — e.g., `theme.sidebar.bg` at line 398, `theme.z.fsToolbar` at line 424 — so its import stays.)

- [ ] **Step 5: Browser smoke check**

Refresh the app. Close the transcript panel (click the close icon in the header, or start with no transcript loaded and click the panel-close icon after loading). The right edge shows a 28px sage strip with a vertical "Transcript ▸" label reading bottom-to-top. Hover → slight background lift. Click → the panel expands. Re-close → strip returns.

- [ ] **Step 6: Commit**

```bash
git add src/components/TranscriptPanel/TranscriptClosedStrip.tsx src/components/TranscriptPanel/index.ts src/App.tsx
git commit -m "chore(pr3): transcript panel — extract closed-strip with rotated 'Transcript ▸' label"
```

---

## Task 12: Marquee + cursor sealed verification, audit grep, lint, typecheck

**Files:** (none modified — read-only verification)

This is the audit gate. Three things must hold:
1. **Marquee is sealed** — no diff in `src/components/Canvas/SelectionRect.tsx`, `src/utils/colors.ts`, or any Konva-rendered file.
2. **Cursor classes still present** — `cursor-crosshair`, `cursor-grab`, `cursor-not-allowed` survive PR 3 unchanged.
3. **No forbidden patterns introduced** — no raw hex colors, no Tailwind color utilities, no raw `z-index` numbers, no new `alert()` / `confirm()`.

- [ ] **Step 1: Confirm `Canvas/**` is untouched on this branch**

```bash
git diff main...HEAD --stat -- src/components/Canvas src/utils/colors.ts
```

Expected: empty output. If anything appears, that's a bug — revert it before continuing.

- [ ] **Step 2: Confirm `colors.ts` and `theme.ts` are untouched**

```bash
git diff main...HEAD --stat -- src/utils/colors.ts src/utils/theme.ts
```

Expected: empty output.

- [ ] **Step 3: Confirm cursor utility classes still exist where they were**

```bash
grep -n "cursor-crosshair\|cursor-grab\|cursor-not-allowed" src/components/Canvas/Canvas.tsx src/components/Toolbar/IconButton.tsx src/components/Properties/PropertiesPanel.tsx src/components/Palette/Palette.tsx
```

Expected: matches in `Canvas.tsx` (`cursor-crosshair` + `cursor-grab`) and `IconButton.tsx` (`cursor-not-allowed`). `PropertiesPanel.tsx` keeps `cursor-not-allowed` on the disabled Reset routing button. If any disappear from a chrome file we modified, restore them.

- [ ] **Step 4: Forbidden-pattern grep — hardcoded hex / rgba in the modified chrome files**

```bash
grep -nE "#[0-9a-fA-F]{3,8}|rgba\(" src/components/Palette/Palette.tsx src/components/Properties/PropertiesPanel.tsx src/components/TranscriptPanel/TranscriptPanel.tsx src/components/TranscriptPanel/TranscriptPanelItem.tsx src/components/TranscriptPanel/TranscriptClosedStrip.tsx src/App.tsx
```

Expected: zero hits **other than** the `rgba(61, 74, 50, 0.35)` for the Connect-mode kbd chip in `Palette.tsx` (a translucent dark-sage overlay carried over verbatim from pre-PR-3). If that's the only hit, the audit passes. Anything else is a forbidden literal — replace with a `theme.*` token.

- [ ] **Step 5: Forbidden-pattern grep — Tailwind color utilities**

```bash
grep -nE "\b(bg|text|border|ring|from|to|via)-(red|blue|green|yellow|orange|purple|pink|cyan|teal|amber|lime|emerald|indigo|violet|fuchsia|rose|sky|stone|zinc|slate|neutral|gray)-[0-9]+\b|focus:ring-" src/components/Palette/Palette.tsx src/components/Properties/PropertiesPanel.tsx src/components/TranscriptPanel/TranscriptPanel.tsx src/components/TranscriptPanel/TranscriptPanelItem.tsx src/components/TranscriptPanel/TranscriptClosedStrip.tsx
```

Expected: zero hits.

- [ ] **Step 6: Forbidden-pattern grep — z-index utilities + raw `z-index`**

```bash
grep -nE "\bz-(0|10|20|30|40|50|auto)\b|z-index:" src/components/Palette/Palette.tsx src/components/Properties/PropertiesPanel.tsx src/components/TranscriptPanel/*.tsx
```

Expected: zero hits.

- [ ] **Step 7: No new `alert()` / `confirm()`**

```bash
git diff main...HEAD -- src/components/Palette src/components/Properties src/components/TranscriptPanel src/App.tsx | grep -E "^\+.*\b(alert|confirm)\("
```

Expected: zero hits.

- [ ] **Step 8: Lint the whole project**

```bash
npm run lint
```

Expected: same pre-existing warnings as on `main` (no new errors / warnings introduced by PR 3). If a new react-refresh warning fires on `TranscriptClosedStrip.tsx`, it's likely the same kind of warning PR 2 silenced — confirm parity, don't introduce new ones.

- [ ] **Step 9: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Build**

```bash
npm run build
```

Expected: clean production build, no errors. Note the bundle size for the post-merge deploy step.

- [ ] **Step 11: AA contrast spot-check on new surfaces**

The Sage Garden tokens already pass AA on chrome-bg (verified in PR 1). The new surfaces introduced by PR 3 to sanity-check:

| Surface | Foreground | Background | Expected |
|---|---|---|---|
| Delete button (Properties) | `#ffffff` | `#b23a48` (`theme.button.danger.bg`) | ~5.2:1 — passes AA for normal text. |
| Properties empty-state hint | `#4a5a3c` (`text.secondary`) | `theme.properties.bg` gradient (≈`#f8faf4`) | ~5.85:1 — passes AA. |
| Search input placeholder | `#4a5a3c` (`input.placeholder`) | `#ffffff` (`input.bg`) | ~5.85:1 — passes AA. |
| Selected contributor label | `#2a3324` (`sidebar.text`) | `#e7ede0` (`sidebar.surfaceActive`) | ~10.5:1 — passes AAA. |
| Linked-line text on `surfaceActive` | `#2a3324` (`sidebar.text`) | `#e7ede0` | ~10.5:1 — passes AAA. |
| Transcript closed-strip label | `#4a5a3c` (`textSecondary`) | sage gradient ≈`#f0f4eb` | ~5.6:1 — passes AA. |

Spot-check the live result with a browser dev-tools contrast checker (Chrome DevTools → element → Accessibility → Contrast) for at least the Delete button and the closed-strip label. If anything falls below 4.5:1, bump the token (don't add a one-off color literal).

- [ ] **Step 12: Commit anything still unstaged**

If any of the previous steps required tweaks, commit them:

```bash
git status
git add -A
git commit -m "chore(pr3): audit fixes" # only if there are real changes
```

If nothing changed, skip this step.

---

## Task 13: Browser smoke test the full panel workflow

**Files:** (none modified)

Walk through every spec-§6 surface in the browser to confirm behavior preservation.

- [ ] **Step 1: Open the app**

If not already running:

```bash
npm run dev
```

Open `http://localhost:5173/`.

- [ ] **Step 2: Palette — drag-drop preservation**

- Drag each Argument type onto the canvas → element appears with the contributor's color, dashed border if `student`, cloud shape if `implicit`. Behavior unchanged from PR 2.
- Switch contributors → newly added elements use the new color; existing elements keep their own.
- Drag Action / Question / Other support → support elements render correctly. The subtype dropdown still controls the `other` subtype.

- [ ] **Step 3: Palette — contributor chip semantics**

- Click each contributor row → its dot becomes the ringed selected one.
- Confirm Student's dot has a dashed outline.
- Confirm Joint/Implicit aren't ringed differently except via the selection indicator.

- [ ] **Step 4: Properties — empty + filled + connection states**

- Click empty canvas → Properties shows dashed-bordered italic "No element selected · click an element on the canvas to edit it."
- Click an element → Properties shows the horizontal row with Label / Type / Contributor / Convert / Content / Speaker / Time fields and the Duplicate + Delete buttons pinned right.
- Click a connection → Properties shows "Connection — auto-routed" + a (disabled) Reset routing button.
- Drag a waypoint on the connection → Properties updates to "manual routing applied"; Reset routing enables.
- Click Reset routing → returns to auto. Behavior unchanged from PR 2.

- [ ] **Step 5: Properties — Duplicate / Delete**

- Select an argument element → click Duplicate → second element appears offset.
- Click Delete on the duplicate → it disappears, Properties returns to empty state.
- Keyboard ⌘D + Delete / Backspace still work as before.

- [ ] **Step 6: Transcript panel — empty state**

- Close the panel via the X icon, then re-open via the closed strip.
- With no transcript loaded: panel shows FileText icon + "No transcript loaded · ..." + the inline Load transcript button.
- Click the inline Load button → file picker opens. Cancel → state preserved.

- [ ] **Step 7: Transcript panel — header + search**

- Load a transcript (any `.txt` file from `test/` or paste one).
- Header shows "Transcript" left + close-X right; filename mono row + "N lines" below.
- Search input visible immediately below header.
- Type a query → lines filter in real time. Empty query restores the full list. No-match → "No lines match" hint.
- Hover the filename → full filename shows in title tooltip.

- [ ] **Step 8: Transcript panel — selected-line link highlight**

- With a transcript loaded, set a line's contributor + object type, then drag it onto the canvas → an element appears.
- Click the element on the canvas → its source line in the transcript shows the `surfaceActive` background.
- Click empty canvas → highlight clears.
- Cmd-click multiple elements → all linked lines highlight.

- [ ] **Step 9: Transcript panel — closed strip**

- Close the transcript panel → 28px vertical strip with "Transcript ▸" (reading bottom-to-top) appears on the right edge.
- Hover → background lifts subtly.
- Click → panel re-opens, transcript still loaded, search query preserved.

- [ ] **Step 10: Canvas + marquee + cursors**

- Drag-marquee an area on the canvas → marquee rectangle renders **identically** to pre-PR-3 (same fill / stroke — sealed). Elements within the rectangle become selected.
- Enable Connect Mode → cursor becomes a crosshair on the canvas. (Hover an element — cursor stays crosshair; the canvas still allows starting a connection.)
- Drag with middle-mouse / space — cursor becomes a grab cursor while panning.
- Hover a disabled button (e.g., Clear with empty canvas, Reset routing when auto-routed) → `not-allowed` cursor.

- [ ] **Step 11: Full-screen toggle (regression)**

- Press F → toolbar slides up, palette + transcript panel hide. Press F again → everything restores. No layout shift caused by PR 3.

- [ ] **Step 12: Autosave + recovery (regression)**

- With some elements + a transcript loaded, refresh the page → recovery prompt offers to restore. Restore → state matches pre-refresh.

If anything fails any of the above, fix in the relevant Task X file, recommit (`chore(pr3): fix <thing>`), and re-run the relevant smoke steps.

---

## Task 14: Commit (if anything left unstaged) + push the branch

**Files:** (none modified)

Wrap up the branch and push for PR creation.

- [ ] **Step 1: Confirm everything's committed**

```bash
git status
```

Expected: `working tree clean` on `feat/ui-rehaul-pr3-panels`.

- [ ] **Step 2: Review the cumulative diff against main**

```bash
git diff main...feat/ui-rehaul-pr3-panels --stat
```

Expected files in the diff (approximate line counts):

- `docs/superpowers/plans/2026-05-12-ui-rehaul-pr3-panels.md` (created — this plan)
- `src/components/Palette/Palette.tsx` (modified, net stable LOC — restyle in place)
- `src/components/Properties/PropertiesPanel.tsx` (modified, +60–80 LOC for empty state + actions row)
- `src/components/TranscriptPanel/TranscriptPanel.tsx` (modified, +40–60 LOC for header, search, empty state, linkedLineIndexes)
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx` (modified, ~5 LOC: new prop + cardBg precedence)
- `src/components/TranscriptPanel/TranscriptClosedStrip.tsx` (created, ~40 LOC)
- `src/components/TranscriptPanel/index.ts` (modified, +1 export line if not already `export *`)
- `src/App.tsx` (modified, ~15 LOC net reduction — inline button replaced)

No file outside the above set should appear in the diff. Specifically `src/components/Canvas/**`, `src/utils/colors.ts`, `src/utils/theme.ts`, `src/store/**`, and `src/components/Toolbar/**` must not appear.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/ui-rehaul-pr3-panels
```

Expected: branch pushed, tracking set.

- [ ] **Step 4: Open a draft PR**

```bash
gh pr create --draft \
  --title "UI rehaul · PR 3 — Panels" \
  --body "$(cat <<'EOF'
## Summary
- Palette: plain element pills (white fill + 1px border, no contributor-tinted borders), contributor chips as small circular dots in real contributor colors, scale-animations removed.
- Properties: dashed-border italic empty state, restyled connection-routing row, right-aligned Duplicate (Copy icon + label) + Delete (Trash2 icon + label, danger fill) action buttons.
- Transcript panel: header with mono filename + line count, always-visible Search input + filter logic, open-but-empty state with FileText icon + inline Load button, linked-to-selected-element line highlight (uses `surfaceActive`).
- Closed transcript strip extracted to `TranscriptClosedStrip.tsx` with rotated "Transcript ▸" label (28px wide).
- Marquee selection rectangle, colors.ts, Canvas/**, theme.ts, and store untouched. Cursor utilities preserved.

## Test plan
- [ ] Drag every Argument and Support type from the palette → renders identically to PR 2.
- [ ] Contributor selection still affects newly-added element color; Student's dot shows a dashed outline; Implicit only allows Warrant.
- [ ] Properties empty state shows dashed-bordered italic hint; no canvas jump on empty ↔ filled (info-box / support).
- [ ] Properties Duplicate creates an offset copy; Delete removes the element. Keyboard ⌘D + Del / Backspace still work.
- [ ] Transcript header shows title + mono filename + N lines; close button visible only when a transcript is loaded.
- [ ] Transcript search filters lines case-insensitively across speaker + text; empty query restores; no-match shows hint.
- [ ] Drag-drop from a filtered transcript line still creates an element on the canvas with the correct sourceTranscript.
- [ ] Selecting an element with a linked transcript line shows the line in `surfaceActive`; multi-select highlights all linked lines.
- [ ] Closed transcript strip shows rotated "Transcript ▸"; hover lifts; click re-opens the panel; transcript and search query persist.
- [ ] Canvas marquee selection identical to pre-PR-3 (same fill / stroke / behavior).
- [ ] Connect-mode crosshair, pan grab, disabled not-allowed cursors all still apply.
- [ ] Full-screen toggle (F) unchanged. Autosave / recovery unchanged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If Jennifer prefers to open the PR manually, this step can be skipped — the branch is pushed and ready.

---

## Task 15: Build + deploy to jenkleiman.com

**Files:** (none modified in this repo; updates the sibling repo)

Per the dual-repo dance documented in `CLAUDE.md`. **Only run after the PR is merged into `main`** — do not deploy from the feature branch.

- [ ] **Step 1: Merge the PR (Jennifer's call)**

After Jennifer approves and merges, switch back to main and pull:

```bash
git checkout main
git pull
```

- [ ] **Step 2: Build the production bundle**

```bash
npm run build
```

Expected: `dist/` populated, no build errors.

- [ ] **Step 3: Copy to jenkleiman.com repo**

```bash
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
```

- [ ] **Step 4: Commit + push the sibling repo**

```bash
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: PR 3 UI rehaul — panels restyle (palette pills + properties actions + transcript search/links)"
git push
```

Netlify deploys automatically.

- [ ] **Step 5: Smoke-test the live site**

After Netlify reports deploy success, open `https://jenkleiman.com/tools/etd/` and walk through Task 13 Steps 2–11. The behavior on the live site should match the dev server exactly.

---

## Notes for the implementer

- **Use Read before Edit on every file you touch.** Each Edit must match exact whitespace as it appears in the file today; the snippets above are accurate at the time of writing but the file may have shifted by the time you start.
- **Commit per task, not per step.** Each Task above ends in a commit. If a Task's smoke check fails mid-way, fix the issue in the same Task and roll the fix into that task's commit message — don't split a half-working task across two commits.
- **If the diff size for a task explodes past what's promised** (e.g., Task 2 said "replace one block" and you're staring at 200 lines of change), stop and re-read the original spec section. Almost always the right move is a narrower edit, not a broader one.
- **The marquee is sealed. Repeat that to yourself before each Konva-adjacent edit.** Task 12 will catch a sealed-file change at the audit gate, but it's cheaper to not make it in the first place.
- **The dev server stays open the whole time.** Vite HMR is faster than re-running the typecheck for every visual change. Run `npm run typecheck` and `npm run lint` at the end of each task, not after every step.
