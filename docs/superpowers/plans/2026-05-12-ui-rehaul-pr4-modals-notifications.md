# UI rehaul · PR 4 — Modals + notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the chrome's overlay system — extract a shared `Modal` frame, build a toast notification component + store, replace every `alert()` site with a toast, refit every existing modal (Settings, About, Image Import, Image Lightbox, Image Crop, Recovery) to use the shared frame, and restyle the two surviving `confirm()` dialogs (Clear diagram, transcript-orphan) as Sage Garden confirmation modals via a small imperative confirm store.

**Architecture:** Three new building blocks land first (`Toast` + `useToasts` + `<Toaster>` for notifications, `Modal` for the shared overlay frame, `useConfirm` + `<ConfirmHost>` for the imperative confirmation dialog). Six existing modals then migrate to wrap their content in `Modal` — their behavior (image-import state machine, settings working-copy, crop math, lightbox dark-scrim variant, recovery focus order) is preserved verbatim. All 16 `alert()` call sites are replaced with `addToast()`; both surviving top-level `confirm()` call sites are replaced with `await confirmAsync(...)`. Focus management (trap, initial focus, return-on-close, Esc, scrim) lives once inside `Modal`; every consumer inherits it for free.

**Tech Stack:** React 18 + TypeScript + Vite, Zustand (`useToasts`, `useConfirm`), Tailwind CSS (layout / typography / cursor only — color utilities forbidden per PR 1 rule), lucide-react icons (`AlertCircle`, `AlertTriangle`, `Info`, `X`, `Copy`, `Trash2`, `RotateCcw`). No new runtime dependencies — focus trap is implemented inline (~50 LOC) inside `Modal.tsx`.

**Spec:** `docs/superpowers/specs/2026-05-12-ui-rehaul-design.md` (v4) §7 + §9 + §11 "PR 4 — Modals + notifications". This plan implements PR 4 only.

**Sealed (do not touch in this PR):**
- `src/components/Canvas/**` — all Konva rendering.
- `src/utils/colors.ts` — element / contributor / support semantic colors.
- `src/utils/theme.ts` — every token PR 4 needs is already present from PR 1 (`scrim`, `shadow.*`, `z.modal`, `z.modalScrim`, `z.toast`, `z.lightbox`, `danger.*`, `button.*`, `sidebar.*`, `focus.ring`). No new tokens required.
- `src/components/Palette/**`, `src/components/Properties/**`, `src/components/TranscriptPanel/**`, `src/components/Toolbar/**` (except for the two non-visual edits in `Toolbar.tsx` and `TranscriptPanel.tsx` that swap `alert()` / `confirm()` for the new helpers; no styling touched).
- `src/components/Settings/SettingsSidebar.tsx`, `TypeStyleEditor.tsx`, `SubtypeListEditor.tsx`, `StylePreview.tsx` — the inner sidebar / form / preview only re-renders inside the new frame; the three nested `window.confirm()` calls inside `SubtypeListEditor` + `SettingsModal` stay as native `confirm()` for this PR (the spec only enumerates the two top-level confirms).
- All store actions and reducer logic.

---

## File map

**Create (6 new files):**
- `src/store/toastStore.ts` — Zustand store. Shape per spec §9.3. Variants `info` / `warning` / `error`. `info` auto-dismisses at 5000ms; `warning` + `error` persist. Hard cap of 4 persistent toasts — FIFO eviction.
- `src/store/confirmStore.ts` — Zustand store with one pending request slot + a stashed promise resolver. Exports `useConfirmStore` (hook) + `confirmAsync()` (imperative helper that calls `useConfirmStore.getState().confirm(...)`).
- `src/components/ui/Modal.tsx` — Shared frame. Props: `open`, `onClose`, `title`, `subtitle?`, `size?` (`'sm' | 'md' | 'lg' | 'xl'`), `initialFocus?` (`'primary' | 'cancel' | 'close'`), `footer?` (slot), `scrim?` (`'sage' | 'dark'` — `'dark'` is for the lightbox variant), `closeOnScrim?` (default true), `children`. Implements: focus trap, initial focus, return-focus chain, Esc-to-close (with destructive-Cancel semantics when `initialFocus === 'cancel'`), ARIA `role="dialog"` + `aria-modal="true"` + `aria-labelledby`.
- `src/components/ui/Toast.tsx` — Single-toast presentational component. Props: `toast: Toast` (from the store), `onDismiss: () => void`. Reads variant → left-border color (`sage`, `clay`/`warning`, `danger`).
- `src/components/ui/Toaster.tsx` — Portal mount. Subscribes to `useToastStore`, renders a fixed bottom-right stack with the 8px gap + 24px viewport offset per spec §9.1, hands each toast its `dismiss` callback. Mounts once at App root.
- `src/components/ui/ConfirmHost.tsx` — Portal mount. Subscribes to `useConfirmStore`. Renders the shared `Modal` with the pending request's title, message, and the two buttons (Cancel left, Confirm right). Initial focus = Cancel. Esc / scrim-click = Cancel. Mounts once at App root.

**Modify (10 files):**
- `src/App.tsx` — (a) Mount `<Toaster />` + `<ConfirmHost />` once near the existing `<RecoveryPrompt>` / `<ImageLightbox>` mount points. (b) Replace the two `alert()` calls (lines 208, 216) with `useToastStore.getState().addToast('error', ...)`. (c) Replace the `confirm()` call (line 194) with `await confirmAsync(...)` per Task 14.
- `src/components/Toolbar/Toolbar.tsx` — Replace all 8 `alert()` calls (lines 119, 122, 128, 139, 162, 172, 179, 183, 197 → spec §9.2 maps each to a variant; note lines 162 + 172 both become **info** toasts, line 179 becomes a **warning**, the rest are **error**). Replace the `confirm()` call (line 204) with `await confirmAsync(...)`.
- `src/components/TranscriptPanel/TranscriptPanel.tsx` — Replace the two `alert()` calls (lines 85, 92) and the `confirm()` call (line 71). **No dedupe** of the duplicated transcript-load logic with `App.tsx` — that's deferred. Per-call-site toast-and-confirm replacement only.
- `src/components/Properties/ImageUpload.tsx` — Replace 2 `alert()` calls (lines 34, 40) → `error` toasts.
- `src/hooks/useImagePaste.ts` — Replace 1 `alert()` call (line 25) → `error` toast.
- `src/components/Toolbar/AboutModal.tsx` — Refit to wrap content in `<Modal>`. Header + footer + body sections collapse into Modal's slots. Keep features list, shortcuts table, version copy. Initial focus = primary "Close" button.
- `src/components/Toolbar/ImageImportModal.tsx` — Refit the outer scrim + frame to `<Modal>`. The inner state machine (disclosure / picker / loading / error) stays — only the four "Cancel" / "Continue" / "Try again" footer-button blocks move into `Modal`'s footer slot via `footer={...}` per state. Error variant's body is rewritten to read from `errorMessage(state.result)` as today. Title changes per state via Modal's `title` prop. Initial focus depends on state: `'primary'` for disclosure/picker/error, `'cancel'` for loading.
- `src/components/Settings/SettingsModal.tsx` — Refit `SettingsModalInner` to wrap its content in `<Modal>`. Header collapses to Modal's `title`. Body becomes Modal's children (sidebar + scrolling pane). Footer (Reset all type styles · Cancel · Apply) becomes Modal's `footer` slot. The `useEffect` Esc handler at lines 37–43 is removed — `Modal` handles it. Initial focus = `'primary'` (Apply).
- `src/components/ImageEditor/ImageLightbox.tsx` — Refit to `<Modal scrim="dark" closeOnScrim>`. The dark-scrim variant of Modal renders `rgba(0,0,0,0.9)` instead of the sage scrim, no `chrome-bg` frame around the image, no header/footer divider lines — just the image + a top overlay bar (filename / Esc hint) + a close button. Remove the local `useEffect` Esc handler at lines 22–25.
- `src/components/ImageEditor/ImageCropModal.tsx` — Refit outer scrim + frame to `<Modal>`. Header buttons (lock / reset / close) stay — but they live in the header slot's right-aligned tools area, with `Modal` rendering only the title text. Footer (Cancel · Apply Crop) becomes Modal's `footer`. The crop canvas + handle math (lines 60–280) is untouched. Remove the local Esc handler at line 280 — Modal owns it. Initial focus = `'primary'` (Apply Crop).
- `src/components/RecoveryPrompt.tsx` — Refit to `<Modal>`. The whole frame collapses to Modal slots. Initial focus = `'primary'` (Recover) per spec §7.2 ("Initial focus on Restore — Recover is the more likely intended action and the safer accidental-Enter outcome"). Footer has Discard (secondary outlined) left and Recover (primary filled) right.

**Forbidden patterns (audit grep gate at Task 17):**
- After this PR: `grep -rEn '\balert\(' src/` must return **zero** hits.
- After this PR: the only `confirm()` / `window.confirm()` hits permitted are the three nested settings confirms (`SettingsModal.tsx:51`, `SubtypeListEditor.tsx:36`, `SubtypeListEditor.tsx:52`). All other call sites must be gone.
- Tailwind color utilities (`bg-*`, `text-*-N00`, `border-*-N00`, `ring-*`, arbitrary `bg-[#...]`) — forbidden in every new + modified file. Use `theme.*` tokens via inline `style={{...}}`.
- Hardcoded hex / `rgba()` — forbidden everywhere except `ImageLightbox.tsx`'s dark scrim variant inside `Modal`, where `rgba(0, 0, 0, 0.9)` is the deliberate non-sage choice per spec §7.2 ("Image Lightbox: Centered image, `shadow-lg`, scrim covers full viewport. Existing controls."). This single exception lives inside `Modal.tsx`'s `scrim === 'dark'` branch — nowhere else.
- Raw numeric `z-index` — use `theme.z.*`.

---

## Task 1: Create a feature branch

**Files:** (none modified yet)

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `On branch main`, working tree clean (or only the four untracked `IMG_3*.HEIC` / `IMG_3*.json` files from prior debugging — those stay untracked).

- [ ] **Step 2: Create + switch to the PR 4 branch**

```bash
git checkout -b feat/ui-rehaul-pr4-modals-notifications
```

Expected: `Switched to a new branch 'feat/ui-rehaul-pr4-modals-notifications'`.

- [ ] **Step 3: Confirm the branch**

```bash
git branch --show-current
```

Expected: `feat/ui-rehaul-pr4-modals-notifications`.

- [ ] **Step 4: Commit this plan**

```bash
git add docs/superpowers/plans/2026-05-12-ui-rehaul-pr4-modals-notifications.md
git commit -m "docs(plans): UI rehaul PR 4 — Modals + notifications"
```

Expected: clean commit, one file changed.

---

## Task 2: Add the `useToasts` Zustand store

**Files:**
- Create: `src/store/toastStore.ts`

Follows the same Zustand pattern as `src/store/lightboxStore.ts` (verified at file read), but the state shape is a list rather than a singleton.

- [ ] **Step 1: Write the store**

Create `src/store/toastStore.ts`:

```ts
import { create } from 'zustand';

export type ToastVariant = 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  /** Returns the new toast's id (for tests or explicit dismiss). */
  addToast: (variant: ToastVariant, message: string) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

const INFO_AUTODISMISS_MS = 5000;
const MAX_PERSISTENT = 4;

function makeId(): string {
  // crypto.randomUUID() is available in evergreen browsers + Vite dev. Fall
  // back to a Math.random id for the (unlikely) older environment to keep
  // unit tests deterministic-enough.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `t_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (variant, message) => {
    const id = makeId();
    const next: Toast = { id, variant, message, createdAt: Date.now() };

    set((state) => {
      let toasts = [...state.toasts, next];

      // Persistent cap: warning + error count toward the limit; info doesn't
      // (it auto-dismisses after 5s, so it can't pile up).
      const persistent = toasts.filter((t) => t.variant !== 'info');
      if (persistent.length > MAX_PERSISTENT) {
        // FIFO evict the oldest persistent toast.
        const oldestPersistentId = persistent[0].id;
        toasts = toasts.filter((t) => t.id !== oldestPersistentId);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            `[toastStore] evicted oldest persistent toast (${oldestPersistentId}) to keep at ${MAX_PERSISTENT}`,
          );
        }
      }

      return { toasts };
    });

    if (variant === 'info') {
      setTimeout(() => {
        // Re-check existence in case it was already manually dismissed.
        if (get().toasts.some((t) => t.id === id)) {
          get().dismissToast(id);
        }
      }, INFO_AUTODISMISS_MS);
    }

    return id;
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clearAll: () => set({ toasts: [] }),
}));
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/store/toastStore.ts
git commit -m "feat(pr4): add useToasts Zustand store — info/warning/error variants, FIFO cap at 4 persistent"
```

---

## Task 3: Add the `Toast` presentational component

**Files:**
- Create: `src/components/ui/Toast.tsx`

Single-toast UI per spec §9.1: 320–520px wide, `chrome-bg` background, `border-strong` outline, 3px left border in variant color, `shadow-md`, close `×` top-right, "Copy" button for error toasts.

- [ ] **Step 1: Write the component**

Create `src/components/ui/Toast.tsx`:

```tsx
import { AlertCircle, AlertTriangle, Copy, Info, X } from 'lucide-react';
import { theme } from '../../utils/theme';
import type { Toast as ToastModel } from '../../store/toastStore';

interface ToastProps {
  toast: ToastModel;
  onDismiss: () => void;
}

const VARIANT_BORDER: Record<ToastModel['variant'], string> = {
  info:    theme.sidebar.accent,  // sage
  warning: theme.colors.warning,  // clay
  error:   theme.colors.error,    // danger
};

const VARIANT_ICON: Record<ToastModel['variant'], typeof Info> = {
  info:    Info,
  warning: AlertTriangle,
  error:   AlertCircle,
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = VARIANT_ICON[toast.variant];
  const borderColor = VARIANT_BORDER[toast.variant];

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(toast.message).catch(() => {
        /* clipboard denied — silent; user can still read the message */
      });
    }
  };

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      className="flex items-start gap-3 rounded-lg overflow-hidden"
      style={{
        minWidth: 320,
        maxWidth: 520,
        backgroundColor: theme.toolbar.bg,
        border: `1px solid ${theme.sidebar.border}`,
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: theme.shadow.md,
        padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
      }}
    >
      <Icon
        size={18}
        style={{ color: borderColor, flexShrink: 0, marginTop: 2 }}
        aria-hidden
      />
      <p
        className="text-sm leading-snug flex-1"
        style={{ color: theme.sidebar.text }}
      >
        {toast.message}
      </p>
      {toast.variant === 'error' && (
        <button
          onClick={handleCopy}
          aria-label="Copy error message"
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: theme.sidebar.textSecondary }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Copy"
        >
          <Copy size={14} />
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="p-1 rounded transition-colors flex-shrink-0"
        style={{ color: theme.sidebar.textSecondary }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Toast.tsx
git commit -m "feat(pr4): add Toast component — variant left border, icon, Copy on errors, close ×"
```

---

## Task 4: Add the `<Toaster>` portal + mount in App.tsx

**Files:**
- Create: `src/components/ui/Toaster.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the Toaster**

Create `src/components/ui/Toaster.tsx`:

```tsx
import { useToastStore } from '../../store/toastStore';
import { theme } from '../../utils/theme';
import { Toast } from './Toast';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed flex flex-col-reverse gap-2 pointer-events-none"
      style={{
        right: 24,
        bottom: 24,
        zIndex: theme.z.toast,
      }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={() => dismissToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}
```

Note: `flex-col-reverse` is intentional — newest toast appears at the bottom of the visual stack (next to the 24px edge), with older toasts above it. The 8px gap (`gap-2` = 0.5rem = 8px) matches the spec.

- [ ] **Step 2: Mount in `App.tsx`**

Read `src/App.tsx` around the existing portal mounts (look for `<RecoveryPrompt`, `<ImageLightbox`, `<ImageImportModal`, `<SettingsModal`). Add the import at the top of the file:

```tsx
import { Toaster } from './components/ui/Toaster';
```

And add `<Toaster />` once at the end of the JSX, alongside the other root-mounted overlays (it can sit right next to `<ImageLightbox>` or near the bottom of the returned tree).

- [ ] **Step 3: Type-check + dev server smoke**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Toaster.tsx src/App.tsx
git commit -m "feat(pr4): mount <Toaster> portal at App root — bottom-right stack with 8px gap"
```

---

## Task 5: Replace `alert()` calls in `Toolbar.tsx`

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`

The 8 alerts in Toolbar map to toasts per spec §9.2:

| Line | Today | After |
|---|---|---|
| 119 | `alert('Invalid diagram file format')` | `addToast('error', 'Invalid diagram file format')` |
| 122 | `alert('Failed to parse diagram file')` | `addToast('error', 'Failed to parse diagram file')` |
| 128 | `alert(err instanceof Error ? err.message : 'Failed to load file')` | `addToast('error', err instanceof Error ? err.message : 'Failed to load file')` |
| 139 | `alert('No canvas found to export')` | `addToast('error', 'No canvas found to export')` |
| 162 | `alert('No elements to export')` (SVG) | `addToast('info', 'No elements to export yet.')` |
| 172 | `alert('No elements to export')` (DiagramMix) | `addToast('info', 'No elements to export yet.')` |
| 179 | `alert('Embedded images were dropped — DiagramMix does not support inline images.')` | `addToast('warning', 'Embedded images were dropped — DiagramMix does not support inline images.')` |
| 183 | `alert('Failed to export .diagramx')` | `addToast('error', 'Failed to export .diagramx')` |
| 197 | `alert('Failed to export PDF')` | `addToast('error', 'Failed to export PDF')` |

- [ ] **Step 1: Add the store import + selector**

At the top of `Toolbar.tsx`, add:

```tsx
import { useToastStore } from '../../store/toastStore';
```

Inside `Toolbar()`, near the other Zustand selectors (look for `useDiagramStore`), add:

```tsx
const addToast = useToastStore((s) => s.addToast);
```

- [ ] **Step 2: Replace each `alert(...)` call**

Use the Edit tool nine times — once per `alert(...)` line. Each replacement uses `addToast(<variant>, <message>)` per the table above. No semantic changes — same control flow (early returns, try/catch boundaries) preserved.

- [ ] **Step 3: Verify no `alert(` remains in Toolbar.tsx**

```bash
grep -n '\balert\(' src/components/Toolbar/Toolbar.tsx
```

Expected: no output.

- [ ] **Step 4: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx
git commit -m "feat(pr4): replace 9 alert() calls in Toolbar.tsx with toast variants per spec §9.2"
```

---

## Task 6: Replace `alert()` calls in `App.tsx`, `TranscriptPanel.tsx`, `ImageUpload.tsx`, `useImagePaste.ts`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx`
- Modify: `src/components/Properties/ImageUpload.tsx`
- Modify: `src/hooks/useImagePaste.ts`

All five remaining `alert()` sites become `error` toasts. The store can be accessed two ways: (1) as a hook (`const addToast = useToastStore((s) => s.addToast)`) inside components; (2) imperatively (`useToastStore.getState().addToast(...)`) from a hook or non-component context. Both are stable.

| File:line | Replacement |
|---|---|
| `App.tsx:208` | `useToastStore.getState().addToast('error', \`No valid transcript lines found in ${file.name}.\`)` |
| `App.tsx:216` | `useToastStore.getState().addToast('error', 'Failed to read transcript file.')` |
| `TranscriptPanel.tsx:85` | hook selector + `addToast('error', \`No valid transcript lines found in ${file.name}.\`)` |
| `TranscriptPanel.tsx:92` | hook selector + `addToast('error', 'Failed to read transcript file.')` |
| `ImageUpload.tsx:34` | hook selector + `addToast('error', 'Please select an image file')` |
| `ImageUpload.tsx:40` | hook selector + `addToast('error', 'Image must be less than 5MB')` |
| `useImagePaste.ts:25` | `useToastStore.getState().addToast('error', 'Image must be less than 5MB')` |

`App.tsx`'s transcript handler is already in a `useCallback`; using `useToastStore.getState().addToast(...)` avoids invalidating the callback every render. `useImagePaste.ts` is a hook with its own deps — same pattern.

- [ ] **Step 1: Update each file**

For each file: add the appropriate import + selector or `.getState()` access, replace the `alert(...)` call, leave control flow untouched.

- [ ] **Step 2: Verify zero `alert(` hits across `src/`**

```bash
grep -rEn '\balert\(' src/
```

Expected: **no output** (the spec's PR 4 verification gate).

- [ ] **Step 3: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/TranscriptPanel/TranscriptPanel.tsx src/components/Properties/ImageUpload.tsx src/hooks/useImagePaste.ts
git commit -m "feat(pr4): replace remaining 7 alert() calls in App/TranscriptPanel/ImageUpload/useImagePaste with error toasts"
```

After this commit, the spec's `grep -rEn '\balert\(' src/` verification is **green**. The two `confirm()` replacements come later (Tasks 13–14).

---

## Task 7: Add the shared `Modal` component

**Files:**
- Create: `src/components/ui/Modal.tsx`

This is the largest single file in PR 4 (~180 LOC). It owns: scrim, frame, header (title + close ×), body, footer slot, focus trap, initial focus, return-focus chain, Esc handler, ARIA.

Spec §7 + §7.1 + §7.1.1 are the source of truth. Reads from `theme.scrim`, `theme.shadow.xl`, `theme.z.modalScrim`, `theme.z.modal`, `theme.z.lightbox`, `theme.sidebar.bg`, `theme.toolbar.bg`, `theme.sidebar.border`, `theme.sidebar.text`, `theme.sidebar.textSecondary`, `theme.sidebar.hover`, `theme.radius.xl`.

The dark-scrim variant uses `rgba(0, 0, 0, 0.9)` per spec §7.2 ("Image Lightbox: Centered image, `shadow-lg`, scrim covers full viewport") — this is the single allowed hardcoded `rgba()` in PR 4 and only lives inside this component.

- [ ] **Step 1: Write the Modal component**

Create `src/components/ui/Modal.tsx`:

```tsx
import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import { X } from 'lucide-react';
import { theme } from '../../utils/theme';

type Size = 'sm' | 'md' | 'lg' | 'xl';
type ScrimVariant = 'sage' | 'dark';
type InitialFocus = 'primary' | 'cancel' | 'close';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Right-aligned header tools (e.g., crop modal's lock/reset buttons). */
  headerExtras?: ReactNode;
  /** Slot for footer content. Buttons should be right-aligned by the caller. */
  footer?: ReactNode;
  size?: Size;
  scrim?: ScrimVariant;
  /** Default true. The lightbox + image-import close-on-scrim; settings prompts before close. */
  closeOnScrim?: boolean;
  /**
   * Which element to focus when the modal opens. Maps to a `data-modal-focus` attribute
   * on a descendant of `children` / `footer`. `'primary'` is the default; the consumer
   * marks the primary button with `data-modal-focus="primary"`.
   *
   * Cancel-focus is required by spec §7.1.1 for destructive confirmations.
   * Close-focus is used when there is no primary action (about modal).
   */
  initialFocus?: InitialFocus;
  /** Hide the header chrome entirely (used by the lightbox dark variant). */
  hideHeader?: boolean;
  /** Hide the rendered close × in the header. */
  hideCloseButton?: boolean;
  children?: ReactNode;
}

const SIZE_MAX_WIDTH: Record<Size, string> = {
  sm: '420px',
  md: '560px',
  lg: '720px',
  xl: '960px',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  headerExtras,
  footer,
  size = 'md',
  scrim = 'sage',
  closeOnScrim = true,
  initialFocus = 'primary',
  hideHeader = false,
  hideCloseButton = false,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

  // Return-focus chain per spec §7.1.
  const restoreFocus = useCallback(() => {
    const prev = previousFocusRef.current;
    if (prev && document.body.contains(prev) && typeof prev.focus === 'function') {
      prev.focus();
      return;
    }
    // No prior trigger (e.g., Recovery modal opens on app load). Fall through
    // to document.body — log in dev so unintended fallbacks are visible.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Modal] return-focus fell through to document.body — no triggering element');
    }
  }, []);

  // Capture the previously-focused element when the modal opens, restore on close.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    return () => {
      restoreFocus();
    };
  }, [open, restoreFocus]);

  // Initial focus.
  useEffect(() => {
    if (!open) return;
    // Wait one tick so descendants have rendered.
    const id = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      const focusTarget =
        root.querySelector<HTMLElement>(`[data-modal-focus="${initialFocus}"]`) ??
        root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      focusTarget?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, initialFocus]);

  // Esc closes. Cancel-focused modals treat Esc as Cancel; here both call `onClose`.
  // Confirmation modals that need destructive-vs-cancel semantics expose Cancel
  // as their `onClose` and place Confirm as a button — so Esc = Cancel is automatic.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus trap — Tab / Shift+Tab cycle within the dialog.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  const scrimColor = useMemo(
    () => (scrim === 'dark' ? 'rgba(0, 0, 0, 0.9)' : theme.scrim),
    [scrim],
  );

  if (!open) return null;

  const isDark = scrim === 'dark';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: scrimColor, zIndex: isDark ? theme.z.lightbox : theme.z.modalScrim }}
      onClick={(e) => {
        if (closeOnScrim && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        onKeyDown={handleKeyDown}
        className="flex flex-col overflow-hidden mx-4"
        style={{
          backgroundColor: isDark ? 'transparent' : theme.sidebar.bg,
          width: '100%',
          maxWidth: SIZE_MAX_WIDTH[size],
          maxHeight: '90vh',
          borderRadius: isDark ? 0 : theme.radius.xl,
          border: isDark ? 'none' : `1px solid ${theme.sidebar.border}`,
          boxShadow: isDark ? theme.shadow.lg : theme.shadow.xl,
          zIndex: isDark ? theme.z.lightbox : theme.z.modal,
        }}
      >
        {!hideHeader && (
          <div
            className="px-5 py-4 flex items-center justify-between"
            style={{
              backgroundColor: theme.toolbar.bg,
              borderBottom: `1px solid ${theme.sidebar.border}`,
            }}
          >
            <div className="min-w-0">
              {title && (
                <h2
                  id={labelId}
                  className="text-base font-semibold truncate"
                  style={{ color: theme.sidebar.text }}
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs mt-0.5" style={{ color: theme.sidebar.textSecondary }}>
                  {subtitle}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {headerExtras}
              {!hideCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1.5 rounded transition-colors"
                  style={{ color: theme.sidebar.textSecondary }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  data-modal-focus={initialFocus === 'close' ? 'close' : undefined}
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        <div
          className="flex-1 overflow-auto"
          style={{
            backgroundColor: isDark ? 'transparent' : theme.sidebar.bg,
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            className="px-5 py-3 flex items-center justify-end gap-2 flex-shrink-0"
            style={{
              backgroundColor: theme.toolbar.bg,
              borderTop: `1px solid ${theme.sidebar.border}`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Modal.tsx
git commit -m "feat(pr4): add shared Modal component — focus trap, return-focus chain, Esc/scrim close, ARIA dialog"
```

---

## Task 8: Refit `AboutModal.tsx` to use `Modal`

**Files:**
- Modify: `src/components/Toolbar/AboutModal.tsx`

The About modal currently has its own scrim + frame + header + body + footer. Collapse all five into `<Modal>` slots. Keep the version copy, credits, features list, and shortcuts table verbatim.

- [ ] **Step 1: Rewrite `AboutModal.tsx`**

Replace the entire body of `AboutModal()` with:

```tsx
import { Keyboard, Sparkles } from 'lucide-react';
import { theme } from '../../utils/theme';
import { Modal } from '../ui/Modal';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const features: string[] = [
    'Build Extended Toulmin diagrams by dragging from the palette to the canvas.',
    'Six argument types (claim, data, warrant, backing, qualifier, rebuttal), three support types (action, question, other), and an info box for episode metadata.',
    'Argument contributors: Given, Teacher, Student, Joint, Implicit. Support contributors: Teacher, Student. Border colors and styles reflect the contributor.',
    'Orthogonal connectors auto-route in Manhattan paths. Drag segment midpoints to reshape; drag edge anchors to slide endpoints along a box. Hover an anchor to reset.',
    'Warrants and rebuttals attach perpendicularly to the data→claim arrow they qualify.',
    'Save / load JSON, import DiagramMix .drawing files, or import from a photo of a hand-drawn diagram (sent to Google Gemini for extraction — see the Import image dialog for details).',
    'Export to PDF, PNG, SVG, or .diagramx — output covers the full diagram, not just what’s visible on screen.',
    'Full-screen mode (press F) hides the chrome for distraction-free review.',
  ];

  const shortcuts = [
    { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
    { keys: 'Ctrl/Cmd + Shift + Z', action: 'Redo' },
    { keys: 'Ctrl/Cmd + S', action: 'Save diagram' },
    { keys: 'Ctrl/Cmd + O', action: 'Load diagram' },
    { keys: 'Ctrl/Cmd + D', action: 'Duplicate selected' },
    { keys: 'Ctrl/Cmd + A', action: 'Select all' },
    { keys: 'Ctrl/Cmd + +', action: 'Zoom in' },
    { keys: 'Ctrl/Cmd + -', action: 'Zoom out' },
    { keys: 'Ctrl/Cmd + 0', action: 'Fit to view' },
    { keys: 'F', action: 'Toggle full-screen' },
    { keys: 'C', action: 'Toggle connect mode' },
    { keys: 'Delete / Backspace', action: 'Delete selected' },
    { keys: 'Escape', action: 'Cancel / Deselect / Exit full-screen' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="About Extended Toulmin Diagram Editor"
      size="lg"
      initialFocus="primary"
      footer={
        <button
          onClick={onClose}
          data-modal-focus="primary"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
        >
          Close
        </button>
      }
    >
      <div className="px-5 py-4 space-y-6">
        {/* Version */}
        <div>
          <p style={{ color: theme.sidebar.text }}>
            <span className="font-medium">Version:</span>{' '}
            <span style={{ color: theme.sidebar.textSecondary }}>1.4 (May 2026)</span>
          </p>
        </div>

        {/* Credits */}
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: theme.sidebar.text }}>
            Credits
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.textSecondary }}>
            App design and coding by{' '}
            <span style={{ color: theme.sidebar.accent }}>Jennifer Kleiman</span>.<br />
            Based on the Extended Toulmin Framework developed by{' '}
            <span style={{ color: theme.sidebar.accent }}>AnnaMarie Conner</span>{' '}
            for analyzing mathematical argumentation in classroom discourse.
          </p>
        </div>

        {/* Features */}
        <div>
          <h3
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: theme.sidebar.text }}
          >
            <Sparkles size={16} />
            Features
          </h3>
          <ul
            className="text-sm leading-relaxed space-y-1.5 list-disc pl-5"
            style={{ color: theme.sidebar.textSecondary }}
          >
            {features.map((feature, i) => (
              <li key={i}>{feature}</li>
            ))}
          </ul>
        </div>

        {/* Shortcuts */}
        <div>
          <h3
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: theme.sidebar.text }}
          >
            <Keyboard size={16} />
            Keyboard Shortcuts
          </h3>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${theme.sidebar.border}` }}
          >
            <table className="w-full text-sm">
              <tbody>
                {shortcuts.map((shortcut, index) => (
                  <tr
                    key={shortcut.keys}
                    style={index % 2 === 0 ? { backgroundColor: theme.sidebar.hover } : undefined}
                  >
                    <td
                      className="px-3 py-2 font-mono text-xs"
                      style={{ color: theme.sidebar.accent }}
                    >
                      {shortcut.keys}
                    </td>
                    <td className="px-3 py-2" style={{ color: theme.sidebar.textSecondary }}>
                      {shortcut.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

Note: the `AboutModal` prop signature changes from `{ onClose }` to `{ open, onClose }` — `Modal` owns the open/closed render. Update the caller (`MoreMenu.tsx` or wherever AboutModal is rendered) accordingly.

- [ ] **Step 2: Find and update the AboutModal caller**

```bash
grep -rn 'AboutModal' src/
```

Read each match, switch from conditional render (`{showAbout && <AboutModal onClose={...} />}`) to always-mounted with `open` prop (`<AboutModal open={showAbout} onClose={...} />`). The new pattern matches `SettingsModal`'s existing convention.

- [ ] **Step 3: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar/AboutModal.tsx src/components/Toolbar/MoreMenu.tsx
git commit -m "feat(pr4): refit AboutModal to use shared Modal frame; switch to open-prop pattern"
```

---

## Task 9: Refit `ImageImportModal.tsx` to use `Modal`

**Files:**
- Modify: `src/components/Toolbar/ImageImportModal.tsx`

The state machine (disclosure / picker / loading / error) stays. The outer scrim + frame collapses into `Modal`. Each state contributes its own `title`, body, and footer buttons (rendered into Modal's `footer` slot).

- [ ] **Step 1: Rewrite `ImageImportModal` rendering**

Pull the `return (...)` JSX out and replace with a `Modal`-wrapping render that branches on `state.kind`:

```tsx
// At top:
import { Modal } from '../ui/Modal';

// In return:
const titleByState: Record<ModalState['kind'], string> = {
  disclosure: 'Import diagram from image',
  picker:     'Import diagram from image',
  loading:    'Extracting diagram from image…',
  error:      'Import failed',
};

const initialFocusByState: Record<ModalState['kind'], 'primary' | 'cancel'> = {
  disclosure: 'primary',
  picker:     'primary',
  loading:    'cancel',
  error:      'primary',
};

return (
  <Modal
    open={open}
    onClose={handleCancel}
    title={titleByState[state.kind]}
    size="md"
    initialFocus={initialFocusByState[state.kind]}
    footer={renderFooter()}
  >
    <div className="px-5 py-4">
      {renderBody()}
    </div>
  </Modal>
);
```

Where `renderBody()` and `renderFooter()` are local helpers that return the per-state JSX from the current file:
- `disclosure` body: the two paragraphs (PII warning + extraction-time copy). Footer: Cancel (secondary) + Continue → (primary, `data-modal-focus="primary"`).
- `picker` body: the description + file input. Footer: Cancel only (primary, `data-modal-focus="primary"`).
- `loading` body: the message + progress bar. Footer: Cancel (secondary, `data-modal-focus="cancel"`).
- `error` body: the `errorMessage(state.result)` paragraph. Footer: Cancel (secondary) + Try again (primary, `data-modal-focus="primary"`).

All button styling reads from `theme.button.primary` / `theme.button.secondary` exactly as today — only the outer scrim + frame migration changes; per-state button visuals stay.

- [ ] **Step 2: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/ImageImportModal.tsx
git commit -m "feat(pr4): refit ImageImportModal to use shared Modal frame; per-state title/body/footer/focus"
```

---

## Task 10: Refit `SettingsModal.tsx` to use `Modal`

**Files:**
- Modify: `src/components/Settings/SettingsModal.tsx`

The Settings working-copy logic (committed config → working config, Apply commits, Cancel discards) is preserved verbatim. The local Esc handler at lines 37–43 is removed — `Modal` owns it. Per spec §7.2, the inner sidebar + form layout + the Konva-rendered `StylePreview` are untouched.

- [ ] **Step 1: Rewrite `SettingsModalInner`**

```tsx
function SettingsModalInner({ onClose }: { onClose: () => void }) {
  const committedConfig = useDiagramStore((s) => s.styleConfig);
  const replaceStyleConfig = useDiagramStore((s) => s.replaceStyleConfig);
  const [workingConfig, setWorkingConfig] = useState<StyleConfig>(committedConfig);
  const [selection, setSelection] = useState<SettingsSelection>({ kind: 'argument', type: 'data' });

  const handleApply = () => {
    replaceStyleConfig(workingConfig);
    onClose();
  };

  const handleResetAllTypeStyles = () => {
    const ok = window.confirm(
      'Reset all argument and support type styles to defaults? This does NOT affect your custom subtypes.'
    );
    if (!ok) return;
    const defaults = createCurrentDefaults();
    setWorkingConfig({
      ...workingConfig,
      argumentTypes: defaults.argumentTypes,
      supportTypes:  defaults.supportTypes,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Element Style Settings"
      size="xl"
      initialFocus="primary"
      footer={
        <>
          <button
            onClick={handleResetAllTypeStyles}
            className="text-xs underline mr-auto"
            style={{ color: theme.sidebar.textSecondary }}
          >
            Reset all type styles
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            data-modal-focus="primary"
            className="px-4 py-2 text-sm rounded-lg font-medium"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="flex" style={{ color: theme.sidebar.text, maxHeight: '70vh' }}>
        <SettingsSidebar
          config={workingConfig}
          selection={selection}
          onSelect={setSelection}
        />
        <div className="flex-1 p-6 overflow-y-auto">
          {selection.kind === 'argument' && (
            <TypeStyleEditor
              key={`argument:${selection.type}`}
              kind="argument"
              typeKey={selection.type}
              config={workingConfig}
              onChange={setWorkingConfig}
            />
          )}
          {selection.kind === 'support' && (
            <TypeStyleEditor
              key={`support:${selection.type}`}
              kind="support"
              typeKey={selection.type}
              config={workingConfig}
              onChange={setWorkingConfig}
            />
          )}
          {selection.kind === 'subtypes' && (
            <SubtypeListEditor config={workingConfig} onChange={setWorkingConfig} />
          )}
        </div>
      </div>
    </Modal>
  );
}
```

Remove the now-unused `X` import and the now-unused `useEffect` import (if it's the only use; check before deleting).

- [ ] **Step 2: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings/SettingsModal.tsx
git commit -m "feat(pr4): refit SettingsModal to use shared Modal frame; Esc + scrim handled centrally"
```

---

## Task 11: Refit `ImageLightbox.tsx` to use the dark-scrim `Modal`

**Files:**
- Modify: `src/components/ImageEditor/ImageLightbox.tsx`

The lightbox keeps its dark visual identity (full-viewport black scrim, no chrome frame). It uses `Modal` with `scrim="dark"` + `hideHeader` (the lightbox's overlay header is hand-rolled because it sits on top of the image, not above the dialog frame). Remove the local Esc handler — `Modal` provides it.

- [ ] **Step 1: Rewrite `ImageLightbox`**

```tsx
import { X } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface ImageLightboxProps {
  imageData: string;
  elementLabel?: string;
  onClose: () => void;
}

export function ImageLightbox({ imageData, elementLabel, onClose }: ImageLightboxProps) {
  return (
    <Modal
      open
      onClose={onClose}
      scrim="dark"
      hideHeader
      size="xl"
      initialFocus="close"
    >
      <div className="relative" style={{ minHeight: '60vh' }}>
        {/* Top overlay bar */}
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div>
            {elementLabel && (
              <h3 className="text-lg font-medium" style={{ color: 'white' }}>
                {elementLabel}
              </h3>
            )}
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Press Escape or click outside to close
            </p>
          </div>
          <button
            onClick={onClose}
            data-modal-focus="close"
            aria-label="Close lightbox"
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'white' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.10)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Image */}
        <div className="flex items-center justify-center max-w-[90vw] max-h-[80vh] overflow-auto">
          <img
            src={imageData}
            alt={elementLabel || 'Full size image'}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        </div>

        {/* Bottom overlay bar */}
        <div
          className="absolute bottom-0 left-0 right-0 px-5 py-4 text-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Original image - full resolution
          </p>
        </div>
      </div>
    </Modal>
  );
}
```

The `rgba(0, 0, 0, 0.5)` overlay-bar background and white text are part of the lightbox's deliberately-dark identity — these are not Sage tokens because the lightbox is the one place dark chrome is wanted (image fidelity). Spec §7.2 confirms: "Centered image, `shadow-lg`, scrim covers full viewport. Existing controls."

- [ ] **Step 2: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageEditor/ImageLightbox.tsx
git commit -m "feat(pr4): refit ImageLightbox to use Modal dark-scrim variant; Esc handled centrally"
```

---

## Task 12: Refit `ImageCropModal.tsx` to use `Modal`

**Files:**
- Modify: `src/components/ImageEditor/ImageCropModal.tsx`

The crop canvas math (lines 60–280) is untouched. The outer scrim + frame migrate; the lock/reset header buttons move into Modal's `headerExtras` slot.

- [ ] **Step 1: Rewrite the `return (...)` block**

```tsx
// Top of file:
import { Modal } from '../ui/Modal';
import { RotateCcw, Check, Lock, Unlock } from 'lucide-react';

// Inside ImageCropModal, replace the return JSX with:
return (
  <Modal
    open
    onClose={onCancel}
    title="Crop Image"
    size="xl"
    initialFocus="primary"
    headerExtras={
      <>
        <button
          onClick={() => setLockAspectRatio(!lockAspectRatio)}
          className="p-2 rounded transition-colors"
          style={{
            backgroundColor: lockAspectRatio ? theme.button.primary.bg : 'transparent',
            color: lockAspectRatio ? theme.button.primary.text : theme.sidebar.textSecondary,
          }}
          onMouseEnter={(e) => {
            if (!lockAspectRatio) e.currentTarget.style.backgroundColor = theme.sidebar.hover;
          }}
          onMouseLeave={(e) => {
            if (!lockAspectRatio) e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
        >
          {lockAspectRatio ? <Lock size={18} /> : <Unlock size={18} />}
        </button>
        <button
          onClick={handleReset}
          className="p-2 rounded transition-colors"
          style={{ color: theme.sidebar.textSecondary }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          title="Reset crop"
        >
          <RotateCcw size={18} />
        </button>
      </>
    }
    footer={
      <>
        <p className="text-xs mr-auto" style={{ color: theme.sidebar.textSecondary }}>
          Drag corners to resize, drag inside to move
        </p>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: theme.button.secondary.bg,
            color: theme.button.secondary.text,
            border: `1px solid ${theme.button.secondary.border}`,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          data-modal-focus="primary"
          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
        >
          <Check size={18} />
          Apply Crop
        </button>
      </>
    }
  >
    <div ref={containerRef} className="p-6">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="rounded-lg"
        style={{ display: 'block', boxShadow: theme.shadow.md }}
      />
    </div>
  </Modal>
);
```

Also remove the local Esc handler at line 280 (find the `useEffect` that listens for `Escape` and delete it) and the now-unused `X` import (Modal renders its own).

- [ ] **Step 2: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageEditor/ImageCropModal.tsx
git commit -m "feat(pr4): refit ImageCropModal to use shared Modal frame; canvas math preserved"
```

---

## Task 13: Refit `RecoveryPrompt.tsx` to use `Modal`

**Files:**
- Modify: `src/components/RecoveryPrompt.tsx`

Per spec §7.2: "Initial focus on Restore (Recover) — the more likely intended action and the safer accidental-Enter outcome." Discard becomes the secondary button on the left, Recover the primary on the right.

- [ ] **Step 1: Rewrite the component**

```tsx
import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { theme } from '../utils/theme';
import { formatTimestamp } from '../hooks/useAutoSave';
import { Modal } from './ui/Modal';

interface RecoveryPromptProps {
  timestamp: number;
  onRecover: () => void;
  onDiscard: () => void;
}

export function RecoveryPrompt({ timestamp, onRecover, onDiscard }: RecoveryPromptProps) {
  // Recovery opens without a triggering element — Modal's return-focus chain
  // falls through to document.body (logged in dev). That's intentional.
  return (
    <Modal
      open
      onClose={onDiscard}   // scrim/Esc = Discard? — see note below.
      title="Recover Unsaved Work?"
      size="sm"
      initialFocus="primary"
      // Recovery doesn't allow scrim-click to discard; the user must make
      // a deliberate choice. Esc is also blocked by setting onClose to a noop.
      closeOnScrim={false}
      hideCloseButton
      footer={
        <>
          <button
            onClick={onDiscard}
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            <Trash2 size={16} />
            Discard
          </button>
          <button
            onClick={onRecover}
            data-modal-focus="primary"
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
          >
            <RotateCcw size={16} />
            Recover
          </button>
        </>
      }
    >
      <div className="px-5 py-4 flex items-start gap-3">
        <AlertCircle size={24} style={{ color: theme.sidebar.accent, flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-sm leading-relaxed mb-3" style={{ color: theme.sidebar.textSecondary }}>
            We found an auto-saved diagram from your previous session. Would you like to recover it?
          </p>
          <p className="text-sm" style={{ color: theme.sidebar.text }}>
            <span className="font-medium">Last saved:</span>{' '}
            <span style={{ color: theme.sidebar.accent }}>{formatTimestamp(timestamp)}</span>
          </p>
        </div>
      </div>
    </Modal>
  );
}
```

**Wait — Esc handling.** Modal's Esc handler calls `onClose`. For Recovery we've wired `onClose` to `onDiscard`, which would discard on Esc. That's the wrong behavior — the user should be forced to make a choice.

Fix: in `Modal`, the Esc handler is unconditional. The right move is to keep `onClose` pointing at a no-op safe handler for Recovery, since the prompt requires explicit choice. Update the component to pass `onClose={() => { /* require explicit Recover/Discard */ }}`:

```tsx
return (
  <Modal
    open
    onClose={() => { /* recovery requires explicit choice — Esc + scrim disabled */ }}
    closeOnScrim={false}
    hideCloseButton
    ...
  >
```

Esc still fires the `onClose` no-op (harmless) — the focused Recover button stays focused, awaiting an explicit click or Enter.

- [ ] **Step 2: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/RecoveryPrompt.tsx
git commit -m "feat(pr4): refit RecoveryPrompt to use shared Modal frame; Esc/scrim no-op (explicit choice required)"
```

---

## Task 14: Add the `useConfirm` Zustand store + `<ConfirmHost>`

**Files:**
- Create: `src/store/confirmStore.ts`
- Create: `src/components/ui/ConfirmHost.tsx`
- Modify: `src/App.tsx` (mount `<ConfirmHost />`)

The store carries a single pending request slot + a stashed promise resolver. The host subscribes to the slot and renders the shared Modal.

- [ ] **Step 1: Write the store**

Create `src/store/confirmStore.ts`:

```ts
import { create } from 'zustand';

export type ConfirmVariant = 'default' | 'destructive';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;   // default 'Confirm'
  cancelLabel?: string;    // default 'Cancel'
  variant?: ConfirmVariant; // default 'default'
}

interface ConfirmState {
  request: ConfirmRequest | null;
  resolver: ((value: boolean) => void) | null;
  open: (req: ConfirmRequest) => Promise<boolean>;
  resolve: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  resolver: null,

  open: (req) =>
    new Promise<boolean>((resolve) => {
      const prev = get().resolver;
      if (prev) {
        // Defensive: if a previous prompt was somehow still open, cancel it.
        prev(false);
      }
      set({ request: req, resolver: resolve });
    }),

  resolve: (value) => {
    const resolver = get().resolver;
    set({ request: null, resolver: null });
    if (resolver) resolver(value);
  },
}));

/** Imperative helper for non-component contexts (event handlers, hooks). */
export function confirmAsync(req: ConfirmRequest): Promise<boolean> {
  return useConfirmStore.getState().open(req);
}
```

- [ ] **Step 2: Write the host**

Create `src/components/ui/ConfirmHost.tsx`:

```tsx
import { theme } from '../../utils/theme';
import { useConfirmStore } from '../../store/confirmStore';
import { Modal } from './Modal';

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const resolve = useConfirmStore((s) => s.resolve);

  if (!request) return null;

  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
  } = request;

  const onCancel  = () => resolve(false);
  const onConfirm = () => resolve(true);

  const confirmStyle =
    variant === 'destructive'
      ? { backgroundColor: theme.button.danger.bg, color: theme.button.danger.text }
      : { backgroundColor: theme.button.primary.bg, color: theme.button.primary.text };

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      // Per spec §7.1.1: destructive confirmations initial-focus Cancel.
      // Default (non-destructive) confirms can primary-focus.
      initialFocus={variant === 'destructive' ? 'cancel' : 'primary'}
      footer={
        <>
          <button
            onClick={onCancel}
            data-modal-focus="cancel"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: theme.button.secondary.bg,
              color: theme.button.secondary.text,
              border: `1px solid ${theme.button.secondary.border}`,
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            data-modal-focus="primary"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={confirmStyle}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="px-5 py-4">
        <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.text }}>
          {message}
        </p>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Mount `<ConfirmHost />` in `App.tsx`**

Add the import:

```tsx
import { ConfirmHost } from './components/ui/ConfirmHost';
```

Render `<ConfirmHost />` once near `<Toaster />` at the root.

- [ ] **Step 4: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/confirmStore.ts src/components/ui/ConfirmHost.tsx src/App.tsx
git commit -m "feat(pr4): add useConfirm store + ConfirmHost — imperative confirmAsync() for replacing confirm()"
```

---

## Task 15: Replace `confirm()` in `Toolbar.tsx` (Clear diagram)

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`

Spec §7.1.1 mandates destructive-Cancel focus. The Clear diagram dialog uses `variant: 'destructive'`.

- [ ] **Step 1: Add the import**

```tsx
import { confirmAsync } from '../../store/confirmStore';
```

- [ ] **Step 2: Rewrite `handleClear`**

Replace the current implementation (around line 201–207) with:

```tsx
const handleClear = async () => {
  if (elements.length === 0 && connections.length === 0) return;
  const ok = await confirmAsync({
    title: 'Clear diagram?',
    message: 'This will remove every element and connection. This cannot be undone.',
    confirmLabel: 'Clear diagram',
    cancelLabel: 'Cancel',
    variant: 'destructive',
  });
  if (ok) clearDiagram();
};
```

- [ ] **Step 3: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx
git commit -m "feat(pr4): replace Clear diagram confirm() with confirmAsync() destructive variant"
```

---

## Task 16: Replace `confirm()` in `App.tsx` + `TranscriptPanel.tsx` (transcript-orphan)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/TranscriptPanel/TranscriptPanel.tsx`

Both confirm prompts have the same shape ("Loading a new transcript will orphan N existing element reference(s). Proceed?"). They share copy but live in two unrelated handlers — per spec §9.2 dedupe is deferred. Replace each in place.

The orphan-prompt is **not destructive in the §7.1.1 sense** — the destructive outcome is orphaning existing references, but Proceed is the user's stated intent (they're loading a new transcript), so initial focus stays on the primary "Proceed" button. The variant is `'default'`, not `'destructive'`.

- [ ] **Step 1: Update `App.tsx` (around line 194)**

Add import:

```tsx
import { confirmAsync } from './store/confirmStore';
```

Replace the `confirm(...)` block:

```tsx
if (orphanCount > 0) {
  const proceed = await confirmAsync({
    title: 'Replace transcript?',
    message: `Loading a new transcript will orphan ${orphanCount} existing element reference(s). Proceed?`,
    confirmLabel: 'Replace transcript',
    cancelLabel: 'Cancel',
  });
  if (!proceed) {
    e.target.value = '';
    return;
  }
}
```

Note: the surrounding function is already `async` (it has `await file.text()`), so this fits.

- [ ] **Step 2: Update `TranscriptPanel.tsx` (around line 71)**

Add import:

```tsx
import { confirmAsync } from '../../store/confirmStore';
```

The `handleFileChange` function is already `async`. Replace the `confirm(...)` block with the same `await confirmAsync({...})` pattern as App.tsx.

- [ ] **Step 3: Verify the cleanup**

```bash
grep -rEn '\bconfirm\(|\bwindow\.confirm\(' src/
```

Expected: exactly three remaining hits — `SettingsModal.tsx:51`, `SubtypeListEditor.tsx:36`, `SubtypeListEditor.tsx:52`. These are nested settings confirms, out of PR 4 scope.

- [ ] **Step 4: Type-check + build**

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/TranscriptPanel/TranscriptPanel.tsx
git commit -m "feat(pr4): replace transcript-orphan confirm() in App.tsx + TranscriptPanel.tsx with confirmAsync()"
```

---

## Task 17: Audit — verify the forbidden-patterns gate

**Files:** (none modified)

The spec §9.2 verification: `grep -rEn '\balert\(' src/` returns zero results. Two more sanity greps catch regressions in the chrome.

- [ ] **Step 1: Zero `alert()` hits**

```bash
grep -rEn '\balert\(' src/
```

Expected: **no output**.

- [ ] **Step 2: Only the three nested settings confirms remain**

```bash
grep -rEn '\bconfirm\(|\bwindow\.confirm\(' src/
```

Expected: three lines — `SettingsModal.tsx:51`, `SubtypeListEditor.tsx:36`, `SubtypeListEditor.tsx:52`.

- [ ] **Step 3: No bare scrim-and-frame divs in the modal-bearing files**

Every modal that PR 4 refits should no longer carry its own `fixed inset-0 flex items-center justify-center` outer wrapper — that's Modal's job now.

```bash
grep -n 'fixed inset-0' src/components/Toolbar/AboutModal.tsx src/components/Toolbar/ImageImportModal.tsx src/components/Settings/SettingsModal.tsx src/components/ImageEditor/ImageLightbox.tsx src/components/ImageEditor/ImageCropModal.tsx src/components/RecoveryPrompt.tsx
```

Expected: no output (or only output from the `Modal` import line — which contains no `fixed inset-0` text).

- [ ] **Step 4: Lint + typecheck + production build**

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: all three pass.

If anything fails, fix in place and re-run. Do not commit a broken state.

- [ ] **Step 5: Commit the audit if any fixes were needed**

If steps 1–4 surfaced issues that required edits, commit them with a small message. Otherwise skip this step.

```bash
git status
# if anything modified:
git add <files>
git commit -m "chore(pr4): audit cleanup — <description>"
```

---

## Task 18: Manual verification in the dev server

**Files:** (none modified)

Per spec §11 PR 4 verify section. The dev server is the source of truth — type-checking alone doesn't catch focus management, scrim z-index regressions, or styling glitches.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open the printed URL in Chrome.

- [ ] **Step 2: Walk every modal**

For each: open from its toolbar / menu entry, verify Esc closes, verify scrim-click closes (except Recovery), verify initial focus per §7.1, verify Tab cycles within the modal.

1. **About** — open via More menu, Tab cycles through close × and Close footer button. Esc closes.
2. **Element styles (Settings)** — open via More menu. Sidebar selection works, type editor edits propagate to the Konva preview. Apply commits; Cancel discards. Esc closes (without prompting since we haven't wired unsaved-changes prompt — that's listed in §7.1 but the existing code didn't have it either; this remains true to current behavior).
3. **Import image** — open via toolbar Import icon. Disclosure → ack → picker → loading → error → try again flow still works. Cancel button always available.
4. **Image Lightbox** — click an image-bearing element's image preview. Dark scrim, image visible, close × works, Esc closes.
5. **Image Crop** — open via Properties panel "Edit crop" on an image-bearing element. Crop math still works (drag corners, drag inside). Lock aspect ratio button toggles. Reset crop button works. Apply Crop returns to Properties. Esc cancels.
6. **Recovery prompt** — to test: open the app, paint a diagram, refresh the tab. The Recovery modal appears. Tab between Discard and Recover (both reachable). Enter triggers focused button. Esc does nothing (explicit choice required). Scrim click does nothing.

- [ ] **Step 3: Walk every replaced `alert()` site**

For each: trigger the path, verify a toast appears bottom-right with the right variant left-border color:

1. **Toolbar load → invalid JSON file** — try loading a non-JSON file. Toast: error.
2. **Toolbar export DiagramMix with no elements** — try with empty canvas. Toast: info.
3. **Toolbar export DiagramMix with image-bearing elements** — verify warning toast appears alongside successful export.
4. **Toolbar export PDF failure** — hard to trigger naturally; visually verify by simulating with React DevTools (or skip if not easily reproducible — confirm the code path with a grep).
5. **Properties panel image upload too large** — drop a >5MB image into a claim element. Toast: error.
6. **Paste >5MB image** — copy a large image, paste into the canvas. Toast: error.
7. **Load transcript with no lines** — load an empty .txt file in the transcript loader. Toast: error.

- [ ] **Step 4: Walk both replaced `confirm()` sites**

1. **Clear diagram** — toolbar "Clear" button. Verify the destructive-variant modal opens with Cancel focused. Enter activates Cancel (no clear). Tab to "Clear diagram" → Enter clears.
2. **Transcript orphan** — load a transcript, link an element to a line, attempt to load a different transcript. Verify the default-variant modal opens with "Replace transcript" focused. Enter replaces; Cancel keeps the old transcript.

- [ ] **Step 5: Toast cap regression check**

Trigger 5 error toasts quickly (e.g., paste 5 oversize images in a row). Verify only 4 persistent toasts ever visible at once; oldest evicted FIFO. Check dev console for the `[toastStore] evicted oldest persistent toast` warning.

- [ ] **Step 6: Toast info auto-dismiss check**

Trigger an info toast (e.g., empty-export DiagramMix). Confirm it disappears at ~5s.

- [ ] **Step 7: Stop the dev server**

```bash
# Ctrl+C in the terminal running npm run dev
```

No commit for this task — verification only.

---

## Task 19: Push, open PR, deploy to jenkleiman.com

**Files:** (none modified beyond the dual-repo deploy copy)

Per `CLAUDE.md` "Deployment to jenkleiman.com" section.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/ui-rehaul-pr4-modals-notifications
```

Expected: branch published to origin.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "UI rehaul PR 4 — Modals + notifications" --body "$(cat <<'EOF'
## Summary
- Shared `<Modal>` frame with focus trap, return-focus chain, Esc/scrim close, ARIA dialog
- `<Toaster>` + `useToasts` store: info/warning/error variants, FIFO cap at 4 persistent
- `useConfirm` store + `<ConfirmHost>`: imperative `confirmAsync()` for replacing native `confirm()`
- Refit 6 existing modals (Settings, About, Image Import, Image Lightbox, Image Crop, Recovery)
- Replaced all 16 `alert()` call sites with toasts per spec §9.2
- Replaced 2 surviving `confirm()` call sites (Clear diagram, transcript-orphan) with `confirmAsync()`
- 3 nested settings confirms intentionally deferred (out of PR 4 scope per spec)

## Test plan
- [ ] About modal — Esc closes, Tab cycles, Close button focused on open
- [ ] Settings modal — Apply commits, Cancel discards, Konva preview unchanged
- [ ] Image Import — disclosure / picker / loading / error states all behave; Cancel works in each
- [ ] Image Lightbox — dark scrim, Esc + close × + scrim-click close
- [ ] Image Crop — crop math intact, lock/reset header buttons work, Apply returns crop
- [ ] Recovery prompt — Esc and scrim-click do nothing; Recover focused on open
- [ ] Toast variants — info auto-dismisses 5s, warning + error persist, error has Copy button
- [ ] Toast cap — 5th persistent toast evicts oldest (FIFO)
- [ ] Clear diagram — destructive confirm, Cancel focused on open
- [ ] Transcript orphan — default confirm, Replace focused on open
- [ ] `grep -rEn '\balert\(' src/` returns zero results
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 3: Build + deploy to jenkleiman.com**

After PR review + merge to `main`, deploy:

```bash
git checkout main
git pull
npm run build
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/

cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: UI rehaul PR 4 — modals + notifications"
git push
```

Expected: Netlify build triggers; ETD lives at jenkleiman.com/tools/etd.

- [ ] **Step 4: Confirm deployment**

After ~1–2 minutes, open `https://jenkleiman.com/tools/etd` in a fresh browser tab and walk Task 18's manual checks against the production deploy. If a regression appears that wasn't caught in dev, revert the jenkleiman.com commit and triage.

---

## Self-review notes

- **Spec coverage:** §7 (Modal frame) → Tasks 7–13. §7.1 (focus management) → Task 7. §7.1.1 (confirmation pattern) → Task 14 + 15. §7.2 (per-modal refits) → Tasks 8–13. §9.1 (Toast component) → Task 3. §9.2 (alert replacements) → Tasks 5 + 6. §9.2 confirm replacements → Tasks 15 + 16. §9.3 (store shape) → Task 2. Verification gate → Task 17.
- **Pre-commit hook for `alert()`** — spec §9.2 mentions this as optional hardening. Skipped from this plan because (a) the dev-side `grep` gate already catches regressions when reviewing diffs, (b) the previous PRs didn't add hooks, and (c) Jennifer hasn't requested it. Open to adding it in a follow-up if regressions appear.
- **Nested Settings confirms** (`SubtypeListEditor.tsx:36, 52`; `SettingsModal.tsx:51`) — left as native `window.confirm()`. They're decisions nested inside an already-open modal; the spec only enumerates the top-level Clear-diagram and transcript-orphan confirms. If Jennifer flags these as inconsistent later, a follow-up can promote them to the same `confirmAsync()` machinery.
- **No dedupe** of App.tsx ↔ TranscriptPanel.tsx transcript-load logic — spec explicitly defers this; per-site replacements only.
