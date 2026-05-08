# Full-screen mode + canvas-redraw fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `F`-toggleable full-screen mode that hides Toolbar/Palette/TranscriptPanel/PropertiesPanel via CSS, with hover-reveal toolbar at the top edge. Replace Canvas's `window.resize` listener with `ResizeObserver` to fix the underlying "transcript collapse doesn't redraw" bug.

**Architecture:** Single component tree with Tailwind `hidden` toggling on the panel wrappers (Canvas never unmounts). Toolbar wrapper's class flips between flow position (normal) and absolute overlay (full-screen) with CSS transform-driven slide. Keyboard handler reuses the existing `App.tsx` keydown infrastructure. `ResizeObserver` on the Canvas's container ref reflows the Konva stage on any layout change.

**Tech Stack:** React 19, react-konva, Tailwind, Zustand. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-08-fullscreen-mode-and-canvas-redraw-design.md`

---

## Task 1: Canvas redraw fix (ResizeObserver)

Independent bug fix. Replaces the existing `window.resize` listener with a `ResizeObserver` on the Canvas's container ref. Fires on any container size change (transcript collapse, future panel collapses, full-screen toggle, browser resize). Ships first because it's isolated and addresses a user-visible regression on its own.

**Files:**
- Modify: `src/components/Canvas/Canvas.tsx:130-144`

- [ ] **Step 1: Replace the `window.resize` effect with a `ResizeObserver`**

In `src/components/Canvas/Canvas.tsx`, find the existing block (around lines 130-144):

```ts
  // Update stage size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
```

Replace it with:

```ts
  // Track the container's actual size via ResizeObserver. Fires on any layout
  // change — window resize, sibling panel collapse, full-screen toggle —
  // not just window-level events.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      setStageSize({ width: el.offsetWidth, height: el.offsetHeight });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds. ResizeObserver is in the standard DOM lib types — no TS errors expected.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 31/31 still pass.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. Load the app. Confirm the canvas renders correctly at startup (no zero-size stage). Drop an element and confirm it's positioned correctly. Resize the browser window — Canvas should still reflow.

Then test the original bug: load a transcript, click the panel's `X` button to collapse it. Canvas should reflow to fill the recovered space (drag an element to the new far-right edge — it should still be reachable). Re-expand the panel via the right-edge pill — Canvas reflows back.

- [ ] **Step 5: Commit**

```bash
git add src/components/Canvas/Canvas.tsx
git commit -m "fix(canvas): use ResizeObserver so stage reflows on container size change"
```

---

## Task 2: State, layout refactor, keyboard handlers

Add the state model (`fullScreen`, `toolbarHovered`, `showHint`, `prefersReducedMotion`, `retractTimerRef`), refactor the layout to use Tailwind `hidden` toggling on panels (so Canvas never unmounts), add the toolbar wrapper class flip for absolute-overlay positioning, and wire the keyboard handlers (`F` toggle with mod-key guards; modal-gated `Esc`).

After this task, `F` hides all chrome and `Esc` brings it back. The toolbar is fully hidden in full-screen mode (no hover reveal yet — that's Task 3).

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add state and the prefers-reduced-motion read**

At the top of the `App` function (after the existing `useState` calls around lines 18-24), add:

```ts
  const [fullScreen, setFullScreen] = useState(false);
  const [toolbarHovered, setToolbarHovered] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const retractTimerRef = useRef<number | null>(null);

  // Read once at mount. The OS-level toggle takes effect on next refresh.
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

The `useRef` import is already present at line 1 (`import { useState, useEffect, useCallback, useRef } from 'react';`).

- [ ] **Step 2: Add the cancel-pending-retract helper**

Inside the `App` function body, near the other `useCallback` definitions, add:

```ts
  const cancelPendingRetract = useCallback(() => {
    if (retractTimerRef.current !== null) {
      clearTimeout(retractTimerRef.current);
      retractTimerRef.current = null;
    }
  }, []);
```

- [ ] **Step 3: Wire the F-key toggle and modal-gated Esc into the existing keyboard handler**

Find the existing `handleKeyDown` callback inside the keyboard `useEffect` (around line 201). The handler currently has these branches in order: undo, redo, save, load, duplicate, select all, zoom in, zoom out, fit to view, `'C'` connect mode, Delete/Backspace, Escape.

Add the F-key toggle just BEFORE the `'C'` connect-mode branch (around line 280). Replace the existing Escape branch (around line 297-302) with the modal-gated version.

The complete set of changes:

```ts
      // Full-screen toggle: F (no modifier).
      // CRITICAL: must NOT trigger on Cmd+F / Ctrl+F (browser find), Shift+F,
      // or Alt+F — those should pass through to default browser/OS behavior.
      if ((e.key === 'f' || e.key === 'F') && !isMod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setFullScreen((prev) => !prev);
        setToolbarHovered(false);
        cancelPendingRetract();
        return;
      }

      // 'C' for connect mode  ← existing branch, unchanged
      if (e.key === 'c' || e.key === 'C') {
        toggleConnectMode();
      }

      // Delete/Backspace ← existing branch, unchanged
      if (e.key === 'Delete' || e.key === 'Backspace') {
        selectedIds.forEach((id) => {
          if (connections.some((c) => c.id === id)) {
            removeConnection(id);
          } else {
            removeElement(id);
          }
        });
      }

      // Escape: modal-gated, then full-screen exit, then connect-mode cancel.
      if (e.key === 'Escape') {
        // Defer to any open modal — its own keydown handler will close it.
        if (settingsOpen || lightboxOpen || recoveryData !== null) {
          return;
        }
        if (fullScreen) {
          setFullScreen(false);
          setToolbarHovered(false);
          cancelPendingRetract();
          return;
        }
        if (connectMode) {
          setConnectMode(false);
          setConnectingFrom(null);
        }
      }
```

- [ ] **Step 4: Update the keyboard `useEffect` dependency array**

Find the existing dep array (around lines 307-321) of the keyboard `useEffect`. The existing array is:

```ts
  }, [
    toggleConnectMode,
    selectedIds,
    removeElement,
    removeConnection,
    connections,
    connectMode,
    handleSave,
    handleLoad,
    duplicateElements,
    selectAll,
    setZoom,
    zoom,
    fitToView,
  ]);
```

Replace with the augmented version (adds `fullScreen`, the modal-state reads, and `cancelPendingRetract`):

```ts
  }, [
    toggleConnectMode,
    selectedIds,
    removeElement,
    removeConnection,
    connections,
    connectMode,
    handleSave,
    handleLoad,
    duplicateElements,
    selectAll,
    setZoom,
    zoom,
    fitToView,
    fullScreen,
    settingsOpen,
    lightboxOpen,
    recoveryData,
    cancelPendingRetract,
  ]);
```

- [ ] **Step 5: Refactor the layout to single-tree CSS-toggle**

Replace the existing JSX return (around lines 323-397) with the refactored single-tree layout. The Canvas keeps its position so it never unmounts.

Locate the return statement that begins:
```tsx
  return (
    <div className="h-screen flex flex-col bg-gray-50">
```

Replace from `return (` through the closing `);` at the end of the function with:

```tsx
  return (
    <div className="h-screen flex flex-col bg-gray-50 relative">
      {/* Hidden file input for Ctrl+O loading */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileLoad}
        className="hidden"
      />
      <input
        ref={transcriptFileInputRef}
        type="file"
        accept=".txt"
        onChange={handleTranscriptFileChange}
        className="hidden"
      />

      {/* Toolbar wrapper — flow position normally, absolute overlay in full-screen.
          In full-screen, slides in from above on toolbarHovered (Task 3 wires the
          mouse handlers). Until Task 3 lands, the wrapper is just hidden via the
          translate-up transform. */}
      <div
        className={fullScreen ? 'absolute top-0 left-0 right-0 z-30' : 'relative'}
        style={
          fullScreen
            ? {
                transform: toolbarHovered ? 'translateY(0)' : 'translateY(-100%)',
                transition: prefersReducedMotion ? 'none' : 'transform 180ms ease',
                paddingBottom: 24,
                boxShadow: toolbarHovered ? '0 2px 12px rgba(0,0,0,0.15)' : 'none',
              }
            : undefined
        }
      >
        <Toolbar
          onLoadTranscript={handleLoadTranscriptClick}
          transcriptPanelOpen={transcriptPanelOpen}
          onToggleTranscriptPanel={toggleTranscriptPanel}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      {/* Canvas row — Canvas always at this stable tree position. Sibling panels
          toggled via Tailwind `hidden` (display: none) so they unmount layout-wise
          but stay mounted component-wise; their internal state survives. */}
      <div className="flex flex-1 overflow-hidden">
        <div className={fullScreen ? 'hidden' : 'contents'}>
          <Palette
            connectMode={connectMode}
            onToggleConnectMode={toggleConnectMode}
          />
        </div>

        <Canvas
          connectMode={connectMode}
          onConnectionStart={handleConnectionStart}
          connectingFrom={connectingFrom}
        />

        <div className={fullScreen ? 'hidden' : 'contents'}>
          {transcriptPanelOpen ? (
            <TranscriptPanel onClose={() => setTranscriptPanelOpen(false)} />
          ) : (
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
          )}
        </div>
      </div>

      {/* Properties — hidden in full-screen */}
      <div className={fullScreen ? 'hidden' : ''}>
        <PropertiesPanel />
      </div>

      {/* Recovery Prompt */}
      {recoveryData && (
        <RecoveryPrompt
          timestamp={recoveryData.timestamp}
          onRecover={handleRecover}
          onDiscard={handleDiscard}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Image Lightbox */}
      {lightboxOpen && lightboxImage && (
        <ImageLightbox
          imageData={lightboxImage}
          elementLabel={lightboxLabel || undefined}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
```

The `contents` Tailwind class makes the wrapper `display: contents` so it doesn't disturb the flex layout when visible — the wrapped child (`<Palette>`, transcript panel/pill) takes part in the parent flex as if the wrapper weren't there. When the class flips to `hidden`, the entire wrapper plus its children is removed from layout via `display: none`.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: 31/31 still pass (no logic in store/utils changed).

- [ ] **Step 8: Manual smoke test**

Run: `npm run dev`. Confirm:
- App opens in normal mode looking exactly as before (panels visible, layout unchanged).
- Press `F` → all chrome disappears (Toolbar, Palette, Transcript, Properties), Canvas fills the viewport. The Canvas itself reflows correctly (the ResizeObserver from Task 1 picks up the new container size).
- Press `Esc` → normal layout restored.
- Press `F` again → full-screen.
- Press `F` again → restored.
- Press `Cmd+F` (or `Ctrl+F` on Linux) → browser's find bar opens. Full-screen state unchanged.
- Open Settings (gear icon) → press `Esc` → Settings closes (full-screen state unchanged because we weren't in full-screen).
- Enter full-screen, then open Settings via the toolbar (it's hidden — open via the existing keyboard shortcut if there is one, OR exit full-screen first, open Settings, then press F). With Settings open in full-screen, press `Esc` → Settings closes; full-screen still active. Press `Esc` again → full-screen exits.
- Type something in an inline text editor (double-click an element to enter edit mode), press `f` → full-screen does NOT toggle (input-focus guard at the top of the keyboard handler).

Toolbar is invisible in full-screen for now — that's expected. Hover reveal lands in Task 3.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): full-screen mode (F toggles, Esc exits, modal-state-gated)"
```

---

## Task 3: Hover-toolbar mechanics

Add the hover zone, slide reveal, retract debounce, focus-based reveal for keyboard navigation, and `stopPropagation` so toolbar button clicks don't trigger the canvas's "retract on click" handler.

After this task, the toolbar is reachable by mouse (hover near top edge) or keyboard (Tab into it). Mouse leaving (with the 150ms debounce + 24px tooltip-padding belt-and-suspenders) retracts it. Clicking on the canvas retracts immediately.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the toolbar mouse-leave / blur handlers**

Inside the `App` function, near the existing `useCallback` definitions (alongside `cancelPendingRetract` from Task 2 Step 2), add:

```ts
  const handleToolbarMouseLeave = useCallback(() => {
    cancelPendingRetract();
    retractTimerRef.current = window.setTimeout(() => {
      setToolbarHovered(false);
      retractTimerRef.current = null;
    }, 150);
  }, [cancelPendingRetract]);

  const handleToolbarBlur = useCallback((e: React.FocusEvent) => {
    // Retract only if focus left the toolbar entirely (not moved to a child).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      handleToolbarMouseLeave();
    }
  }, [handleToolbarMouseLeave]);

  const handleHoverZoneEnter = useCallback(() => {
    cancelPendingRetract();
    setToolbarHovered(true);
  }, [cancelPendingRetract]);

  const handleToolbarFocus = useCallback(() => {
    cancelPendingRetract();
    setToolbarHovered(true);
  }, [cancelPendingRetract]);
```

- [ ] **Step 2: Wire the toolbar wrapper handlers**

Find the toolbar wrapper `<div>` from Task 2 Step 5 (the one with the conditional `absolute top-0 ...` className). Add the following props (preserve the existing `className` and `style` props):

```tsx
      <div
        className={fullScreen ? 'absolute top-0 left-0 right-0 z-30' : 'relative'}
        style={
          fullScreen
            ? {
                transform: toolbarHovered ? 'translateY(0)' : 'translateY(-100%)',
                transition: prefersReducedMotion ? 'none' : 'transform 180ms ease',
                paddingBottom: 24,
                boxShadow: toolbarHovered ? '0 2px 12px rgba(0,0,0,0.15)' : 'none',
              }
            : undefined
        }
        onMouseLeave={fullScreen ? handleToolbarMouseLeave : undefined}
        onMouseDown={fullScreen ? (e) => e.stopPropagation() : undefined}
        onFocus={fullScreen ? handleToolbarFocus : undefined}
        onBlur={fullScreen ? handleToolbarBlur : undefined}
      >
        <Toolbar
          onLoadTranscript={handleLoadTranscriptClick}
          transcriptPanelOpen={transcriptPanelOpen}
          onToggleTranscriptPanel={toggleTranscriptPanel}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
```

The handlers attach only in full-screen — in normal mode, the wrapper is just `<div className="relative"><Toolbar /></div>` and behaves exactly as before.

- [ ] **Step 3: Add the canvas-row "retract on click" handler**

Find the canvas row `<div>` from Task 2 Step 5 (the one with `className="flex flex-1 overflow-hidden"`). Add an `onMouseDown` handler that fires only in full-screen:

```tsx
      <div
        className="flex flex-1 overflow-hidden"
        onMouseDown={fullScreen ? () => setToolbarHovered(false) : undefined}
      >
```

This retracts the toolbar when the user starts interacting with the canvas. The `stopPropagation` on the toolbar wrapper prevents this from firing when the user clicks a toolbar button.

- [ ] **Step 4: Add the hover zone**

After the closing `</div>` of the canvas row but before the Properties panel, add the hover zone (only rendered in full-screen):

```tsx
      {/* Hover zone — 12px transparent strip at top. Wakes the toolbar. */}
      {fullScreen && (
        <div
          className="absolute top-0 left-0 right-0 z-20"
          style={{ height: 12 }}
          onMouseEnter={handleHoverZoneEnter}
        />
      )}
```

The hover zone sits at the top of the relative-positioned root div. It's 12px tall, transparent, and only catches `onMouseEnter` to trigger the reveal. The toolbar wrapper has higher z-index (`z-30` vs `z-20`), so when revealed it sits visually above the hover zone.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: 31/31 still pass.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`. In full-screen (`F`):
- Move mouse to top edge of viewport → toolbar slides down within ~200ms.
- Move mouse off the toolbar (down into the canvas) → toolbar slides back up after the 150ms debounce.
- Move mouse to top edge → toolbar reveals → click a toolbar button (e.g., Save). Action fires, toolbar stays visible momentarily then retracts after the mouse leaves it (the click does NOT cause an immediate retract because `stopPropagation` is on the wrapper).
- Move mouse to top edge → toolbar reveals → click in the canvas area → toolbar retracts immediately (canvas-row `onMouseDown`).
- Hover an icon button so its tooltip pops below → mouse onto the tooltip → toolbar should NOT retract (24px padding + debounce both protect this).
- Press `Tab` to focus a button (browser focus order: hidden toolbar button gets focus on first Tab from the canvas) → toolbar slides in via `onFocus`. Press Tab again → next button highlighted, toolbar still revealed. Tab past the last button → toolbar retracts after debounce.
- Exit full-screen → normal mode → confirm toolbar visible and behaves exactly as before (no hover behavior in normal mode).

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): hover-reveal toolbar in full-screen with debounce + focus support"
```

---

## Task 4: Entry hint chip

Small fading chip in the bottom-right of the viewport that says "Press F or Esc to exit" when full-screen is first entered. Auto-dismisses after 2.5s. Driven by a `useEffect` listening on `fullScreen`.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the hint timer effect**

Inside the `App` function, near the existing `useEffect` calls, add:

```ts
  // Show the entry hint each time full-screen is entered. Fades out after 2.5s.
  useEffect(() => {
    if (!fullScreen) return;
    setShowHint(true);
    const t = window.setTimeout(() => setShowHint(false), 2500);
    return () => clearTimeout(t);
  }, [fullScreen]);
```

The cleanup clears the timer if the user exits full-screen before the hint fades, so toggling rapidly doesn't leak timers.

- [ ] **Step 2: Render the hint chip**

After the hover zone block from Task 3 Step 4 (still inside the root `<div>`, before the modals), add:

```tsx
      {/* Entry hint — fades after 2.5s */}
      {fullScreen && showHint && (
        <div
          className="absolute bottom-4 right-4 z-40 px-3 py-1.5 rounded-md text-xs pointer-events-none"
          style={{
            background: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease',
          }}
        >
          Press F or Esc to exit
        </div>
      )}
```

`pointer-events-none` so the chip doesn't accidentally absorb clicks. `z-40` to sit above the toolbar (`z-30`) but below modals.

The transition's effect on the appearing chip is essentially nil (the element mounts already at `opacity: 1` since no `opacity` style is applied). To make the fade-out smoother, the `useEffect` could set `showHint = 'fading'` for the last 400ms instead of just unmounting at `false` — but the spec says fading is fine as a hard removal. Keep the simple version.

Note: a reader might expect the chip to fade in *and* out. The spec describes "fades out after ~2.5s", which the simple version doesn't do (it just unmounts). If usability feedback wants a smooth fade-out, the implementation would track an intermediate `isFading` state and apply `opacity: 0` for the last 400ms before unmounting. For v1, hard removal is fine — flagged as a tunable.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 31/31 still pass.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. In normal mode, press `F`:
- Hint chip appears in bottom-right reading "Press F or Esc to exit".
- After ~2.5s, chip disappears.
- Press `Esc` (chip is already gone) → exits full-screen.
- Press `F` again → chip reappears, dismisses again after 2.5s.

Test rapid toggling: press `F` then `F` then `F` quickly. The timer cleanup should ensure no orphaned chips appear after the final state settles.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): entry hint chip on full-screen entry"
```

---

## Task 5: Manual verification + deploy

The full spec verification list. Run through every scenario; flag any regression in an earlier task before declaring done.

**Files:** none modified (unless a regression is found, in which case the fix gets its own commit and loops back to the relevant task).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves at the dev URL (typically `http://localhost:5173/tools/etd/`). Open in a browser.

- [ ] **Step 2: Walk the spec's Manual Verification list (steps 1–16)**

Open `docs/superpowers/specs/2026-05-08-fullscreen-mode-and-canvas-redraw-design.md` and find the "Manual verification (browser)" section. Walk each step in order:

1. Enter / exit (F → Esc → F → ...)
2. Hover-toolbar reveal (mouse to top edge)
3. Hover-toolbar retract (mouse off after 150ms debounce)
4. Tooltip absorption (hover icon button, mouse onto tooltip — should NOT retract)
5. Auto-hide on canvas interaction (click canvas with toolbar revealed)
6. Canvas redraw on transcript collapse (the original bug)
7. Keyboard shortcuts intact in full-screen (Cmd+S/Z/0/±, C, F)
8. Cmd+F does NOT toggle full-screen (browser find still works)
9. Typing safety (open Settings, type in input, press f → no toggle)
10. Modal coexistence (Settings + ImageLightbox; recovery prompt)
11. Marquee survives the swap (mid-marquee, press F)
12. Sticky-group drag survives the swap (mid-argument-drag with cluster, press F)
13. Inline editor survives the swap (double-click element to edit, press F → still active)
14. Keyboard navigation reveals toolbar (Tab in full-screen)
15. Reduced motion (with OS "Reduce Motion" enabled — instant transitions)
16. Tab focus during normal mode (no full-screen-only handlers fire)

If anything fails: stop, investigate, fix in the relevant earlier task, re-run that task's tests, then return to this step.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: 31/31 pass.

- [ ] **Step 4: Final build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Push the etd repo and deploy to jenkleiman.com**

Per CLAUDE.md's deployment workflow. This step requires user approval before pushing — confirm with the user first.

```bash
# Push etd commits
git push origin main

# Build is already done from Step 4
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: full-screen mode + canvas redraw fix"
git push
```

Netlify auto-deploys when the jenkleiman.com repo is pushed.

---

## Notes for the implementer

- **Why CSS toggle (not conditional render):** the spec's review caught that conditional rendering of two separate layout components would unmount/remount the Canvas, losing in-progress state. The single-tree CSS-toggle approach keeps Canvas at a stable position so React reconciliation reuses it across F-toggles. Don't refactor to two-component rendering.

- **Why `display: contents` on the panel wrappers:** the wrappers exist only to apply the `hidden` class. `display: contents` makes the wrapper "see-through" in the flex layout — the Palette/TranscriptPanel takes part in the parent flex as if the wrapper weren't there. When the class flips to `hidden` (`display: none`), the wrapper plus its children is removed from layout, freeing space for the Canvas's `flex-1` to reclaim.

- **Why the 24px padding AND the 150ms debounce:** the spec's review noted the padding alone is brittle (tooltip dimensions vary). The debounce alone is also brittle (rapid mouse jitter at the toolbar's edge causes flicker). Both together: the padding catches sustained tooltip hovers; the debounce catches transient mouse-out events.

- **`prefers-reduced-motion` is read once at mount:** the spec calls out that reactive listening is YAGNI for v1. If a user toggles the OS preference mid-session, they need to refresh. Acceptable.

- **`stopPropagation` on toolbar wrapper's `onMouseDown`:** prevents the canvas-row's `onMouseDown` ("retract on canvas click") from firing when the user clicks a toolbar button. Without this, clicking Save on the toolbar would retract the toolbar mid-click. Verified to not break anything inside the Toolbar (its own click handlers fire on the buttons themselves, not on the wrapper).

- **`onFocus`/`onBlur` on toolbar wrapper:** React's `onFocus`/`onBlur` props bubble (they're really `focusin`/`focusout`), so a Tab-into a toolbar button triggers the wrapper's `onFocus`. The `relatedTarget` check on `onBlur` handles the case where focus moves between toolbar buttons (don't retract) vs leaves the toolbar entirely (retract).

- **No unit tests for this work:** the changes are layout/event-driven and the project doesn't currently have a JSDOM/Testing-Library setup. Manual verification via the spec's 16-step list is the acceptance criterion. (Vitest is set up but used only for pure-function tests.)
