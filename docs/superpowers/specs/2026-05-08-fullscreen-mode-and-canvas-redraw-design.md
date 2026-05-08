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
- Touch / mobile gestures for revealing the toolbar.
- Rolling in the queued transcript-panel-cleanup sub-project (in-app Clear-transcript affordance, redundant toolbar buttons). Stays separate.

## Design

### State

In `src/App.tsx`:

```ts
const [fullScreen, setFullScreen] = useState(false);
const [toolbarHovered, setToolbarHovered] = useState(false);
```

`fullScreen` is the mode toggle. `toolbarHovered` controls the slide-in/out of the floating toolbar; only meaningful when `fullScreen === true`.

### Layout switch

`App.tsx`'s render becomes a top-level conditional:

```tsx
return (
  <div className="h-screen flex flex-col bg-gray-50">
    {/* Hidden file inputs, modals, lightbox — unchanged */}
    {fullScreen ? (
      /* FullScreenLayout block — see below */
    ) : (
      /* Existing NormalLayout — unchanged */
    )}
    {/* Modals stay outside the conditional so they overlay both modes */}
  </div>
);
```

The "existing NormalLayout" is everything from line 340 (`<Toolbar ... />`) through line 375 (`<PropertiesPanel />`) of the current `App.tsx`. No changes to that path.

### FullScreenLayout

A new render block (inline in `App.tsx`, or extracted into a small `FullScreenLayout` component — implementation plan picks whichever reads cleanest):

```tsx
<div
  className="flex-1 relative overflow-hidden"
  onMouseDown={() => setToolbarHovered(false)}
>
  <Canvas
    connectMode={connectMode}
    onConnectionStart={handleConnectionStart}
    connectingFrom={connectingFrom}
  />

  {/* Hover zone — 12px transparent strip at the very top.
      Wakes the toolbar from its hidden state. */}
  <div
    className="absolute top-0 left-0 right-0 z-20"
    style={{ height: 12 }}
    onMouseEnter={() => setToolbarHovered(true)}
  />

  {/* Toolbar overlay — slides in from above on toolbarHovered.
      24px transparent padding-bottom absorbs tooltip overlap.
      stopPropagation on mouseDown prevents the parent's "retract on click"
      from firing when the user clicks a toolbar button. */}
  <div
    className="absolute top-0 left-0 right-0 z-30"
    style={{
      transform: toolbarHovered ? 'translateY(0)' : 'translateY(-100%)',
      transition: 'transform 180ms ease',
      paddingBottom: 24,
      boxShadow: toolbarHovered ? '0 2px 12px rgba(0,0,0,0.15)' : 'none',
    }}
    onMouseLeave={() => setToolbarHovered(false)}
    onMouseDown={(e) => e.stopPropagation()}
  >
    <Toolbar
      onLoadTranscript={handleLoadTranscriptClick}
      transcriptPanelOpen={transcriptPanelOpen}
      onToggleTranscriptPanel={toggleTranscriptPanel}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  </div>

  {/* Entry hint — fades out after 2.5s */}
  {showHint && (
    <div
      className="absolute bottom-4 right-4 z-40 px-3 py-1.5 rounded-md text-xs"
      style={{
        background: 'rgba(0, 0, 0, 0.75)',
        color: 'white',
        transition: 'opacity 400ms ease',
      }}
    >
      Press F or Esc to exit
    </div>
  )}
</div>
```

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
// Full-screen toggle: F (no modifier)
if (e.key === 'f' || e.key === 'F') {
  e.preventDefault();
  setFullScreen((prev) => !prev);
  setToolbarHovered(false);  // reset on every toggle
  return;
}
```

Modify the existing `Escape` handler (around line 297-302) so it exits full-screen first if active, otherwise falls through to the existing connect-mode cancellation:

```ts
if (e.key === 'Escape') {
  if (fullScreen) {
    setFullScreen(false);
    setToolbarHovered(false);
    return;
  }
  if (connectMode) {
    setConnectMode(false);
    setConnectingFrom(null);
  }
}
```

Add `fullScreen` to the dependency array of the existing `useEffect` (currently lines 307-321) so the keyboard handler re-binds when the mode changes.

**Modal coexistence:** if Settings, ImageLightbox, or RecoveryPrompt is open and the user presses `Esc`, the modal closes first (modals install their own document-level `Esc` handlers and call `e.stopPropagation()` — verify in implementation plan; if a modal doesn't, fix it there). A second `Esc` exits full-screen.

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
3. **Hover-toolbar retract.** Move mouse off the toolbar (down or sideways) → slides back up after exiting its bounds.
4. **Tooltip absorption.** Hover an icon button so its tooltip pops below; move mouse onto the tooltip → toolbar should NOT retract (24px padding catches it).
5. **Auto-hide on canvas interaction.** With toolbar revealed, click anywhere on canvas → toolbar retracts immediately.
6. **Canvas redraw on transcript collapse (the original bug).** In *normal* mode, load a transcript, click the panel's `X` to collapse → Canvas reflows to fill recovered space. Drag an element to the new far-right edge; should still be reachable. Re-expand via the right-edge pill → Canvas reflows back.
7. **Keyboard shortcuts intact.** In full-screen, verify `Cmd+S` saves, `Cmd+Z` undoes, `Cmd+0` fits, `Cmd+±` zooms, `C` enters connect mode, `F` toggles full-screen even with connect-mode active.
8. **Typing safety.** Open Settings (toolbar must be visible — hover top), type in a settings input, press `f` → full-screen does NOT toggle.
9. **Modal coexistence.** With Settings or ImageLightbox open, press `F` → full-screen toggles, modal stays visible and functional. Press `Esc` → closes the modal first; second `Esc` exits full-screen.
10. **Marquee survives the swap.** Mid-marquee-drag, press `F` → marquee finishes cleanly on mouse-up.

## Tunable parameters

These live as named constants (or inline magic numbers — implementation plan picks the cleaner form):

- `HOVER_ZONE_HEIGHT = 12` — top-edge wake strip in pixels.
- `TOOLBAR_TOOLTIP_PADDING = 24` — bottom padding on the toolbar wrapper to absorb tooltip overlap.
- `TOOLBAR_SLIDE_MS = 180` — slide animation duration.
- `HINT_DURATION_MS = 2500` — entry hint visibility duration.
- `HINT_FADE_MS = 400` — entry hint fade-out duration.

If usability feedback shows the hover zone needs to be taller (e.g., for users with imprecise tracking) or the tooltip padding needs to be larger (some tooltips overflow more), these are one-line adjustments.
