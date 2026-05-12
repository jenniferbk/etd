# UI rehaul · PR 2 — Toolbar restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the toolbar from 22+ inline icon buttons into a hybrid of 14 visible affordances grouped into 4 clusters (History, File, View, Zoom), plus an `Export ▾` dropdown (4 variants) and a `···` More overflow menu (3 items). Same icons, same handlers, same behavior — only the layout and packaging change. Add keyboard navigation to the dropdowns (arrow keys, Enter, Escape, outside-click) and hover-revealed group labels.

> **Spec inconsistency to resolve:** spec line 404 (PR 2 summary) says "a 4-item More menu," but spec §5.3 explicitly enumerates **three** items (Element styles, About & shortcuts, Clear diagram). Memory file `etd-ui-rehaul-pr1-shipped.md` also says "3-item More menu." This plan follows the §5.3 enumeration — three menu items plus one separator — because the enumeration is more authoritative than the summary count. If Jennifer confirms a different intent during review, add the fourth item before Task 6 ships.

**Architecture:** Split the monolithic `Toolbar.tsx` into the orchestrator plus four new sibling components — `ExportMenu.tsx`, `MoreMenu.tsx`, `MenuItem.tsx`, `ToolbarGroup.tsx` — and one hook `useMenu.ts`. Extract the inline `IconButton` closure to its own file so the dropdown triggers can reuse the same styling. All new files read colors / z-index / shadow from `theme.ts` tokens; no hardcoded literals, no Tailwind color utilities, no raw `z-index` values.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS (layout / typography / cursor only — color utilities forbidden), lucide-react icons (already a dependency). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-12-ui-rehaul-design.md` (v4) §5 + §11 "PR 2 — Toolbar". This plan implements PR 2 only.

**Sealed (do not touch in this PR):**
- `src/utils/colors.ts`
- `src/components/Canvas/**`
- `src/utils/theme.ts` — token shape is already correct from PR 1; no new tokens needed.
- Every existing toolbar handler (`handleSave`, `handleLoad`, `handleExportPNG`, `handleExportSVG`, `handleExportPDF`, `handleExportDiagramx`, `handleClear`, `handleResetView`, `toggleLegend`, `onLoadTranscript`, `onToggleTranscriptPanel`, `onOpenSettings`, `setShowAbout`). They migrate verbatim into new locations; their signatures and side effects do not change.

---

## File map

**Create (6 new files):**
- `src/components/Toolbar/IconButton.tsx` — Lifted out of `Toolbar.tsx`. The same hover/active/danger/loading styling. Adds optional `ariaHasPopup` and `ariaExpanded` props so dropdown triggers can declare their menu state.
- `src/components/Toolbar/useMenu.ts` — Hook returning `{ isOpen, open, close, toggle, menuRef, triggerRef }`. Manages outside-click and Escape close. Restores focus to the trigger after close.
- `src/components/Toolbar/MenuItem.tsx` — Shared dropdown row: icon + label + optional shortcut + optional `variant: 'danger'`. Renders as a `<button role="menuitem">` so native Enter / Space activate the click handler.
- `src/components/Toolbar/ExportMenu.tsx` — `Download` icon trigger + 220px popover with 4 menu items (PNG / SVG / PDF / DiagramMix). Owns the `exporting` state. Arrow-key keyboard nav. Reads from `theme.shadow.md`, `theme.sidebar.surface`, `theme.sidebar.border`, `theme.z.dropdown`.
- `src/components/Toolbar/MoreMenu.tsx` — `MoreHorizontal` icon trigger + 220px popover with 3 items (Element styles / About & shortcuts / — separator — / Clear diagram). Clear diagram uses `variant="danger"`. Same keyboard nav pattern as ExportMenu.
- `src/components/Toolbar/ToolbarGroup.tsx` — Tiny wrapper that gives each cluster a `position: relative` container plus a hover-revealed label above. Takes `label: string` and `children`.

**Modify (3 files):**
- `src/components/Toolbar/Toolbar.tsx` — Replace the 4 inline Export `IconButton`s with `<ExportMenu>`. Replace the Clear / Settings / About `IconButton`s with `<MoreMenu>`. Wrap each remaining cluster (History, File, View, Zoom) in `<ToolbarGroup label="…">`. Reorder Zoom-group buttons to match spec §5.1 order (Zoom out, %, Zoom in, **Fit to window**, **Reset view** — currently swapped). Remove the inline `IconButton` closure (now imported from its own file). Keep the brand input + diagram-name input untouched.
- `src/components/Toolbar/index.ts` — Optional: add re-exports if any test or peer module needs them. Default: no change (ExportMenu / MoreMenu / etc. are internal to the Toolbar feature).
- `src/index.css` — Add a small `.toolbar-group` + `.toolbar-group-label` rule block so the group labels reveal on hover with CSS only (no per-component hover state).

**Untouched but verified intact:**
- `src/App.tsx` — Toolbar props (`onLoadTranscript`, `transcriptPanelOpen`, `onToggleTranscriptPanel`, `onOpenSettings`) are unchanged. Diff this file at the end to confirm no incidental edits.
- `src/components/Toolbar/AboutModal.tsx`, `ImageImportModal.tsx` — Wired the same way (rendered conditionally from `Toolbar.tsx`).
- `src/components/ui/Tooltip.tsx` — Used by `IconButton`; no change.

**Forbidden patterns introduced in PR 2 (audit grep gate at Task 9):**
- Raw `z-index` numbers — use `theme.z.*`.
- Hardcoded colors (`#xxx`, `rgba(...)`) — use `theme.*.bg` / `theme.*.border` / `theme.*.text`.
- Tailwind color utilities (`bg-blue-…`, `text-gray-…`, etc.) — use inline `style={{...}}`.
- `alert()` / `confirm()` — keep the existing `confirm()` call inside `handleClear` for now (PR 4 replaces it). Do **not** add any new `alert()` site.

---

## Task 1: Create a feature branch

**Files:** (none modified yet)

Match the PR 1 workflow.

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `On branch main`, working tree clean (or only the four untracked `IMG_3*.HEIC` / `IMG_3*.json` files left over from prior debugging — those stay untracked).

- [ ] **Step 2: Create + switch to the PR 2 branch**

```bash
git checkout -b feat/ui-rehaul-pr2-toolbar
```

Expected: `Switched to a new branch 'feat/ui-rehaul-pr2-toolbar'`.

- [ ] **Step 3: Confirm the branch**

```bash
git branch --show-current
```

Expected: `feat/ui-rehaul-pr2-toolbar`.

---

## Task 2: Extract `IconButton` to its own file

**Files:**
- Create: `src/components/Toolbar/IconButton.tsx`
- Modify: `src/components/Toolbar/Toolbar.tsx` (delete inline `IconButton` declaration, import from new file)

The current `IconButton` is an inline closure inside `Toolbar.tsx` (lines 239–290). Lifting it out lets `ExportMenu` and `MoreMenu` reuse it as their trigger button. While moving it, add two optional pass-through ARIA props so dropdown triggers can advertise their popup state.

- [ ] **Step 1: Create `src/components/Toolbar/IconButton.tsx`**

Create the file with the following contents (a direct port of the inline declaration + ARIA props + an inline `forwardRef` so menu triggers can attach a ref if they ever need to position relative to the button itself — they currently don't, but the hook contract supports it):

```tsx
import { useState, forwardRef } from 'react';
import type { ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { theme } from '../../utils/theme';
import { Tooltip } from '../ui/Tooltip';

interface IconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon: ComponentType<LucideProps>;
  tooltip: string;
  shortcut?: string;
  variant?: 'danger';
  isActive?: boolean;
  isLoading?: boolean;
  ariaHasPopup?: boolean;
  ariaExpanded?: boolean;
  ariaLabel?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    onClick,
    disabled,
    icon: Icon,
    tooltip,
    shortcut,
    variant,
    isActive,
    isLoading,
    ariaHasPopup,
    ariaExpanded,
    ariaLabel,
  },
  ref,
) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Tooltip content={tooltip} shortcut={shortcut}>
      <button
        ref={ref}
        onClick={onClick}
        disabled={disabled || isLoading}
        aria-label={ariaLabel ?? tooltip}
        aria-haspopup={ariaHasPopup ? 'menu' : undefined}
        aria-expanded={ariaHasPopup ? ariaExpanded : undefined}
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        style={{
          color:
            variant === 'danger' && isHovered
              ? theme.danger.fg
              : theme.sidebar.text,
          backgroundColor: isActive
            ? theme.sidebar.surfaceHover
            : isHovered
              ? variant === 'danger'
                ? theme.danger.bg
                : theme.sidebar.surfaceHover
              : 'transparent',
          transform: isHovered && !disabled ? 'scale(1.05)' : 'scale(1)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" style={{ color: theme.sidebar.accent }} />
        ) : (
          <Icon size={18} />
        )}
      </button>
    </Tooltip>
  );
});
```

- [ ] **Step 2: Delete the inline `IconButton` declaration from `Toolbar.tsx`**

In `src/components/Toolbar/Toolbar.tsx`, delete lines 231–290 (the `iconButtonClass` const, `dividerClass` const, and the entire inline `IconButton` function declaration). Move `dividerClass` to remain inline at the top of the JSX render — see Task 8, which rewrites the render anyway. For now, just delete the closure.

Specifically, delete this whole block:

```tsx
const iconButtonClass = `
  w-9 h-9 flex items-center justify-center rounded-lg
  transition-all duration-150 ease-out
  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
`;

const dividerClass = 'w-px h-6 mx-2';

const IconButton = ({
  /* …all props… */
}: {
  /* …all type fields… */
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Tooltip content={tooltip} shortcut={shortcut}>
      <button /* …all attributes… */>
        {/* … */}
      </button>
    </Tooltip>
  );
};
```

- [ ] **Step 3: Re-add `dividerClass` as a top-level const**

Immediately above the `return (` of the `Toolbar` function, add:

```tsx
const dividerClass = 'w-px h-6 mx-2';
```

(This avoids a longer rewrite while keeping the dividers working through Task 8.)

- [ ] **Step 4: Add the `IconButton` import to `Toolbar.tsx`**

At the top of `src/components/Toolbar/Toolbar.tsx`, add (preserving alphabetical-ish order near the other `./` imports):

```tsx
import { IconButton } from './IconButton';
```

- [ ] **Step 5: Remove now-unused imports from `Toolbar.tsx`**

Audit `Toolbar.tsx`'s import list. After extracting `IconButton`, these are no longer used **directly by Toolbar.tsx** and should be removed if no other reference remains:

- `Loader2` (moved into IconButton) — remove from the lucide-react import block.
- `Tooltip` (moved into IconButton) — remove the `import { Tooltip }` line.

Leave every other import in place — Toolbar.tsx still uses `Save`, `FolderOpen`, `Download`, `Image`, `FileText`, `FileJson`, `Trash2`, `ZoomIn`, `ZoomOut`, `Undo2`, `Redo2`, `Info`, `LayoutGrid`, `FileInput`, `PanelRight`, `Crosshair`, `Maximize2`, `Settings`, `ImagePlus`. These get pared further when `ExportMenu` and `MoreMenu` absorb some of them; leave them for now to avoid mid-task breakage.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Toolbar/IconButton.tsx src/components/Toolbar/Toolbar.tsx
git commit -m "$(cat <<'EOF'
chore(pr2): extract IconButton to its own file

Lifts the inline IconButton closure out of Toolbar.tsx so ExportMenu and
MoreMenu can reuse it as their trigger button in subsequent tasks. Adds
optional ariaHasPopup / ariaExpanded / ariaLabel pass-through props.
Behavior unchanged for existing call sites.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create the `useMenu` hook

**Files:**
- Create: `src/components/Toolbar/useMenu.ts`

A tiny hook both dropdown components share. Manages `isOpen`, closes on outside click + Escape, and restores focus to the trigger when closed via keyboard.

- [ ] **Step 1: Create `src/components/Toolbar/useMenu.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseMenuResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Attach to the popover container so outside-click ignores its descendants. */
  menuRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the trigger button so outside-click ignores it (the click that opened
   *  the menu shouldn't immediately close it). */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Dropdown menu state with outside-click + Escape close.
 * Both ExportMenu and MoreMenu consume this hook; each layers its own
 * arrow-key item navigation on top.
 */
export function useMenu(): UseMenuResult {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Outside click — close when a mousedown happens outside both the menu
  // and the trigger.
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Escape — close + return focus to the trigger.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return { isOpen, open, close, toggle, menuRef, triggerRef };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/useMenu.ts
git commit -m "$(cat <<'EOF'
chore(pr2): add useMenu hook for dropdown open/close + Escape + outside-click

Both ExportMenu and MoreMenu share this small hook. Arrow-key item
navigation lives in each menu component (tiny, easier to keep in sight).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create the `MenuItem` component

**Files:**
- Create: `src/components/Toolbar/MenuItem.tsx`

Shared dropdown row: icon + label + optional shortcut hint + optional danger variant + optional loading spinner. Renders as a `<button role="menuitem">`.

- [ ] **Step 1: Create `src/components/Toolbar/MenuItem.tsx`**

```tsx
import { useState, forwardRef } from 'react';
import type { ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { theme } from '../../utils/theme';

interface MenuItemProps {
  icon: ComponentType<LucideProps>;
  label: string;
  shortcut?: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  isLoading?: boolean;
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { icon: Icon, label, shortcut, onClick, variant = 'default', disabled, isLoading },
  ref,
) {
  const [isHovered, setIsHovered] = useState(false);
  const isDanger = variant === 'danger';

  return (
    <button
      ref={ref}
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      disabled={disabled || isLoading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors duration-100 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        color: isDanger ? theme.danger.fg : theme.sidebar.text,
        backgroundColor: isHovered && !disabled
          ? isDanger
            ? theme.danger.bg
            : theme.sidebar.hover
          : 'transparent',
      }}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" style={{ color: theme.sidebar.accent }} />
      ) : (
        <Icon size={16} style={{ color: isDanger ? theme.danger.fg : theme.sidebar.textSecondary }} />
      )}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd
          className="px-1.5 py-0.5 text-[10px] rounded font-mono"
          style={{
            backgroundColor: theme.sidebar.bg,
            color: theme.sidebar.muted,
          }}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
});
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/MenuItem.tsx
git commit -m "$(cat <<'EOF'
chore(pr2): add MenuItem row component (icon + label + optional shortcut + danger variant)

Shared row used by ExportMenu and MoreMenu. tabIndex=-1 so the parent
menu container can drive focus with arrow keys via refs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create the `ExportMenu` component

**Files:**
- Create: `src/components/Toolbar/ExportMenu.tsx`

Trigger: a `Download`-icon `IconButton` with `aria-haspopup` / `aria-expanded`. Popover: 220px wide, anchored top-right of the trigger, containing 4 items. Owns the `exporting` state so the loading spinner can move with the focused row. Arrow-key navigation between items; Enter activates (native button behavior); Escape closes (handled by `useMenu`); outside-click closes (handled by `useMenu`); focus-out closes.

- [ ] **Step 1: Create `src/components/Toolbar/ExportMenu.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Download, FileImage, FileText, FileJson, FileCode } from 'lucide-react';
import { IconButton } from './IconButton';
import { MenuItem } from './MenuItem';
import { useMenu } from './useMenu';
import { theme } from '../../utils/theme';

export type ExportVariant = 'png' | 'svg' | 'pdf' | 'diagramx';

interface ExportMenuProps {
  onExportPNG: () => void | Promise<void>;
  onExportSVG: () => void | Promise<void>;
  onExportPDF: () => void | Promise<void>;
  onExportDiagramx: () => void | Promise<void>;
}

const ITEM_COUNT = 4;

export function ExportMenu({
  onExportPNG,
  onExportSVG,
  onExportPDF,
  onExportDiagramx,
}: ExportMenuProps) {
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const [exporting, setExporting] = useState<ExportVariant | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // When the menu opens, reset focus to the first item on the next frame.
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function runExport(variant: ExportVariant, handler: () => void | Promise<void>) {
    setExporting(variant);
    close();
    Promise.resolve(handler()).finally(() => setExporting(null));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndex + 1) % ITEM_COUNT;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndex - 1 + ITEM_COUNT) % ITEM_COUNT;
      setActiveIndex(prev);
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(ITEM_COUNT - 1);
      itemRefs.current[ITEM_COUNT - 1]?.focus();
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Close if focus moves outside the menu container AND outside the trigger.
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  return (
    <div className="relative inline-flex">
      <IconButton
        ref={triggerRef}
        onClick={toggle}
        icon={Download}
        tooltip="Export…"
        ariaHasPopup
        ariaExpanded={isOpen}
        ariaLabel="Export options"
        isLoading={exporting !== null}
      />

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Export options"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="absolute right-0 rounded-lg py-1"
          style={{
            top: 'calc(100% + 4px)',
            width: 220,
            backgroundColor: theme.sidebar.surface,
            border: `1px solid ${theme.sidebar.border}`,
            boxShadow: theme.shadow.md,
            zIndex: theme.z.dropdown,
          }}
        >
          <MenuItem
            ref={(el) => { itemRefs.current[0] = el; }}
            icon={FileImage}
            label="Export as PNG"
            onClick={() => runExport('png', onExportPNG)}
            isLoading={exporting === 'png'}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[1] = el; }}
            icon={FileCode}
            label="Export as SVG"
            onClick={() => runExport('svg', onExportSVG)}
            isLoading={exporting === 'svg'}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[2] = el; }}
            icon={FileText}
            label="Export as PDF"
            onClick={() => runExport('pdf', onExportPDF)}
            isLoading={exporting === 'pdf'}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[3] = el; }}
            icon={FileJson}
            label="Export as DiagramMix"
            onClick={() => runExport('diagramx', onExportDiagramx)}
            isLoading={exporting === 'diagramx'}
          />
        </div>
      )}
    </div>
  );
}
```

Notes for the implementer:

- The PNG / SVG icons differ from the originals (was `Image` for PNG and `Download` for SVG). `Download` is now the trigger icon — to avoid duplication inside the menu, PNG uses `FileImage` and SVG uses `FileCode`. PDF and DiagramMix icons (`FileText`, `FileJson`) are unchanged. All five icons exist in lucide-react.
- `runExport` closes the menu first, then runs the handler. The handler is allowed to be async; the spinner state stays on the trigger button until the promise resolves. The original `Toolbar.tsx` handlers all use the same try/finally pattern internally, so wrapping them in `Promise.resolve(...).finally(...)` is safe whether they return a promise or not.
- `aria-haspopup="menu"` + `aria-expanded={isOpen}` on the trigger, `role="menu"` on the popover, `role="menuitem"` on each item — standard ARIA dropdown pattern.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If `lucide-react` complains about `FileImage` or `FileCode`, both are present in lucide-react v0.x — confirm by running `grep "FileImage\|FileCode" node_modules/lucide-react/dist/lucide-react.d.ts | head -3` and substitute another icon if needed (e.g., `Image` for PNG, `Code` for SVG).

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/ExportMenu.tsx
git commit -m "$(cat <<'EOF'
chore(pr2): add ExportMenu dropdown (PNG / SVG / PDF / DiagramMix)

220px popover anchored to the Download-icon trigger. Owns the exporting
state. Arrow keys + Home/End cycle items; Escape closes; outside-click
closes; focus-out closes. Not wired into Toolbar.tsx yet — Task 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create the `MoreMenu` component

**Files:**
- Create: `src/components/Toolbar/MoreMenu.tsx`

Trigger: a `MoreHorizontal`-icon `IconButton`. Popover: 220px wide, contains 3 items (Element styles, About & shortcuts, then a separator and a `danger` Clear diagram). Same keyboard nav as `ExportMenu`.

- [ ] **Step 1: Create `src/components/Toolbar/MoreMenu.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Settings, Info, Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';
import { MenuItem } from './MenuItem';
import { useMenu } from './useMenu';
import { theme } from '../../utils/theme';

interface MoreMenuProps {
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onClear: () => void;
}

const ITEM_COUNT = 3;

export function MoreMenu({ onOpenSettings, onOpenAbout, onClear }: MoreMenuProps) {
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function run(handler: () => void) {
    close();
    handler();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndex + 1) % ITEM_COUNT;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndex - 1 + ITEM_COUNT) % ITEM_COUNT;
      setActiveIndex(prev);
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(ITEM_COUNT - 1);
      itemRefs.current[ITEM_COUNT - 1]?.focus();
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  return (
    <div className="relative inline-flex">
      <IconButton
        ref={triggerRef}
        onClick={toggle}
        icon={MoreHorizontal}
        tooltip="More options"
        ariaHasPopup
        ariaExpanded={isOpen}
        ariaLabel="More options"
      />

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="More options"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="absolute right-0 rounded-lg py-1"
          style={{
            top: 'calc(100% + 4px)',
            width: 220,
            backgroundColor: theme.sidebar.surface,
            border: `1px solid ${theme.sidebar.border}`,
            boxShadow: theme.shadow.md,
            zIndex: theme.z.dropdown,
          }}
        >
          <MenuItem
            ref={(el) => { itemRefs.current[0] = el; }}
            icon={Settings}
            label="Element styles"
            onClick={() => run(onOpenSettings)}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[1] = el; }}
            icon={Info}
            label="About & shortcuts"
            onClick={() => run(onOpenAbout)}
          />
          <div
            className="my-1 mx-2"
            style={{ height: 1, backgroundColor: theme.sidebar.border }}
            role="separator"
          />
          <MenuItem
            ref={(el) => { itemRefs.current[2] = el; }}
            icon={Trash2}
            label="Clear diagram"
            variant="danger"
            onClick={() => run(onClear)}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/MoreMenu.tsx
git commit -m "$(cat <<'EOF'
chore(pr2): add MoreMenu dropdown (Element styles / About / Clear diagram)

3 items with a separator between About and Clear. Clear diagram uses the
danger variant. Not wired into Toolbar.tsx yet — Task 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Create `ToolbarGroup` + add hover-label CSS

**Files:**
- Create: `src/components/Toolbar/ToolbarGroup.tsx`
- Modify: `src/index.css` (append a small `.toolbar-group` / `.toolbar-group-label` block)

Spec §5.1: "Group labels appear on hover above each group (text-secondary, uppercase, letter-spacing: 0.08em)." Implementation = pure CSS via a `.toolbar-group:hover .toolbar-group-label { opacity: 1; }` rule, no per-component hover state.

- [ ] **Step 1: Create `src/components/Toolbar/ToolbarGroup.tsx`**

```tsx
import type { ReactNode } from 'react';

interface ToolbarGroupProps {
  label: string;
  children: ReactNode;
}

export function ToolbarGroup({ label, children }: ToolbarGroupProps) {
  return (
    <div className="toolbar-group relative flex items-center gap-0.5">
      {children}
      <span className="toolbar-group-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Append the CSS rule to `src/index.css`**

Open `src/index.css` and add the following block at the end of the file:

```css

/* ============================================
   Toolbar group hover labels (PR 2)
   ============================================ */

.toolbar-group-label {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity var(--transition-fast);
  pointer-events: none;
  white-space: nowrap;
}

.toolbar-group:hover .toolbar-group-label,
.toolbar-group:focus-within .toolbar-group-label {
  opacity: 1;
}
```

`:focus-within` makes the label appear when keyboard focus moves into the group too, not just on mouse hover.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar/ToolbarGroup.tsx src/index.css
git commit -m "$(cat <<'EOF'
chore(pr2): add ToolbarGroup wrapper with hover/focus group labels

Per spec §5.1 — uppercase letter-spaced labels reveal above each cluster
on hover or focus-within. Pure CSS, no per-component state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Refactor `Toolbar.tsx` to use the new pieces

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`

This is the big integration task. Replace the 4 inline Export `IconButton`s with `<ExportMenu>`, replace the Clear / Settings / About `IconButton` group with `<MoreMenu>`, wrap each remaining cluster in `<ToolbarGroup label="…">`, reorder the Zoom group buttons (Fit before Reset per spec §5.1), and trim the now-unused imports.

The full updated render block follows. Replace the current `return ( <> … </> );` block (currently lines 292–484) with the version below. Keep the entire prelude (state, handlers, `dividerClass`) intact except for the four explicit deletions called out in Step 3.

- [ ] **Step 1: Add the new imports at the top of `Toolbar.tsx`**

```tsx
import { ExportMenu } from './ExportMenu';
import { MoreMenu } from './MoreMenu';
import { ToolbarGroup } from './ToolbarGroup';
```

- [ ] **Step 2: Remove no-longer-needed lucide-react imports**

After Task 8 lands, `Toolbar.tsx` itself only needs these lucide icons: `Save`, `FolderOpen`, `ImagePlus`, `Undo2`, `Redo2`, `LayoutGrid`, `FileInput`, `PanelRight`, `ZoomIn`, `ZoomOut`, `Crosshair`, `Maximize2`. Remove from the import block: `Download`, `Image`, `FileText`, `FileJson`, `Trash2`, `Info`, `Settings`. (Those have moved into `ExportMenu` and `MoreMenu`.)

The resulting lucide-react import becomes:

```tsx
import {
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  LayoutGrid,
  FileInput,
  PanelRight,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Maximize2,
  ImagePlus,
} from 'lucide-react';
```

- [ ] **Step 3: Remove the `AboutModal` state hoist + render**

`MoreMenu` doesn't manage the About modal — it calls a callback. Currently `Toolbar.tsx` owns the `showAbout` state and renders `<AboutModal />` inline. Keep that ownership in `Toolbar.tsx`: rename the state for clarity but don't move it. The MoreMenu's `onOpenAbout` simply calls `setShowAbout(true)`.

Concretely: leave `const [showAbout, setShowAbout] = useState(false);` (line 71 currently) and `{showAbout && <AboutModal onClose={() => setShowAbout(false)} />}` (line 481 currently) in place. Both stay.

- [ ] **Step 4: Replace the render JSX**

Replace the JSX inside `return ( <> … </> );` with this. Diff against the existing structure (lines 292–484) — only the controls block changes; the brand block and the `AboutModal` / `ImageImportModal` portals are unchanged:

```tsx
return (
  <>
    <div
      className="h-14 px-5 flex items-center justify-between border-b"
      style={{
        background: theme.toolbar.bgGradient,
        borderColor: theme.toolbar.border,
        boxShadow: theme.toolbar.shadow,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-sm font-medium"
          style={{ color: theme.sidebar.textSecondary }}
        >
          ETD
        </span>
        <span style={{ color: theme.sidebar.border }}>|</span>
        <input
          type="text"
          value={diagramName}
          onChange={(e) => setDiagramName(e.target.value)}
          className="text-base font-semibold tracking-tight bg-transparent border-none outline-none min-w-[200px]"
          style={{ color: theme.sidebar.text }}
          placeholder="Untitled Diagram"
        />
      </div>

      <div className="flex items-center">
        {/* History — Undo / Redo */}
        <ToolbarGroup label="History">
          <IconButton
            onClick={() => temporal.undo()}
            disabled={!canUndo}
            icon={Undo2}
            tooltip="Undo"
            shortcut="Ctrl+Z"
          />
          <IconButton
            onClick={() => temporal.redo()}
            disabled={!canRedo}
            icon={Redo2}
            tooltip="Redo"
            shortcut="Ctrl+Shift+Z"
          />
        </ToolbarGroup>

        <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

        {/* File — Save / Open / Import / Export▾ */}
        <ToolbarGroup label="File">
          <IconButton
            onClick={handleSave}
            icon={Save}
            tooltip="Save diagram"
            shortcut="Ctrl+S"
          />
          <IconButton
            onClick={handleLoad}
            icon={FolderOpen}
            tooltip="Load diagram"
            shortcut="Ctrl+O"
          />
          <IconButton
            onClick={() => setImportModalOpen(true)}
            icon={ImagePlus}
            tooltip="Import diagram from image"
          />
          <ExportMenu
            onExportPNG={handleExportPNG}
            onExportSVG={handleExportSVG}
            onExportPDF={handleExportPDF}
            onExportDiagramx={handleExportDiagramx}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.drawing"
            onChange={handleFileChange}
            className="hidden"
          />
        </ToolbarGroup>

        <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

        {/* View — Legend / Load transcript / Transcript panel */}
        <ToolbarGroup label="View">
          <IconButton
            onClick={toggleLegend}
            icon={LayoutGrid}
            tooltip="Toggle legend"
            isActive={legendConfig.visible}
          />
          <IconButton
            onClick={onLoadTranscript}
            icon={FileInput}
            tooltip="Load transcript"
          />
          <IconButton
            onClick={onToggleTranscriptPanel}
            icon={PanelRight}
            tooltip="Toggle transcript panel"
            isActive={transcriptPanelOpen}
          />
        </ToolbarGroup>

        <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

        {/* Zoom — Zoom out / % / Zoom in / Fit / Reset (order per spec §5.1) */}
        <ToolbarGroup label="Zoom">
          <IconButton
            onClick={() => setZoom(zoom / 1.2)}
            icon={ZoomOut}
            tooltip="Zoom out"
            shortcut="Ctrl+-"
          />
          <span
            className="text-sm w-14 text-center font-medium tabular-nums"
            style={{ color: theme.sidebar.textSecondary }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            onClick={() => setZoom(zoom * 1.2)}
            icon={ZoomIn}
            tooltip="Zoom in"
            shortcut="Ctrl+="
          />
          <IconButton
            onClick={fitToView}
            icon={Maximize2}
            tooltip="Fit to window"
            shortcut="Ctrl+0"
          />
          <IconButton
            onClick={handleResetView}
            icon={Crosshair}
            tooltip="Reset view (100%, centered)"
          />
        </ToolbarGroup>

        <div className={dividerClass} style={{ backgroundColor: theme.sidebar.border }} />

        {/* Overflow — More menu (Settings / About / Clear) */}
        <MoreMenu
          onOpenSettings={onOpenSettings}
          onOpenAbout={() => setShowAbout(true)}
          onClear={handleClear}
        />
      </div>
    </div>

    {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    <ImageImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
  </>
);
```

Implementation notes for the editor:

- The order inside the Zoom group is now **Zoom out, %, Zoom in, Fit, Reset** — Fit moved before Reset to match spec §5.1.
- `handleClear` keeps its existing early return on empty canvas (it no-ops silently — same as today). The PR does not add a visible disabled state on the Clear menu item; that's deliberate scope discipline. If Jennifer asks for the disabled visual, it's a one-line follow-up.
- The Brand + diagram-name input block is unchanged.
- `AboutModal` and `ImageImportModal` portals are unchanged.

- [ ] **Step 5: Start the dev server and verify the layout in the browser**

```bash
npm run dev
```

Open `http://localhost:5173/` (or whatever port Vite reports). Visually confirm:

1. The toolbar height is unchanged (h-14).
2. Brand "ETD | Untitled Diagram" on the left, controls on the right.
3. Four cluster dividers visible: between History/File, File/View, View/Zoom, Zoom/More.
4. Hover over the History cluster — uppercase "HISTORY" label fades in above it. Move away — fades out. Repeat for File, View, Zoom.
5. Click the Export (Download icon) trigger — popover opens with 4 items, focuses PNG row. Click PNG — file downloads, popover closes.
6. Click Export again, press ArrowDown three times — focus walks PNG → SVG → PDF → DiagramMix. ArrowDown again wraps to PNG. ArrowUp wraps backward. Home/End jump to first/last. Press Escape — popover closes, focus returns to the Export trigger.
7. Click outside the popover when it's open — popover closes.
8. Repeat 5–7 for the MoreMenu (now using `MoreHorizontal` icon at the far right).
9. Confirm the Clear diagram menu item is **disabled** when the canvas is empty and **enabled (danger-styled)** as soon as one element is added.
10. Confirm every existing handler still fires: Save, Open, Import image (modal opens), each Export variant (file downloads or modal as appropriate), Load transcript (file picker opens), Legend toggle, Transcript panel toggle, Zoom in / out, Fit, Reset, Element styles (Settings modal opens), About (About modal opens), Clear (confirm dialog → clears).

- [ ] **Step 6: Run the typechecker**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx
git commit -m "$(cat <<'EOF'
chore(pr2): refactor Toolbar to use ExportMenu, MoreMenu, ToolbarGroup

Replace the 4 inline Export icon buttons with the ExportMenu dropdown.
Replace the Clear/Settings/About cluster with the MoreMenu dropdown.
Wrap each remaining cluster (History, File, View, Zoom) in ToolbarGroup
so the uppercase group labels show on hover/focus-within. Reorder the
Zoom cluster so Fit-to-window precedes Reset view per spec §5.1.
Trim now-unused lucide-react imports. All existing handlers preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Audit grep + lint + typecheck

**Files:** (none modified)

Confirm PR 2 didn't introduce any forbidden patterns and that the static checks still pass.

- [ ] **Step 1: Run the verification grep on the new files**

```bash
grep -rEn '#[0-9a-fA-F]{3,8}|rgba\(|theme\.colors\.(void|error|success|accent\.glow|highlight|secondary)|\bbg-(gray|blue|red|zinc|slate|black|white)\b|\btext-(gray|blue|red|zinc|slate|black|white)\b|\bborder-(gray|blue|red|zinc|slate|black|white)\b|bg-\[#|text-\[#|hover:bg-\[|hover:bg-(black|white|gray|blue|red)|focus-visible:ring-|\bring-[0-9]|\bdivide-|\bz-[0-9]+\b' \
  src/components/Toolbar/ \
  src/index.css
```

Expected: **zero output**.

If any hit appears in the new Toolbar files (`IconButton.tsx`, `useMenu.ts`, `MenuItem.tsx`, `ExportMenu.tsx`, `MoreMenu.tsx`, `ToolbarGroup.tsx`) or in the `Toolbar.tsx` refactor diff, fix by replacing with the relevant `theme.*` token. `src/index.css` should produce no hits — the new `.toolbar-group-label` block reads from `var(--text-secondary)` and `var(--transition-fast)`.

- [ ] **Step 2: Run the lint**

```bash
npm run lint
```

Expected: no errors. Address any new warnings introduced by Task 8 (most likely an unused-import on the lucide-react names that the trim missed).

- [ ] **Step 3: Run the typechecker one more time**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the existing test suite**

```bash
npm run test
```

Expected: every existing test passes. No new tests are introduced in this PR (the codebase has no React component test setup — verification is browser-based per the spec).

---

## Task 10: Browser smoke test the full toolbar workflow

**Files:** (none modified)

Per the spec's PR 2 verify section, manually confirm every handler still wired and every dropdown behavior correct.

- [ ] **Step 1: Make sure the dev server is running**

If not already running from Task 8:

```bash
npm run dev
```

- [ ] **Step 2: Use Claude for Chrome to walk the toolbar**

Open `http://localhost:5173/` and walk through, capturing a GIF for the dropdown interactions (per the project's claude-in-chrome guidance):

1. **History group** — Add an element. Press Cmd+Z, confirm it disappears. Press Cmd+Shift+Z, confirm it returns. Click Undo / Redo IconButtons — same result.
2. **File group — Save** — Click Save (or Cmd+S). A `*.json` file downloads.
3. **File group — Open** — Click Open (or Cmd+O). Pick a `test_diagram.json` (or `~/Documents/GitHub/etd/test_diagram.json` if it exists in the repo) — the diagram renders.
4. **File group — Import image** — Click the Import-image button (ImagePlus icon). The `ImageImportModal` opens. Close it.
5. **File group — Export ▾ — PNG** — Click the Download-icon trigger. Popover opens with PNG focused. Click Export as PNG. File downloads.
6. **Export ▾ — SVG** — Re-open the Export dropdown. ArrowDown once. Press Enter. File downloads. (Or click "Export as SVG" with the mouse.)
7. **Export ▾ — PDF** — Re-open. ArrowDown twice. Enter. File downloads.
8. **Export ▾ — DiagramMix** — Re-open. ArrowDown thrice (or `End`). Enter. File downloads.
9. **Export ▾ keyboard wraparound** — Open. ArrowDown four times — focus wraps back to PNG. ArrowUp from PNG wraps to DiagramMix. `Home` jumps to PNG; `End` jumps to DiagramMix.
10. **Export ▾ Escape + outside-click** — Open. Press Escape — popover closes, focus returns to the trigger. Open again. Click anywhere on the canvas — popover closes.
11. **View group — Legend** — Click Toggle legend. Legend overlay appears / disappears.
12. **View group — Load transcript** — Click. File picker opens. Cancel.
13. **View group — Transcript panel toggle** — Click. Panel opens / closes. Active state visible when open.
14. **Zoom group** — Zoom out, zoom in, fit to window, reset view all behave as before. The `100%` indicator updates.
15. **More menu — Element styles** — Click ··· trigger. Popover opens, focus on Element styles. Click — Settings modal opens. Close it.
16. **More menu — About & shortcuts** — Re-open ···. ArrowDown once. Enter. About modal opens. Close it.
17. **More menu — Clear diagram (empty)** — With nothing on the canvas, re-open ···. Click Clear diagram. It silently no-ops (handleClear's existing early return). No confirm dialog appears. This is unchanged from current behavior.
18. **More menu — Clear diagram (filled)** — Drag an element onto the canvas, re-open ···. Click Clear diagram. The browser `confirm()` dialog appears (still native; PR 4 replaces). Confirm → diagram clears.
19. **More menu — keyboard nav** — Open ···. ArrowDown / ArrowUp cycle between Element styles, About, Clear (skipping the separator visually but the active index advances through 3 items). Escape closes, focus returns to trigger.
20. **Group labels** — Hover over each cluster. Confirm "HISTORY" / "FILE" / "VIEW" / "ZOOM" labels fade in above each one. Tab through the toolbar with the keyboard — the `:focus-within` rule should also reveal the label of the cluster containing the focused button.
21. **Tab order** — Click somewhere outside the toolbar, then press Tab repeatedly. Focus should walk: brand input → Undo → Redo → Save → Open → Import → Export trigger → Legend → Load transcript → Transcript panel → Zoom out → Zoom in → Fit → Reset → More trigger. (The `100%` span is a non-focusable display, so it's skipped.) Focus rings (2px dark sage outline + 2px offset) visible on each.
22. **Full-screen mode** — Press F to enter full-screen. Hover the top edge — the toolbar slides in with the new group labels visible. Open Export and More dropdowns from full-screen — they still appear above the toolbar. Press F to exit.

- [ ] **Step 3: Note any regressions**

If anything is broken or behaves differently from before, identify which task introduced the regression. Bisect by reverting the relevant commit and re-checking. Common likely culprits:

- An export handler closure ran twice because the menu didn't close fast enough. Fix: ensure `runExport` calls `close()` before invoking the handler.
- The `100%` span got swallowed by a wrong-group placement. Fix: confirm it's still inside the Zoom `ToolbarGroup`.
- Tooltip text changed accidentally. Fix: re-check each `IconButton`'s `tooltip` prop matches the original — Toolbar.tsx had "Toggle Legend" (capital L); spec §5.1 calls it "Legend toggle". Pick one and keep it consistent. Default: keep the original wording from the pre-PR-2 code.

---

## Task 11: Commit (if anything left unstaged) + push the branch

**Files:** (none modified)

Wrap up the branch and push for PR creation.

- [ ] **Step 1: Confirm everything's committed**

```bash
git status
```

Expected: `working tree clean` on `feat/ui-rehaul-pr2-toolbar`.

- [ ] **Step 2: Review the cumulative diff against main**

```bash
git diff main...feat/ui-rehaul-pr2-toolbar --stat
```

Expected files in the diff:

- `src/components/Toolbar/IconButton.tsx` (created, ~70 lines)
- `src/components/Toolbar/useMenu.ts` (created, ~55 lines)
- `src/components/Toolbar/MenuItem.tsx` (created, ~60 lines)
- `src/components/Toolbar/ExportMenu.tsx` (created, ~130 lines)
- `src/components/Toolbar/MoreMenu.tsx` (created, ~110 lines)
- `src/components/Toolbar/ToolbarGroup.tsx` (created, ~15 lines)
- `src/components/Toolbar/Toolbar.tsx` (modified, net reduction in inline JSX)
- `src/index.css` (modified, ~20 lines appended)

No file outside `src/components/Toolbar/` and `src/index.css` should appear in the diff. If something else is staged, investigate.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/ui-rehaul-pr2-toolbar
```

Expected: branch pushed, tracking set.

- [ ] **Step 4: Verify on GitHub (or via `gh`)**

```bash
gh pr view --web 2>/dev/null || gh pr create --draft \
  --title "UI rehaul · PR 2 — Toolbar restructure" \
  --body "$(cat <<'EOF'
## Summary
- Split the monolithic Toolbar into Toolbar + ExportMenu + MoreMenu + MenuItem + ToolbarGroup + useMenu hook + lifted-out IconButton.
- 14 visible affordances grouped into 4 clusters (History, File, View, Zoom) plus Export ▾ dropdown (4 variants) and ··· More menu (3 items).
- Keyboard nav on dropdowns: arrow keys, Home/End, Enter, Escape, outside-click, focus-out.
- Hover/focus-within reveals uppercase cluster labels per spec §5.1.
- Every existing handler preserved verbatim. Canvas + element rendering untouched.

## Test plan
- [ ] Save / Open / Import-image still work.
- [ ] Each of 4 Export variants downloads correctly.
- [ ] Load transcript, Legend toggle, Transcript panel toggle, Zoom out / in, Fit, Reset still work.
- [ ] Element styles, About & shortcuts, Clear diagram still work from MoreMenu.
- [ ] Clear is disabled when canvas is empty, enabled when not.
- [ ] Both dropdowns: arrow keys cycle items, Home/End jump, Enter activates, Escape closes, outside-click closes, focus-out closes.
- [ ] Cluster labels reveal on hover and focus-within.
- [ ] Tab order through the toolbar is intuitive.
- [ ] Full-screen mode (F) still works; dropdowns appear above the sliding toolbar.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

The user may prefer to open the PR manually; either way, after the push the branch is ready.

---

## Task 12: Build + deploy to jenkleiman.com

**Files:** (none modified in this repo; updates the sibling repo)

Per the dual-repo dance documented in `CLAUDE.md`. This step is **only** run after the branch is merged into `main` — do not deploy from the feature branch.

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
git commit -m "Update ETD tool: PR 2 UI rehaul — toolbar restructure (Export ▾ + ··· More + cluster labels)"
git push
```

Netlify deploys automatically.

- [ ] **Step 5: Smoke-test the live site**

After Netlify reports deploy success, open `https://jenkleiman.com/tools/etd/` and walk through the same dropdown / cluster-label checks from Task 10 Steps 5–20. The behavior on the live site should match the dev server exactly.

---

## Verification summary

This plan delivers everything called out in spec §11 "PR 2 — Toolbar" verify:

| Spec verify item | Where confirmed |
|---|---|
| Every existing toolbar handler still wired | Task 8 Step 5 + Task 10 |
| Manual test of Save, Open, Import-image | Task 10 Steps 2–4 |
| Each Export variant | Task 10 Steps 5–8 |
| Load transcript | Task 10 Step 12 |
| Clear | Task 10 Step 18 |
| Reset view | Task 10 Step 14 |
| Settings | Task 10 Step 15 |
| About | Task 10 Step 16 |
| Tab order through visible affordances intuitive | Task 10 Step 21 |
| Dropdowns close on Escape and outside-click | Task 10 Step 10 (Export) + Step 19 (More) |

And the cross-cutting safeguards from spec §12:

| Safeguard | How |
|---|---|
| Locked-file list — Canvas + colors.ts untouched | Task 11 Step 2 diff stat is bounded to `src/components/Toolbar/` + `src/index.css` |
| Visual regression — canvas pixel-identical | Confirmed by file scope; no Canvas/** or colors.ts changes |
| Token-driven boundary — chrome reads only from theme.ts | Task 9 Step 1 audit grep |
| Accessibility — AA contrast | All new colors come from theme tokens that PR 1 already AA-certified |
| Behavior preservation — every workflow still passes | Task 10 |
