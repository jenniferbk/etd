# Full-screen mode + canvas-redraw fix

**Date:** 2026-05-08
**Status:** Design approved, ready for implementation plan
**Origin:** Jennifer (2026-05-08): "the paths on the right side of the screen are messy and the UI is taking up too much room, i want to be able to see the whole diagram in more detail. if i collapse the transcript panel, it doesn't redraw, and there's no way to collapse the other panels. i really want a full-screen mode."

## Problem

The ETD editor's chrome (Toolbar, Palette, TranscriptPanel, PropertiesPanel) consumes ~600+ pixels around the canvas at typical 1440-wide viewports. For research workflows that involve reading a large diagram in detail (and especially during peer review or presentation), the user wants to reclaim every pixel of canvas.

There's also a latent bug: `Canvas.tsx:130-144` updates `stageSize` only on `window.resize`. When the transcript panel collapses, the *window* doesn't fire resize — only the Canvas's container size changes. The Canvas keeps its old stage width, so the visible drawing area doesn't reflow. This isn't full-screen-specific; it's the underlying reason "if I collapse the transcript panel, it doesn't redraw."

## Goals

- A single keyboard shortcut (`F`) toggles a full-screen mode that hides Toolbar, Palette, TranscriptPanel, and PropertiesPanel. Canvas fills the viewport.
- In full-screen, the Toolbar reveals on hover-near-top so commands without keyboard shortcuts (export, recovery prompt, settings entry) remain reachable. Auto-retracts when the user moves away or interacts with the canvas.
- Canvas reflows to its container's actual size whenever the layout changes, regardless of cause (full-screen toggle, transcript collapse, future panel-collapse work, browser resize).
- `Esc` exits full-screen (in addition to `F`).

## Non-goals

- Per-panel collapse buttons (Palette, Properties). Out of scope for this sub-project. Full-screen handles the underlying ask.
- Persistence across reloads. Full-screen is transient — reloading always starts in normal mode.
- Native browser `requestFullscreen` (would also hide tabs/OS bar). Not what the user wants; introduces exit-key conflicts.
- Animated transition between normal and full-screen layouts. Instant swap. Only the toolbar slide-in/out is animated.
- Touch / mobile gestures for revealing the toolbar. ETD users are predominantly desktop researchers; touch users on tablets without a keyboard would be stuck in full-screen with no way to reveal the toolbar. Acknowledged limitation; if it becomes a real-world blocker, add a small always-visible exit chevron in a follow-up.
- Adding an Esc handler to `RecoveryPrompt`. The prompt is gated by `recoveryData !== null` in our Esc handler so it doesn't accidentally consume the keystroke for full-screen, but the prompt itself still requires clicking Recover or Discard. Separate TODO.
- Reactive listening to `prefers-reduced-motion` changes mid-session. We read the value once at App mount; OS-level toggling requires a refresh. YAGNI for v1.
- Rolling in the queued transcript-panel-cleanup sub-project (in-app Clear-transcript affordance, redundant toolbar buttons). Stays separate.

## Design

### State

In `src/App.tsx`:

```ts
const [fullScreen, setFullScreen] = useState(false);
const [toolbarHovered, setToolbarHovered] = useState(false);
```

`fullScreen` is the mode toggle. `toolbarHovered` controls the slide-in/out of the floating toolbar; only meaningful when `fullScreen === true`.

### Layout: single tree, CSS-toggled panels

The app keeps one stable component tree. Panels are hidden in full-screen via `display: none` (Tailwind `hidden`), preserving their internal state and — critically — keeping `<Canvas>` mounted at the same tree position so it never unmounts. This means: in-progress inline edits, marquee selections, sticky-group drag caches, and any other ephemeral Canvas state survive a full-screen toggle.

```tsx
return (
  <div className="h-screen flex flex-col bg-gray-50 relative">
    {/* Hidden file inputs — unchanged */}

    {/* Toolbar wrapper — class flips between flow position and overlay.
        In full-screen, slides via transform on toolbarHovered. */}
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
      onFocus={fullScreen ? () => setToolbarHovered(true) : undefined}
      onBlur={fullScreen ? handleToolbarBlur : undefined}
    >
      <Toolbar
        onLoadTranscript={handleLoadTranscriptClick}
        transcriptPanelOpen={transcriptPanelOpen}
        onToggleTranscriptPanel={toggleTranscriptPanel}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    </div>

    {/* Canvas row — Canvas always at this tree position; sibling panels
        toggled via `hidden` class so they unmount layout-wise but not
        component-wise. */}
    <div
      className="flex flex-1 overflow-hidden"
      onMouseDown={fullScreen ? () => setToolbarHovered(false) : undefined}
    >
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
          /* existing right-edge expand pill */
        )}
      </div>
    </div>

    {/* Properties — hidden in full-screen */}
    <div className={fullScreen ? 'hidden' : ''}>
      <PropertiesPanel />
    </div>

    {/* Hover zone — only in full-screen. 12px transparent strip; wakes
        the toolbar via mouseEnter. */}
    {fullScreen && (
      <div
        className="absolute top-0 left-0 right-0 z-20"
        style={{ height: 12 }}
        onMouseEnter={() => setToolbarHovered(true)}
      />
    )}

    {/* Entry hint — fades out after 2.5s */}
    {fullScreen && showHint && (
      <div
        className="absolute bottom-4 right-4 z-40 px-3 py-1.5 rounded-md text-xs"
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          color: 'white',
          transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease',
        }}
      >
        Press F or Esc to exit
      </div>
    )}

    {/* Modals — unchanged, render outside the layout */}
  </div>
);
```

Tailwind's `hidden` class is `display: none`, which removes the panel from layout entirely; `<Canvas>`'s flex-1 reclaims the space, and `ResizeObserver` (see "Canvas redraw fix") picks up the size change and reflows the Konva stage automatically.

### Toolbar mouse-leave debounce

To make the hover-toolbar more forgiving (rapid mouse movement, tooltip overflow, brief slips into adjacent space), the `onMouseLeave` handler debounces by 150ms before retracting. The `onMouseEnter` on the hover zone or `onFocus` on the wrapper cancels any pending retract. The 24px tooltip padding stays as belt-and-suspenders — it covers the case where the cursor is actively on a tooltip below the toolbar (no debounce needed because the cursor never left).

```ts
const retractTimerRef = useRef<number | null>(null);

const cancelPendingRetract = () => {
  if (retractTimerRef.current !== null) {
    clearTimeout(retractTimerRef.current);
    retractTimerRef.current = null;
  }
};

const handleToolbarMouseLeave = () => {
  cancelPendingRetract();
  retractTimerRef.current = window.setTimeout(() => {
    setToolbarHovered(false);
    retractTimerRef.current = null;
  }, 150);
};

const handleToolbarBlur = (e: React.FocusEvent) => {
  // Only retract if focus left the toolbar entirely (not moved to a child).
  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
    handleToolbarMouseLeave();
  }
};

// On hover-zone mouseEnter and toolbar focus, also cancel pending retract:
// onMouseEnter={() => { cancelPendingRetract(); setToolbarHovered(true); }}
```

### Reduced-motion support

```ts
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Stored at the top of `App.tsx`. The transition strings throughout the layout reference this so users with the OS preference set get instant slide and instant fade instead of the 180ms / 400ms animations. (For full correctness, a `useEffect` listening to the media query's `change` event would re-render on preference change mid-session; spec leaves this as YAGNI for v1 — a refresh after toggling the OS setting is acceptable.)

`showHint` is driven by a separate `useState` + `useEffect` triggered on every `true`-transition of `fullScreen`:

```ts
const [showHint, setShowHint] = useState(false);
useEffect(() => {
  if (!fullScreen) return;
  setShowHint(true);
  const t = setTimeout(() => setShowHint(false), 2500);
  return () => clearTimeout(t);
}, [fullScreen]);
```

**Hover-toolbar mechanics summary:**
- Hover zone (`z-20`, 12px tall) registers `onMouseEnter` to wake the toolbar.
- Toolbar wrapper (`z-30`) starts off-screen at `translateY(-100%)`, slides to `translateY(0)` when `toolbarHovered`.
- Wrapper's `onMouseLeave` retracts the toolbar (mouse exits its bbox including the 24px tooltip padding).
- Outer `onMouseDown` on the layout wrapper retracts the toolbar when the user clicks/drags on the canvas — toolbar gets out of the way during interaction.
- Modals (`z-40`+) overlay both modes and remain functional.

### Keyboard handling

Add to the existing `handleKeyDown` in `App.tsx` (currently lines 200-321). The input/textarea/contentEditable guard at lines 204-209 stays — `F` must NOT toggle full-screen while the user is typing.

After the existing `'C'` connect-mode handler (around line 280-282), add:

```ts
// Full-screen toggle: F (no modifier).
// CRITICAL: must NOT trigger on Cmd+F / Ctrl+F (browser find) or any other
// modifier combination — the existing isMod is `e.metaKey || e.ctrlKey`.
if ((e.key === 'f' || e.key === 'F') && !isMod && !e.altKey && !e.shiftKey) {
  e.preventDefault();
  setFullScreen((prev) => !prev);
  setToolbarHovered(false);  // reset on every toggle
  return;
}
```

The `!isMod && !e.altKey && !e.shiftKey` triple-guard is necessary because audit verified that Cmd+F, Ctrl+F, Alt+F, and Shift+F should all flow through to their default behavior (browser find, OS-level shortcuts).

Modify the existing `Escape` handler (around line 297-302) so it exits full-screen first if active, otherwise falls through to existing connect-mode cancellation. **Critical:** gate on modal state — verified that `SettingsModal`, `ImageLightbox`, `ImageCropModal` install their own `window.addEventListener('keydown')` Esc handlers but do NOT call `e.stopPropagation()`, so without this gate a single Esc would close the modal AND exit full-screen in one keystroke:

```ts
if (e.key === 'Escape') {
  // Defer to any open modal — let it consume Esc first. The modals'
  // own keydown handlers will close them; on the next Esc we'll see
  // these flags as false and proceed.
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

`lightboxOpen` is read from `useLightboxStore`; `settingsOpen` and `recoveryData` are existing local state. The implementation plan should verify these reads are within the closure.

Add `fullScreen`, `settingsOpen`, `lightboxOpen`, `recoveryData`, and `connectMode` to the dependency array of the existing `useEffect` (currently lines 307-321). The existing dep array omits `connectMode` even though the existing Esc branch reads it — that's a pre-existing latent bug that this work fixes incidentally. While editing the dep array, audit other reads in the handler and add anything else missing.

**Modal coexistence behavior:** with the modal-state gate above, pressing Esc with a modal open does nothing at the App level — only the modal's own Esc handler fires, closing the modal. A subsequent Esc exits full-screen.

**Caveat: `RecoveryPrompt` has no Esc handler.** It's gated by `recoveryData !== null` in our check, so Esc won't accidentally exit full-screen while the prompt is up — but the user has no Esc-to-dismiss for the prompt itself. Out of scope for this work; flagged as a separate small TODO in the test plan.

### Canvas redraw fix

Replace `src/components/Canvas/Canvas.tsx:130-144`:

```ts
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

The previous `window.resize` listener can be dropped — `ResizeObserver` fires on *any* container size change, including window resize (because the container is a flex child whose size depends on the window). Tested on Chrome/Safari/Firefox; React 19 + react-konva have no special teardown order issues with `ResizeObserver`.

This fix is independent of full-screen — it's the root cause of the "transcript collapse doesn't redraw" bug and lands in the same sub-project for atomicity.

## Files

- `src/App.tsx` — `fullScreen` + `toolbarHovered` + `showHint` state, layout-switch render, `F`/`Esc` keybindings, dependency-array update.
- `src/components/Canvas/Canvas.tsx` — replace `window.resize` listener with `ResizeObserver` on `containerRef`.

## Testing

### Unit tests

None. The full-screen state lives in `App.tsx` as React state and the hover behavior is DOM-event-driven; both are awkward to test without a full DOM harness, and the project doesn't currently use one for component tests.

### Manual verification (browser)

After implementation:

1. **Enter / exit.** Press `F` → all chrome disappears, Canvas fills viewport. Hint chip "Press F or Esc to exit" appears bottom-right and fades out after ~2.5s. Press `F` again → normal restored. Press `F`, then `Esc` → exits.
2. **Hover-toolbar reveal.** In full-screen, move mouse to top edge → toolbar slides down within ~200ms. All buttons (Save, Undo, Zoom, Export) functional.
3. **Hover-toolbar retract.** Move mouse off the toolbar (down or sideways) → slides back up after the 150ms debounce.
4. **Tooltip absorption.** Hover an icon button so its tooltip pops below; move mouse onto the tooltip → toolbar should NOT retract (24px padding + debounce catch it).
5. **Auto-hide on canvas interaction.** With toolbar revealed, click anywhere on canvas → toolbar retracts immediately. Clicking a button on the toolbar itself does NOT retract (stopPropagation).
6. **Canvas redraw on transcript collapse (the original bug).** In *normal* mode, load a transcript, click the panel's `X` to collapse → Canvas reflows to fill recovered space. Drag an element to the new far-right edge; should still be reachable. Re-expand via the right-edge pill → Canvas reflows back.
7. **Keyboard shortcuts intact.** In full-screen, verify `Cmd+S` saves, `Cmd+Z` undoes, `Cmd+0` fits, `Cmd+±` zooms, `C` enters connect mode, `F` toggles full-screen even with connect-mode active.
8. **`Cmd+F` does NOT toggle full-screen.** Press `Cmd+F` (or `Ctrl+F`) → browser's find bar opens; full-screen state unchanged. Same for `Shift+F`, `Alt+F`.
9. **Typing safety.** Open Settings (toolbar must be visible — hover top), type in a settings input, press `f` → full-screen does NOT toggle.
10. **Modal coexistence.** With Settings open, press `F` → full-screen toggles (Settings remains visible/functional). Press `Esc` → closes Settings only; full-screen still active. Press `Esc` again → exits full-screen. Same for `ImageLightbox`. With `RecoveryPrompt` showing, `Esc` does nothing (no handler) but also doesn't accidentally exit full-screen.
11. **Marquee survives the swap.** Mid-marquee-drag, press `F` → marquee continues; mouse-up finishes it cleanly with the expected selection. (Trivially safe with CSS-toggle layout — Canvas never unmounts.)
12. **Sticky-group drag survives the swap.** Mid-drag of an Argument with a cluster cached, press `F` → cluster supports continue following the cursor through the layout change; mouse-up commits the move via `moveCluster`. (Trivially safe — Canvas's `stickyDragRef` is preserved.)
13. **Inline editor survives the swap.** Double-click an element to enter inline edit, press `F` → editor still active and focused (the input-focus guard prevents the F from toggling); finish typing and press Enter → text saves. (The CSS-toggle layout keeps the editor mounted.)
14. **Keyboard navigation reveals toolbar.** In full-screen, press `Tab` to focus a toolbar button → toolbar slides in via `onFocus`. Press `Tab` to walk through toolbar buttons → toolbar stays revealed. Press `Tab` past the last button (focus exits the toolbar) → toolbar retracts (after the 150ms debounce).
15. **Reduced motion.** With OS "Reduce Motion" enabled, toggle `F` → toolbar appears/disappears instantly (no slide); hint chip is instant fade. Without the OS preference, animations play normally.
16. **Tab focus during normal mode.** Confirm tabbing through the page in normal mode does NOT trigger any full-screen-only handlers (the `onFocus` is only attached when `fullScreen === true`).

## Tunable parameters

These live as named constants (or inline magic numbers — implementation plan picks the cleaner form):

- `HOVER_ZONE_HEIGHT = 12` — top-edge wake strip in pixels.
- `TOOLBAR_TOOLTIP_PADDING = 24` — bottom padding on the toolbar wrapper to absorb tooltip overlap.
- `TOOLBAR_SLIDE_MS = 180` — slide animation duration.
- `TOOLBAR_RETRACT_DEBOUNCE_MS = 150` — debounce on `onMouseLeave` / `onBlur` before retracting.
- `HINT_DURATION_MS = 2500` — entry hint visibility duration.
- `HINT_FADE_MS = 400` — entry hint fade-out duration.

If usability feedback shows the hover zone needs to be taller (e.g., for users with imprecise tracking) or the retract debounce too aggressive/lenient, these are one-line adjustments.
