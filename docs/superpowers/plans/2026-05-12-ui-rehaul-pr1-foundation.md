# UI rehaul · PR 1 — Sage Garden foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Deep Void dark theme with the Sage Garden light theme across all chrome — toolbar, side panels, modals, hint pills — while keeping the canvas and every rendered element pixel-identical. Land an audit-and-migration PR that turns the chrome sage without touching any functional behavior.

**Architecture:** Token swap inside `src/utils/theme.ts` plus a rewrite of `src/index.css` `:root` CSS variables. Most components reference theme keys by shape (`theme.sidebar.bg`, `theme.input.text`); preserving those shapes while changing their values turns most files sage automatically. A handful of files use removed keys (`theme.colors.void[*]`, `theme.colors.error`, `theme.colors.accent.glow`), hardcoded hex literals (Catppuccin `#45475a` / `#313244`, `rgba(0,0,0,0.6)` etc.), or Tailwind color utilities — those get targeted edits. The verification gate is a grep that returns zero forbidden patterns in chrome files plus a visual regression check confirming the canvas + elements are pixel-identical.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind CSS, Zustand, Konva (untouched), Inter font (already loaded).

**Spec:** `docs/superpowers/specs/2026-05-12-ui-rehaul-design.md` (v4). This plan implements PR 1 only.

**Sealed (do not touch in this PR):**
- `src/utils/colors.ts`
- `src/components/Canvas/**` (Konva-rendered shapes, marquee `SelectionRect.tsx`, etc.)
- The Konva-rendered preview content inside `src/components/Settings/StylePreview.tsx` (lines 92–140 — the `<Stage>` + `<Group>` block). Only its wrapper styling migrates.

---

## File map

**Rewrite (two files):**
- `src/utils/theme.ts` — entire file replaced with the Sage Garden token export. Preserves the existing API surface (`theme.sidebar.*`, `theme.toolbar.*`, etc.) so most consumers don't need source edits.
- `src/index.css` — `:root` CSS-variable block and any selectors that reference Deep Void variables.

**Targeted edits (16 files — all because of removed keys, hardcoded values, or Tailwind color utilities):**
- `src/App.tsx` — Tailwind `bg-gray-50`, three Tailwind `z-*` utilities, hardcoded `rgba(0,0,0,0.15)` shadow, hardcoded full-screen hint pill `rgba(0, 0, 0, 0.75)` + `color: 'white'`.
- `src/components/Toolbar/Toolbar.tsx` — `theme.colors.error` reference (line 268), hardcoded `rgba(239, 68, 68, 0.15)` (line 274).
- `src/components/Toolbar/AboutModal.tsx` — `bg-black/60 backdrop-blur-sm` backdrop (line 42), hardcoded Catppuccin hex `hover:bg-[#45475a]` (line 63), `bg-[#313244]/50` (line 141).
- `src/components/Toolbar/ImageImportModal.tsx` — extensive Tailwind color utilities throughout (`bg-white`, `dark:bg-gray-900`, `text-gray-700`, `bg-blue-600`, `bg-gray-200`, `bg-blue-500`, `bg-black/50`, etc., approximately 10+ sites). Migrate to inline `style={{...}}` driven by `theme.ts` tokens.
- `src/components/Settings/SettingsModal.tsx` — `theme.colors.void[950]` (line 144), `hover:bg-white/10` (line 85).
- `src/components/Settings/SettingsSidebar.tsx` — `focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 hover:bg-white/5` (line 24). Multiple forbidden utilities.
- `src/components/Settings/SubtypeListEditor.tsx` — `hover:bg-white/10` (line 163).
- `src/components/Settings/StylePreview.tsx` — `theme.colors.void[950]` (line 84). Wrapper styling only; the Konva content stays untouched.
- `src/components/Palette/Palette.tsx` — `theme.colors.void[950]` (lines 202, 225), `theme.colors.accent.glow` (line 203).
- `src/components/RecoveryPrompt.tsx` — hardcoded scrim `rgba(0, 0, 0, 0.6)` (line 15), `z-50` Tailwind.
- `src/components/Properties/ImageUpload.tsx` — `bg-black/50`, `bg-white/20`, `bg-white/30`, `bg-red-500/50` on overlay buttons (lines 100, 103, 110, 117).
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx` — hardcoded `#10141c` (line 130).
- `src/components/ImageEditor/ImageLightbox.tsx` — `hover:bg-white/10` (line 49). The lightbox keeps its dark-backdrop styling (per spec §7.2 — image-viewing exception); only the Tailwind utility is migrated to inline rgba so it doesn't trip the audit grep.
- `src/components/ui/Tooltip.tsx` — hardcoded shadow `rgba(0, 0, 0, 0.3)` (line 56), `z-50` Tailwind.

**Touched only via `theme.ts` value swap (no source edits required, but visually verified):**
- `src/components/Settings/TypeStyleEditor.tsx`
- `src/components/TranscriptPanel/TranscriptPanel.tsx`
- `src/components/Properties/PropertiesPanel.tsx` (uses `theme.input.*`, `theme.properties.*`, `theme.sidebar.*` — all preserved-shape keys)

**Deferred to PR 5 (Canvas.tsx HTML overlays — not Konva):**
- `src/components/Canvas/Canvas.tsx:839` connect-mode banner (`bg-blue-500 text-white`)
- `src/components/Canvas/Canvas.tsx:850` pan-mode banner (`bg-gray-700 text-white`)

These are HTML overlay banners inside Canvas.tsx, not Konva-rendered. Per the spec, PR 1's off-limits is the entire `Canvas/**` directory; touching even non-Konva chrome inside it is reserved for PR 5 (which already touches `Canvas/Canvas.tsx` for the empty-state overlay). They will look briefly out of place after PR 1 ships (blue/grey banners on sage chrome), but they functionally work and migrate cleanly in PR 5. The audit grep in Task 13 excludes the `Canvas/` path so this is not a verification failure.

---

## Task 1: Rewrite `src/utils/theme.ts` to Sage Garden

**Files:**
- Modify: `src/utils/theme.ts` (full rewrite, 186 lines → ~160 lines)

The new file preserves every key currently exported (so consumers don't need edits), changes their values to Sage Garden, and adds three new groups: `z` (z-index ladder), `focus` (focus-ring tokens), `accentStrong` (4.5:1-passing primary button background).

- [ ] **Step 1: Read the current file for the full export shape**

Run: `cat src/utils/theme.ts | head -200`

Confirm the top-level keys exported under `theme`: `colors`, `sidebar`, `canvas`, `toolbar`, `properties`, `input`, `button`, `selection`, `spacing`, `radius`, `transition`, `shadow`, `glass`. Note that `colors` has subkeys `void`, `text`, `accent`, `secondary`, `highlight`, `success`, `warning`, `error`, `info`. Note that `cssVars` is also exported at the bottom (lines 178–186).

- [ ] **Step 2: Replace `src/utils/theme.ts` with the Sage Garden version**

Use the `Write` tool to overwrite the file with the content below. Every existing key is preserved (with new sage values) so callers that read `theme.sidebar.bg`, `theme.input.text`, etc. don't need source edits. Removed-from-Deep-Void keys (`colors.void.*`, `colors.error`, `colors.accent.glow`, `glass.*`) are kept as compatibility aliases that map to sensible Sage values, so any stray callers don't crash — the targeted-edit tasks below remove the *call sites* that reference these keys.

```ts
/**
 * Sage Garden Theme
 * Light, warm, calm. Replaces the previous Deep Void dark theme.
 * Canvas + element rendering are intentionally not part of this theme — they
 * live in src/utils/colors.ts and stay sealed.
 */

export const theme = {
  // Core palette — Sage Garden tokens
  colors: {
    // Compatibility shim: void.* mapped to sage values so any stray caller
    // doesn't crash. Call sites that referenced void.* are migrated to
    // theme.colors.text.primary by the targeted-edit tasks; this object will
    // be deleted in a future cleanup.
    void: {
      950: '#2a3324', // was deepest black, now darkest sage = primary text
      900: '#2a3324',
      850: '#4a5a3c',
      800: '#4a5a3c',
      700: '#6b7c54',
      600: '#d6dfca',
      500: '#c9d4be',
      400: '#c9d4be',
    },
    // Text hierarchy — all pass WCAG AA on chrome-bg #f8faf4
    text: {
      primary: '#2a3324',    // 11.4:1
      secondary: '#4a5a3c',  // 5.85:1
      tertiary: '#4a5a3c',   // collapsed to secondary (old tertiary failed AA)
      muted: '#4a5a3c',      // collapsed to secondary (old muted failed AA)
    },
    // Accent — sage with strong variant for buttons (white text on accentStrong = 9.8:1)
    accent: {
      50: '#f0f4eb',
      100: '#e7ede0',
      200: '#dbe5cf',
      300: '#c4d4a8',
      400: '#8a9778',
      500: '#6b7c54',   // primary accent (for non-text decorative use)
      600: '#5a6b46',   // hover
      700: '#3d4a32',   // accent-strong — primary button background
      glow: 'rgba(107, 124, 84, 0.15)',       // compatibility shim
      glowStrong: 'rgba(107, 124, 84, 0.25)', // compatibility shim
    },
    // Warm clay secondary
    secondary: '#8a6f47',
    highlight: '#b8862b',
    // Semantic colors
    success: '#5a8a3a',
    warning: '#8a6f47',
    error: '#b23a48',     // = danger; the old `error` callsite gets migrated
    info: '#6b7c54',
  },

  sidebar: {
    bg: '#f0f4eb',
    bgGradient: 'linear-gradient(180deg, #f0f4eb 0%, #f4f7f1 100%)',
    surface: '#ffffff',
    surfaceHover: '#fafcf6',
    surfaceActive: '#e7ede0',
    text: '#2a3324',
    textSecondary: '#4a5a3c',
    muted: '#4a5a3c',
    accent: '#6b7c54',
    accentHover: '#5a6b46',
    accentText: '#ffffff',
    border: '#d6dfca',
    borderSubtle: '#eaeee2',
    hover: '#e7ede0',
    shadow: '0 1px 3px rgba(50, 65, 30, 0.08)',
  },

  canvas: {
    bg: '#fafafa',
    bgAlt: '#f5f5f5',
    grid: '#e5e5e5',
    gridMajor: '#d4d4d4',
  },

  toolbar: {
    bg: '#f8faf4',
    bgGradient: 'linear-gradient(180deg, #f8faf4 0%, #f4f7f1 100%)',
    border: '#d6dfca',
    shadow: '0 1px 3px rgba(50, 65, 30, 0.06)',
  },

  properties: {
    bg: '#f8faf4',
    bgGradient: 'linear-gradient(0deg, #f4f7f1 0%, #f8faf4 100%)',
    border: '#d6dfca',
    shadow: '0 -1px 3px rgba(50, 65, 30, 0.06)',
  },

  // Form controls — sage focus states
  input: {
    bg: '#ffffff',
    bgHover: '#fafcf6',
    bgFocus: '#ffffff',
    border: '#d6dfca',
    borderHover: '#c9d4be',
    borderFocus: '#6b7c54',
    text: '#2a3324',
    placeholder: '#4a5a3c',
    ring: 'rgba(107, 124, 84, 0.3)',
  },

  // Button variants — primary uses accentStrong for AA contrast
  button: {
    primary: {
      bg: '#3d4a32',   // accent-strong
      bgHover: '#2f3a26',
      text: '#ffffff',
    },
    secondary: {
      bg: '#ffffff',
      bgHover: '#fafcf6',
      text: '#4a5a3c',
      border: '#d6dfca',
    },
    ghost: {
      bg: 'transparent',
      bgHover: '#e7ede0',
      text: '#4a5a3c',
    },
    danger: {
      bg: '#b23a48',
      bgHover: '#9a2f3c',
      text: '#ffffff',
    },
  },

  // Selection + focus
  selection: {
    bg: 'rgba(107, 124, 84, 0.15)',
    border: '#6b7c54',
    ring: '0 0 0 2px rgba(107, 124, 84, 0.3)',
  },

  // New in PR 1: focus-ring tokens
  focus: {
    ring: '#2a3324',           // outline on chrome backgrounds; 2px outline + 2px outline-offset mandatory
    ringOnDark: '#ffffff',     // fallback for elements flush against dark bg (e.g., focused primary button)
  },

  // New in PR 1: explicit danger surface tokens
  danger: {
    fg: '#b23a48',
    bg: '#fbe6e0',
    border: '#e6b8b8',
  },

  // Spacing scale (pixels)
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 },

  // Border radius
  radius: { sm: 4, md: 6, lg: 8, xl: 12, full: 9999 },

  // Transitions
  transition: {
    fast: '100ms ease-out',
    normal: '150ms ease-out',
    slow: '250ms ease-out',
  },

  // Shadows — sage-tinted instead of pure black
  shadow: {
    sm: '0 1px 3px rgba(50, 65, 30, 0.08)',
    md: '0 4px 12px rgba(50, 65, 30, 0.10)',
    lg: '0 12px 32px rgba(50, 65, 30, 0.15)',
    xl: '0 24px 60px rgba(50, 65, 30, 0.18)',
    glow: '0 0 12px rgba(107, 124, 84, 0.12)',
  },

  // Modal scrim
  scrim: 'rgba(50, 65, 30, 0.32)',

  // Compatibility shim — old `glass` keys mapped to sage values
  glass: {
    bg: 'rgba(244, 247, 241, 0.85)',
    border: 'rgba(214, 223, 202, 0.7)',
    blur: 'blur(12px)',
  },

  // New in PR 1: explicit z-index ladder. All layering reads from these tokens.
  z: {
    canvasBg: 0,
    canvasOverlay: 1,
    panel: 'auto' as const,
    toolbar: 10,
    hoverZone: 20,
    fsToolbar: 30,
    dropdown: 40,
    fsHint: 50,
    modalScrim: 1000,
    modal: 1001,
    lightbox: 1100,
    toast: 2000,
  },
};

// CSS custom properties — kept for consumers that read CSS variables.
export const cssVars = {
  '--color-bg': theme.sidebar.bg,
  '--color-surface': theme.sidebar.surface,
  '--color-text': theme.sidebar.text,
  '--color-text-secondary': theme.sidebar.textSecondary,
  '--color-text-muted': theme.sidebar.muted,
  '--color-accent': theme.sidebar.accent,
  '--color-border': theme.sidebar.border,
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: passes. If any consumer references a `theme.*` key not present in the new file, fix that consumer (it should be one of the files in §"Targeted edits" — handled by later tasks).

- [ ] **Step 4: Start dev server and visually confirm chrome turned sage**

Run: `npm run dev` (leave running in another terminal).
Open the app at http://localhost:5173 (or whatever port Vite reports). Confirm:
- Toolbar background is light sage, not dark navy.
- Palette sidebar background is light sage.
- Properties bottom strip is light sage.
- Canvas is still white with the existing dotted grid.
- Existing diagram (if any) still renders with contributor-colored borders and white fills.

Do **not** commit yet — there will still be visual oddities (e.g., red `Trash` hover in Toolbar, dark-blue buttons in ImageImportModal, hardcoded scrim on Recovery prompt). Those land in later tasks.

---

## Task 2: Rewrite `src/index.css` `:root` and selector colors

**Files:**
- Modify: `src/index.css` (lines ~1–80 contain Deep Void definitions; subsequent selectors may reference them)

The current file imports Tailwind, then defines `:root` custom properties for Deep Void, then has selectors (`html`, `body`, scrollbar, `::selection`, etc.) that use those variables. We rewrite `:root` to Sage Garden and update any selectors that still reference removed variable names.

- [ ] **Step 1: Read the file in full**

Use the `Read` tool on `src/index.css`. Note every selector that uses a `var(--void-*)` / `var(--accent-*)` / `var(--text-*)` / `var(--secondary)` / `var(--highlight)` reference. Note any selector with a hardcoded Deep Void hex.

- [ ] **Step 2: Replace the `:root` block with Sage Garden tokens**

Use the `Edit` tool. Replace the existing `:root { ... }` block (the one starting around line 8 with `--void-950` etc.) with:

```css
:root {
  /* Sage Garden — light theme tokens. See src/utils/theme.ts for the
     authoritative source; CSS vars mirror the most-used values for
     selectors that can't easily access the TS theme. */

  /* Surfaces */
  --app-bg: #f4f7f1;
  --chrome-bg: #f8faf4;
  --sidebar-bg: #f0f4eb;

  /* Borders */
  --border: #d6dfca;
  --border-strong: #c9d4be;

  /* Text (all WCAG AA on chrome-bg) */
  --text: #2a3324;
  --text-secondary: #4a5a3c;

  /* Accent */
  --accent: #6b7c54;
  --accent-strong: #3d4a32;
  --accent-warm: #8a6f47;

  /* States */
  --hover: #e7ede0;
  --active: #dbe5cf;

  /* Danger */
  --danger: #b23a48;
  --danger-bg: #fbe6e0;
  --danger-border: #e6b8b8;

  /* Focus ring */
  --focus-ring: #2a3324;
  --focus-ring-on-dark: #ffffff;

  /* Modal scrim */
  --scrim: rgba(50, 65, 30, 0.32);

  /* Transitions (preserved from old file) */
  --transition-fast: 100ms ease-out;
  --transition-normal: 150ms ease-out;
  --transition-slow: 250ms ease-out;
}
```

- [ ] **Step 3: Update every selector that still references a removed variable**

In the rest of `src/index.css`, search for `--void-`, `--accent-glow`, `--accent-hover`, `--secondary`, `--highlight`, `--text-primary`, `--text-tertiary`, `--text-muted`. For each, replace with the appropriate new variable:

| Old | New |
|---|---|
| `var(--void-950)` / `var(--void-900)` / `var(--void-850)` | `var(--app-bg)` (or `var(--chrome-bg)` if the surface is toolbar-like) |
| `var(--void-800)` / `var(--void-700)` | `var(--sidebar-bg)` (or `var(--hover)` for hover surfaces) |
| `var(--void-600)` / `var(--void-500)` / `var(--void-400)` | `var(--border)` (or `var(--border-strong)`) |
| `var(--text-primary)` | `var(--text)` |
| `var(--text-secondary)` | `var(--text-secondary)` (no change) |
| `var(--text-tertiary)` / `var(--text-muted)` | `var(--text-secondary)` (collapsed for AA) |
| `var(--accent)` | `var(--accent)` (no change — value updates via :root) |
| `var(--accent-hover)` | inline literal `#5a6b46` (no new var; rarely used) |
| `var(--accent-glow)` / `var(--accent-glow-strong)` | delete the declaration entirely — no sage equivalent |
| `var(--secondary)` / `var(--highlight)` | inline literal from theme.ts compatibility shim, OR delete if unused |

Body / scrollbar / `::selection` selectors should now end up with light backgrounds and dark text. If any selector hardcodes a Deep Void hex directly (e.g., `background: #050a14`), replace with the appropriate var.

- [ ] **Step 4: Type-check + dev-server smoke check**

Run: `npx tsc --noEmit` (no errors).
Reload the dev server tab. The body / html background should now be sage (`--app-bg`). Scrollbars should look light (browser default is fine if the file's scrollbar styling no longer makes sense).

- [ ] **Step 5: Stage the two foundation files (no commit yet)**

Run: `git add src/utils/theme.ts src/index.css`. Do not commit — PR 1 lands as a single atomic commit at Task 16.

---

## Task 3: Migrate `src/App.tsx`

**Files:**
- Modify: `src/App.tsx` (specific lines noted below)

Five distinct edits: Tailwind `bg-gray-50`, three Tailwind `z-*` utilities, hardcoded full-screen shadow, hardcoded full-screen hint pill.

- [ ] **Step 1: Add `theme` import if not already present**

Open `src/App.tsx`. The file already imports `theme` (line 15: `import { theme } from './utils/theme';`). Confirm. No new imports needed.

- [ ] **Step 2: Edit 1 — remove `bg-gray-50` Tailwind class on root `<div>`**

Find (around line 398):
```tsx
<div className="h-screen flex flex-col bg-gray-50 relative">
```
Replace with:
```tsx
<div className="h-screen flex flex-col relative" style={{ backgroundColor: theme.sidebar.bg }}>
```

(`theme.sidebar.bg` = `#f0f4eb` = the sage app background.)

- [ ] **Step 3: Edit 2 — migrate three Tailwind `z-*` utilities to named z-index tokens**

Find (around line 420):
```tsx
className={fullScreen ? 'absolute top-0 left-0 right-0 z-30' : 'relative'}
```
Replace with:
```tsx
className={fullScreen ? 'absolute top-0 left-0 right-0' : 'relative'}
style={fullScreen ? { ...existingStyle, zIndex: theme.z.fsToolbar } : existingStyle}
```

Note: the existing `style={...}` block (lines 421–430) already exists with a conditional. Merge the `zIndex: theme.z.fsToolbar` into the full-screen branch of that style object. Concretely, change the style object's full-screen branch from:
```ts
{
  transform: toolbarHovered ? 'translateY(0)' : 'translateY(-100%)',
  transition: prefersReducedMotion ? 'none' : 'transform 180ms ease',
  paddingBottom: 24,
  boxShadow: toolbarHovered ? '0 2px 12px rgba(0,0,0,0.15)' : 'none',
}
```
to:
```ts
{
  zIndex: theme.z.fsToolbar,
  transform: toolbarHovered ? 'translateY(0)' : 'translateY(-100%)',
  transition: prefersReducedMotion ? 'none' : 'transform 180ms ease',
  paddingBottom: 24,
  boxShadow: toolbarHovered ? theme.shadow.md : 'none',
}
```
(This bundles **Edit 4** — the hardcoded shadow — into the same edit.)

Find (around line 489):
```tsx
className="absolute top-0 left-0 right-0 z-20"
```
Replace with:
```tsx
className="absolute top-0 left-0 right-0"
style={{ height: 12, zIndex: theme.z.hoverZone }}
```
(merge with the existing `style={{ height: 12 }}` on the next line.)

Find (around line 498):
```tsx
className="absolute bottom-4 right-4 z-40 px-3 py-1.5 rounded-md text-xs pointer-events-none"
```
Replace with:
```tsx
className="absolute bottom-4 right-4 px-3 py-1.5 rounded-md text-xs pointer-events-none"
```
(remove `z-40`; merge `zIndex: theme.z.fsHint` into the existing `style={{...}}` block on the next lines.)

- [ ] **Step 4: Edit 5 — migrate the full-screen entry hint pill colors**

Find (around line 499–505):
```tsx
style={{
  background: 'rgba(0, 0, 0, 0.75)',
  color: 'white',
  transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease',
}}
```
Replace with:
```tsx
style={{
  zIndex: theme.z.fsHint,
  background: theme.sidebar.bg,
  color: theme.sidebar.text,
  border: `1px solid ${theme.sidebar.border}`,
  boxShadow: theme.shadow.sm,
  transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease',
}}
```

- [ ] **Step 5: Type-check + visual smoke**

Run: `npx tsc --noEmit`. Reload dev server. Open the app, enter full-screen (`F`), confirm:
- The page background is sage (no more grey-50).
- The full-screen entry hint pill is now light (sage bg, dark text, subtle border), not the previous black/white pill.
- Hovering the top of the screen reveals the toolbar correctly, with a subtle sage shadow instead of a dark black shadow.

- [ ] **Step 6: Stage**

Run: `git add src/App.tsx`. No commit yet.

---

## Task 4: Migrate `src/components/Toolbar/Toolbar.tsx`

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx` (lines 263–278 — the `IconButton` style block)

The `IconButton` subcomponent inside `Toolbar.tsx` has two Deep-Void-specific references that need migration: `theme.colors.error` and a hardcoded danger-hover `rgba(239, 68, 68, 0.15)`.

- [ ] **Step 1: Read lines 230–290 of `Toolbar.tsx` for context**

Use the `Read` tool with `offset: 230, limit: 60`.

- [ ] **Step 2: Apply the two edits**

Find (around line 267–278):
```tsx
style={{
  color: variant === 'danger' && isHovered
    ? theme.colors.error
    : theme.sidebar.text,
  backgroundColor: isActive
    ? theme.sidebar.surfaceHover
    : isHovered
      ? variant === 'danger'
        ? 'rgba(239, 68, 68, 0.15)'
        : theme.sidebar.surfaceHover
      : 'transparent',
  transform: isHovered && !disabled ? 'scale(1.05)' : 'scale(1)',
}}
```
Replace with:
```tsx
style={{
  color: variant === 'danger' && isHovered
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
```

- [ ] **Step 3: Type-check + visual smoke**

Run: `npx tsc --noEmit`. Reload dev server. Hover the `Trash2` (Clear diagram) icon button in the toolbar — confirm it now shows a soft pink-clay hover (`#fbe6e0` bg + `#b23a48` icon) instead of the bright red of the Deep Void theme.

- [ ] **Step 4: Stage**

Run: `git add src/components/Toolbar/Toolbar.tsx`. No commit yet.

---

## Task 5: Migrate `src/components/Toolbar/AboutModal.tsx`

**Files:**
- Modify: `src/components/Toolbar/AboutModal.tsx` (lines 63, 141 — Catppuccin hex)

Two hardcoded Catppuccin Mocha hex literals embedded as Tailwind arbitrary-value utilities. Replace each with sage-theme styling via `style={{...}}`.

- [ ] **Step 1: Edit the backdrop scrim (line 42)**

Find:
```tsx
<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
```
Replace with:
```tsx
<div
  className="absolute inset-0 backdrop-blur-sm"
  style={{ backgroundColor: theme.scrim }}
/>
```

Also remove the `z-50` Tailwind class on the outer wrapper (line 38):
```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center"
  onClick={onClose}
>
```
becomes:
```tsx
<div
  className="fixed inset-0 flex items-center justify-center"
  style={{ zIndex: theme.z.modalScrim }}
  onClick={onClose}
>
```

- [ ] **Step 2: Edit close-button hover background (line 63)**

Find:
```tsx
className="p-1 rounded-lg hover:bg-[#45475a] transition-colors"
```
Replace with:
```tsx
className="p-1 rounded-lg transition-colors"
onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
```

(Tailwind's arbitrary-value `bg-[#hex]` cannot drive its hover from a TS token, so we use inline event handlers. The Toolbar.tsx `IconButton` already uses this pattern.)

- [ ] **Step 3: Edit alternating-row stripe (line 141)**

Find:
```tsx
className={index % 2 === 0 ? 'bg-[#313244]/50' : ''}
```
Replace with:
```tsx
style={index % 2 === 0 ? { backgroundColor: theme.sidebar.hover } : undefined}
```

(Remove the `className` entirely if it was the only class; otherwise keep any non-color classes. In this file, the `className` only carried the bg utility, so it can be removed.)

- [ ] **Step 4: Type-check + smoke**

Run: `npx tsc --noEmit`. Open the About modal from the toolbar (`Info` icon). Confirm: backdrop is sage-tinted (not pure black); alternating shortcut rows show subtle sage striping (not dark Catppuccin grey); close-button `×` hover shows a soft sage background.

- [ ] **Step 5: Stage**

Run: `git add src/components/Toolbar/AboutModal.tsx`. No commit yet.

---

## Task 6: Migrate `src/components/Toolbar/ImageImportModal.tsx`

**Files:**
- Modify: `src/components/Toolbar/ImageImportModal.tsx` (extensive — approximately 10 Tailwind color sites across lines 95–164)

This modal has the most Tailwind color usage in the codebase. The fastest reliable approach is to add `import { theme } from '../../utils/theme';` once, then replace every Tailwind color utility with a token-driven inline style.

- [ ] **Step 1: Add the `theme` import**

Find the top of the file (line 1–3):
```tsx
import { useRef, useState, useCallback, useEffect } from 'react';
import { useDiagramStore } from '../../store';
import { importImage, type ImportResult } from '../../utils/imageImport';
```
Add after the third import:
```tsx
import { theme } from '../../utils/theme';
```

- [ ] **Step 2: Migrate the scrim (line 94–95)**

Find:
```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
```
Replace with:
```tsx
<div
  className="fixed inset-0 flex items-center justify-center"
  style={{ backgroundColor: theme.scrim, zIndex: theme.z.modalScrim }}
```

- [ ] **Step 3: Migrate the modal frame (line 98)**

Find:
```tsx
<div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
```
Replace with:
```tsx
<div
  className="rounded-lg max-w-md w-full mx-4 p-6"
  style={{
    backgroundColor: theme.toolbar.bg,
    border: `1px solid ${theme.toolbar.border}`,
    boxShadow: theme.shadow.xl,
    zIndex: theme.z.modal,
  }}
>
```

- [ ] **Step 4: Migrate every `text-gray-*` / `dark:text-gray-*` paragraph**

There are four `<p>` elements with `text-gray-700 dark:text-gray-300` or `text-gray-600 dark:text-gray-400` (lines 102, 106, 122, 144, 159). For each:

Find (example):
```tsx
<p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
```
Replace with:
```tsx
<p className="text-sm mb-3" style={{ color: theme.sidebar.text }}>
```

For the slightly-lighter `text-gray-600 dark:text-gray-400`, use `theme.sidebar.textSecondary` instead.

Apply this to every matching `<p>` in the file.

- [ ] **Step 5: Migrate the Cancel buttons (lines 111, 136, 151, 161)**

These all use `className="px-3 py-1.5 text-sm border rounded-lg"`. The `border` Tailwind class implies a default border color (gray) which is forbidden by §11 of the spec.

For each Cancel button, find:
```tsx
<button onClick={...} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
```
Replace with:
```tsx
<button
  onClick={...}
  className="px-3 py-1.5 text-sm rounded-lg"
  style={{
    backgroundColor: theme.button.secondary.bg,
    color: theme.button.secondary.text,
    border: `1px solid ${theme.button.secondary.border}`,
  }}
>
  Cancel
</button>
```

- [ ] **Step 6: Migrate the Continue / Try-again primary buttons (lines 112–114, 162–167)**

Find:
```tsx
<button onClick={handleAck} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg">
```
Replace with:
```tsx
<button
  onClick={handleAck}
  className="px-3 py-1.5 text-sm rounded-lg"
  style={{
    backgroundColor: theme.button.primary.bg,
    color: theme.button.primary.text,
  }}
>
```

Apply the same pattern to the Try-again button (line 162–167).

- [ ] **Step 7: Migrate the progress bar (lines 146–148)**

Find:
```tsx
<div className="h-1 w-full bg-gray-200 rounded overflow-hidden">
  <div className="h-full bg-blue-500 animate-pulse w-1/2" />
</div>
```
Replace with:
```tsx
<div
  className="h-1 w-full rounded overflow-hidden"
  style={{ backgroundColor: theme.sidebar.borderSubtle }}
>
  <div
    className="h-full animate-pulse w-1/2"
    style={{ backgroundColor: theme.sidebar.accent }}
  />
</div>
```

- [ ] **Step 8: Type-check + smoke**

Run: `npx tsc --noEmit`. Open the Import-image modal from the toolbar. Walk through each state (disclosure → picker → loading → error). Confirm:
- Modal frame is light sage with subtle border.
- Buttons are dark-sage primary (`#3d4a32`) and white-with-sage-border secondary.
- Progress bar fill is sage (`#6b7c54`).
- No blue or dark-grey remnants anywhere.

- [ ] **Step 9: Stage**

Run: `git add src/components/Toolbar/ImageImportModal.tsx`. No commit yet.

---

## Task 7: Migrate `src/components/Settings/SettingsModal.tsx`

**Files:**
- Modify: `src/components/Settings/SettingsModal.tsx` (lines 85, 144)

Two edits: a `theme.colors.void[950]` reference and a `hover:bg-white/10` Tailwind utility.

- [ ] **Step 1: Edit the Save button colors (line 144)**

Find (around line 144):
```tsx
style={{ backgroundColor: theme.sidebar.accent, color: theme.colors.void[950] }}
```
Replace with:
```tsx
style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
```

This swaps both the bg (now using accentStrong via the primary token, 9.8:1 contrast) and the text (white).

- [ ] **Step 2: Edit the close-button hover (line 85)**

Find (around line 85):
```tsx
className="p-1 rounded hover:bg-white/10"
```
Replace with:
```tsx
className="p-1 rounded transition-colors"
onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
```

- [ ] **Step 3: Type-check + smoke**

Run: `npx tsc --noEmit`. Open Settings modal (toolbar gear icon). Confirm: Save button is dark-sage with white text. Close `×` button shows a sage hover background.

- [ ] **Step 4: Stage**

Run: `git add src/components/Settings/SettingsModal.tsx`. No commit yet.

---

## Task 8: Migrate `src/components/Settings/StylePreview.tsx` wrapper

**Files:**
- Modify: `src/components/Settings/StylePreview.tsx` (line 84 only — wrapper styling; Konva content is sealed)

Same single edit pattern as Task 7. The active contributor button uses `theme.colors.void[950]` as its text color when selected.

- [ ] **Step 1: Read lines 75–95 for context**

Use the `Read` tool with `offset: 75, limit: 25`.

- [ ] **Step 2: Apply the edit**

Find (around line 80–87):
```tsx
<button
  key={c}
  onClick={() => handleContributorChange(c)}
  className="px-2 py-1 text-xs rounded"
  style={{
    backgroundColor: contributor === c ? theme.sidebar.accent : theme.sidebar.surface,
    color: contributor === c ? theme.colors.void[950] : theme.sidebar.text,
  }}
>
```
Replace with:
```tsx
<button
  key={c}
  onClick={() => handleContributorChange(c)}
  className="px-2 py-1 text-xs rounded"
  style={{
    backgroundColor: contributor === c ? theme.button.primary.bg : theme.sidebar.surface,
    color: contributor === c ? theme.button.primary.text : theme.sidebar.text,
    border: contributor === c ? 'none' : `1px solid ${theme.sidebar.border}`,
  }}
>
```

- [ ] **Step 3: Type-check + smoke**

Run: `npx tsc --noEmit`. In Settings modal, click an Argument type (e.g. "Claim") and verify the contributor selector buttons render correctly: the active one is dark-sage with white text; the inactive ones are light with sage border. **Critical:** the Konva `<Stage>` element preview below (lines 92–140) must still render with `#0000CD` blue for the Student border, `#228B22` green for Given, etc. — that's the sealed Konva content. If those colors changed, you've touched the wrong lines.

- [ ] **Step 4: Stage**

Run: `git add src/components/Settings/StylePreview.tsx`. No commit yet.

---

## Task 9: Migrate `src/components/Palette/Palette.tsx`

**Files:**
- Modify: `src/components/Palette/Palette.tsx` (lines 202, 203, 225)

Three edits: two `theme.colors.void[950]` references and one `theme.colors.accent.glow` reference.

- [ ] **Step 1: Read lines 195–235 for context**

Use the `Read` tool with `offset: 195, limit: 40`.

- [ ] **Step 2: Edit 1 — connect-mode toggle (lines 200–210)**

Find (around line 200):
```tsx
backgroundColor: connectMode ? theme.sidebar.accent : 'transparent',
color: theme.colors.void[950],
boxShadow: `0 4px 14px ${theme.colors.accent.glow}`,
```
Replace with:
```tsx
backgroundColor: connectMode ? theme.button.primary.bg : 'transparent',
color: connectMode ? theme.button.primary.text : theme.sidebar.text,
boxShadow: connectMode ? theme.shadow.md : 'none',
```

- [ ] **Step 3: Edit 2 — second connect-mode reference (line 225)**

Find (around line 220–227):
```tsx
style={{
  color: connectMode ? theme.colors.void[950] : theme.sidebar.muted,
}}
```
Replace with:
```tsx
style={{
  color: connectMode ? theme.button.primary.text : theme.sidebar.muted,
}}
```

- [ ] **Step 4: Type-check + smoke**

Run: `npx tsc --noEmit`. Open the palette sidebar, click the "Connect" button. Confirm:
- Inactive state: light background, dark sage text.
- Active state: dark sage background (`#3d4a32`), white text, soft sage shadow.

- [ ] **Step 5: Stage**

Run: `git add src/components/Palette/Palette.tsx`. No commit yet.

---

## Task 10: Migrate `src/components/RecoveryPrompt.tsx`

**Files:**
- Modify: `src/components/RecoveryPrompt.tsx` (line 15)

Single edit: the hardcoded scrim color.

- [ ] **Step 1: Apply the edit**

Find (line 13–16):
```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center"
  style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
>
```
Replace with:
```tsx
<div
  className="fixed inset-0 flex items-center justify-center"
  style={{ backgroundColor: theme.scrim, zIndex: theme.z.modalScrim }}
>
```

(The `z-50` Tailwind class is also forbidden under the rule; the `zIndex` in the style block replaces it.)

- [ ] **Step 2: Type-check + smoke**

Run: `npx tsc --noEmit`. Manually trigger the recovery prompt by:
- In dev tools localStorage, set `etd-autosave` to a non-empty JSON object that matches the autosave schema (or simply create a diagram, refresh the page, accept any prompt that appears).
- Confirm the scrim is sage-tinted (`rgba(50, 65, 30, 0.32)`) instead of the previous near-opaque black.
- Confirm the modal body is still readable (it uses `theme.sidebar.bg` which now resolves to sage — the modal will already look much better).

- [ ] **Step 3: Stage**

Run: `git add src/components/RecoveryPrompt.tsx`. No commit yet.

---

## Task 11: Migrate `src/components/TranscriptPanel/TranscriptPanelItem.tsx`

**Files:**
- Modify: `src/components/TranscriptPanel/TranscriptPanelItem.tsx` (line 130)

Single hardcoded hex literal `#10141c` used for an alternating-row stripe.

- [ ] **Step 1: Apply the edit**

Find (line 130):
```tsx
const baseBg = altRow ? '#10141c' : theme.sidebar.surface;
```
Replace with:
```tsx
const baseBg = altRow ? theme.sidebar.hover : theme.sidebar.surface;
```

(`theme.sidebar.hover` is `#e7ede0` — a very subtle sage stripe that distinguishes alternating rows without being noisy.)

- [ ] **Step 2: Type-check + smoke**

Run: `npx tsc --noEmit`. Load a transcript via the toolbar. Confirm: transcript lines have a subtle alternating sage stripe instead of the previous dark-on-dark pattern.

- [ ] **Step 3: Stage**

Run: `git add src/components/TranscriptPanel/TranscriptPanelItem.tsx`. No commit yet.

---

## Task 11b: Migrate remaining Tailwind color sites

**Files:**
- Modify: `src/components/Settings/SettingsSidebar.tsx` (line 24)
- Modify: `src/components/Settings/SubtypeListEditor.tsx` (line 163)
- Modify: `src/components/ImageEditor/ImageLightbox.tsx` (line 49)
- Modify: `src/components/Properties/ImageUpload.tsx` (lines 100, 103, 110, 117)

A handful of small `hover:bg-white/N` and `focus-visible:ring-*` utilities scattered across chrome that don't warrant their own task. All migrate to inline `style` or onMouseEnter handlers driven by `theme.ts` tokens.

- [ ] **Step 1: `SettingsSidebar.tsx` line 24 — replace focus + hover Tailwind classes**

Open the file. Find (around line 23–24):
```tsx
const rowClass = (active: boolean) =>
  `w-full text-left px-3 py-2 text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 ${active ? '' : 'hover:bg-white/5'}`;
```
Replace with:
```tsx
const rowClass = (active: boolean) =>
  `w-full text-left px-3 py-2 text-sm rounded ${active ? '' : 'sidebar-row-hover'}`;
```

Then add the corresponding styles. Update the `rowStyle` function (around line 26) to include the focus ring via inline style and hover via a CSS class. Replace `rowStyle`:
```tsx
const rowStyle = (active: boolean) => ({
  backgroundColor: active ? theme.sidebar.surfaceHover : 'transparent',
  color: active ? theme.sidebar.text : theme.sidebar.textSecondary,
});
```
with:
```tsx
const rowStyle = (active: boolean) => ({
  backgroundColor: active ? theme.sidebar.surfaceHover : 'transparent',
  color: active ? theme.sidebar.text : theme.sidebar.textSecondary,
  outline: 'none' as const,
});
```

And in `src/index.css`, append a small rule:
```css
.sidebar-row-hover:hover { background-color: var(--hover); }
.sidebar-row-hover:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

(Alternative if you prefer to keep all styling in TS rather than CSS: use a separate `<button onMouseEnter={...} onFocus={...}>` pattern. The CSS class approach is shorter for a hover-and-focus combo.)

- [ ] **Step 2: `SubtypeListEditor.tsx` line 163 — replace hover Tailwind**

Find:
```tsx
className="p-1 rounded hover:bg-white/10"
```
Replace with:
```tsx
className="p-1 rounded transition-colors"
onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
```

- [ ] **Step 3: `ImageLightbox.tsx` line 49 — preserve dark-backdrop styling, migrate the Tailwind utility**

Per spec §7.2, the lightbox keeps its dark-backdrop styling (image viewing benefits from a dark frame). Only the Tailwind utility migrates so it doesn't trip the audit grep.

Find:
```tsx
className="p-2 rounded-lg transition-colors hover:bg-white/10"
style={{ color: 'white' }}
```
Replace with:
```tsx
className="p-2 rounded-lg transition-colors"
style={{ color: 'white' }}
onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.10)'; }}
onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
```

(The rgba value is identical to what `hover:bg-white/10` produced — we're moving it out of Tailwind, not changing the appearance.)

- [ ] **Step 4: `ImageUpload.tsx` lines 100, 103, 110, 117 — migrate overlay button Tailwinds**

The image overlay buttons sit on top of an image thumbnail and use Tailwind opacity-on-color utilities. Migrate each to inline `style` with the same rgba.

First, add the `theme` import if not present at the top of the file (it likely already imports `theme` — confirm by reading lines 1–10).

Find the overlay container (line 100):
```tsx
<div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
```
Replace with:
```tsx
<div
  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1"
  style={{ backgroundColor: 'rgba(0, 0, 0, 0.50)' }}
>
```

For each of the three buttons (lines 103, 110, 117), replace the Tailwind utilities. Pattern for the first two buttons:
```tsx
className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
```
becomes:
```tsx
className="p-1.5 rounded-lg transition-colors"
style={{ backgroundColor: 'rgba(255, 255, 255, 0.20)' }}
onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.30)'; }}
onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.20)'; }}
```

Pattern for the third (remove) button at line 117 — uses red hover:
```tsx
className="p-1.5 rounded-lg bg-white/20 hover:bg-red-500/50 transition-colors"
```
becomes:
```tsx
className="p-1.5 rounded-lg transition-colors"
style={{ backgroundColor: 'rgba(255, 255, 255, 0.20)' }}
onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(178, 58, 72, 0.50)'; }}
onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.20)'; }}
```

(The `178, 58, 72` rgba matches the new `danger` token `#b23a48`.)

- [ ] **Step 5: Type-check + smoke**

Run: `npx tsc --noEmit`. Smoke test:
- Settings modal sidebar: tab through types, focus ring is visible (dark sage outline on light bg); hover an inactive type, see the sage hover bg.
- SubtypeListEditor: the trash-button hover shows sage bg.
- Image lightbox: open by clicking an element's image; close button hover still shows the white/10 highlight (dark backdrop unchanged).
- Properties image upload: with an image already attached, hover the thumbnail → overlay appears with the three buttons; each button hover shows the lighter white tint; the remove button shows the danger red on hover.

- [ ] **Step 6: Stage**

Run: `git add src/components/Settings/SettingsSidebar.tsx src/components/Settings/SubtypeListEditor.tsx src/components/ImageEditor/ImageLightbox.tsx src/components/Properties/ImageUpload.tsx src/index.css`. No commit yet.

---

## Task 12: Migrate `src/components/ui/Tooltip.tsx`

**Files:**
- Modify: `src/components/ui/Tooltip.tsx` (line 56)

The tooltip uses a hardcoded shadow `rgba(0, 0, 0, 0.3)` that's too dark for the sage palette. Replace with the sage-tinted `shadow.md` token.

- [ ] **Step 1: Apply the edit**

Find (around line 52–58):
```tsx
style={{
  ...positionStyles,
  backgroundColor: theme.sidebar.surface,
  color: theme.sidebar.text,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  border: `1px solid ${theme.sidebar.border}`,
}}
```
Replace with:
```tsx
style={{
  ...positionStyles,
  backgroundColor: theme.sidebar.surface,
  color: theme.sidebar.text,
  boxShadow: theme.shadow.md,
  border: `1px solid ${theme.sidebar.border}`,
  zIndex: theme.z.dropdown,
}}
```

(Also remove the `z-50` Tailwind class on line 51 and replace with the `zIndex` token in `style`.)

Find (line 51):
```tsx
className="tooltip-animate absolute left-1/2 -translate-x-1/2 z-50 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none"
```
Replace with:
```tsx
className="tooltip-animate absolute left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none"
```

- [ ] **Step 2: Type-check + smoke**

Run: `npx tsc --noEmit`. Hover any toolbar button for ~500ms (delay default is 400ms). Confirm the tooltip appears with a soft sage-tinted shadow, not a heavy black drop shadow.

- [ ] **Step 3: Stage**

Run: `git add src/components/ui/Tooltip.tsx`. No commit yet.

---

## Task 13: Verify with the audit grep

**Files:** (none modified)

Run the spec's verification grep and confirm only sealed-path hits remain.

- [ ] **Step 1: Run the verification grep**

The regex below extends the spec's §11 grep with `black` / `white` color names and `*/N` opacity modifiers (which were gaps the spec missed). It also expands the sealed-path exclusions.

```bash
grep -rEn '#[0-9a-fA-F]{3,8}|rgba\(|theme\.colors\.(void|error|success|accent\.glow|highlight|secondary)|\bbg-(gray|blue|red|zinc|slate|black|white)\b|\btext-(gray|blue|red|zinc|slate|black|white)\b|\bborder-(gray|blue|red|zinc|slate|black|white)\b|bg-\[#|text-\[#|hover:bg-\[|hover:bg-(black|white|gray|blue|red)|focus-visible:ring-|\bring-[0-9]|\bdivide-|\bz-[0-9]+\b' src/ \
  | grep -v '^src/components/Canvas/' \
  | grep -v '^src/utils/colors.ts' \
  | grep -v '^src/utils/theme.ts' \
  | grep -v '^src/utils/styleResolver.ts' \
  | grep -v '^src/utils/exportBounds.ts' \
  | grep -v '^src/utils/pdfExport.ts' \
  | grep -v '^src/utils/svgExport.ts' \
  | grep -v '^src/utils/diagramxExport.ts' \
  | grep -v '^src/utils/drawingImporter.ts'
```

Expected: zero output, ideally. Acceptable exceptions (do not block the PR for these):
- Hits in `src/index.css` `:root` block — that's the new CSS-var source of truth.
- Hits inside the Konva `<Stage>` / `<Group>` block of `StylePreview.tsx` (lines ~92–140) — that's sealed Konva rendering.
- Hits inside `Canvas/Canvas.tsx` HTML mode banners (lines 839, 850) — deferred to PR 5 per the §"Deferred" note in the file map.
- Hits inside any utility file that constructs canvas/export rendering (excluded above).

- [ ] **Step 2: Investigate any unexpected hits**

For each unexpected hit, decide whether it's:
- A sealed-path miss (add to the exclusion list above for the report; don't change the code).
- A real migration miss (open the file, apply the same pattern from the earlier tasks).
- A `theme.ts` compatibility shim definition (acceptable — leave it).

Iterate until the grep returns only acceptable hits.

- [ ] **Step 3: Document the result**

If any acceptable hits remain (e.g., `colors.ts` has hardcoded hex by design, `theme.ts` has the shim values), note them in the commit message at Task 16.

---

## Task 14: Accessibility — AA contrast check

**Files:** (none modified)

Confirm WCAG AA on the migrated chrome.

- [ ] **Step 1: Install axe DevTools browser extension**

If not already installed, get it from https://www.deque.com/axe/devtools/ (Chrome/Firefox).

- [ ] **Step 2: Open the running app and scan each main surface**

For each of these surfaces, click the page, open axe DevTools, run the scan, and confirm **zero** color-contrast violations:

1. Main app (default state — palette, toolbar, empty canvas, properties).
2. Settings modal (open from toolbar gear icon).
3. About modal (open from toolbar info icon).
4. Import-image modal (open from toolbar Import button — walk through all 4 states).
5. Recovery prompt (trigger by simulating autosave; or skip if hard to reproduce in dev).
6. Full-screen mode (press `F`).
7. Tooltip on a toolbar button (hover for ~500ms while axe is in record mode).

If any surface flags a contrast violation, identify the offending color pair and fix by using a darker token (`text` instead of `text-secondary`, `accent-strong` instead of `accent`, etc.).

- [ ] **Step 3: Note any non-color-contrast warnings**

Axe may also flag focus order, ARIA, etc. Those are PR 4 / PR 5 concerns — note them for later, do not fix in this PR.

---

## Task 15: Visual regression — canvas must be pixel-identical

**Files:** (none modified)

The hard constraint of this rehaul is that the canvas + rendered elements look exactly the same as before.

- [ ] **Step 1: Reference screenshot (before any PR 1 commit)**

If you don't already have a pre-rehaul reference image, check out the parent commit of this branch (`git stash`, `git checkout main`, take screenshots, then `git checkout <branch>` and `git stash pop`). Take screenshots of:
- The app with `test_diagram.json` loaded (drag it onto the app or use Open).
- A close-up of an Implicit element (cloud shape, black border).
- A close-up of a Student-contributor element (medium-blue dashed border).
- A close-up of a Teacher-support Question element (cyan border, light cyan fill).

Save as `/tmp/etd-canvas-before-pr1-*.png`.

- [ ] **Step 2: After PR 1 changes, screenshot the same diagram and surfaces**

Load the same `test_diagram.json` in the now-sage chrome. Take the matching screenshots.

- [ ] **Step 3: Diff the canvas areas**

Visually compare. The canvas background, element fills, element borders (color + style + thickness), connector lines, and dashed warrant attachments must be **identical**. The chrome surrounding the canvas must be different (sage). If anything inside the canvas changed, an earlier task touched something it shouldn't have — bisect by reverting one staged file at a time and re-checking.

- [ ] **Step 4: Document the check passed**

Note "Canvas + elements visually identical to pre-PR-1 reference" in the commit message at Task 16.

---

## Task 16: Smoke-test critical workflows + commit

**Files:** (none modified for smoke; final commit at end of step.)

Confirm functional behavior still works end-to-end, then atomically commit all staged PR 1 changes.

- [ ] **Step 1: Smoke test in dev**

With the dev server running, walk through:

1. Drag every element type from the palette to the canvas — each appears with the correct contributor styling.
2. Cmd+S → file downloads with diagram JSON.
3. Cmd+O → reload a JSON, diagram renders correctly.
4. Toolbar Import-image → walk through the disclosure + picker (don't need to actually call Gemini).
5. Toolbar Export PNG / SVG / PDF / DiagramMix → each produces a file (open one to verify image is sane).
6. Toolbar Legend toggle → legend appears/hides; both states render correctly.
7. Load transcript → file picker opens; load a `.txt` transcript; lines appear in the right panel with sage chrome.
8. Open Settings modal → click an Argument type → preview renders correctly → close.
9. About modal → opens, all sections render.
10. Cmd+Z / Cmd+Shift+Z → undo/redo works.
11. Full-screen (F) → toolbar slides on hover; entry hint pill shows briefly in sage style; F again exits.
12. Clear diagram → confirm dialog appears (still `window.confirm()` until PR 4), confirms, diagram clears.

If anything is broken, bisect by reverting individual file changes from the staged set.

- [ ] **Step 2: Run lint + typecheck once more**

Run: `npm run lint` and `npx tsc --noEmit`. Both pass.

- [ ] **Step 3: Final grep verification**

Run the Task 13 grep one more time after all the workflow walks (sometimes a workflow exposes a code path that hadn't been hit during static migration). If clean, proceed.

- [ ] **Step 4: Commit PR 1 atomically**

Confirm what's staged:
```bash
git status
```

Expected staged files (16):
- `src/utils/theme.ts`
- `src/index.css` (rewritten `:root` + the `.sidebar-row-hover` rule from Task 11b)
- `src/App.tsx`
- `src/components/Toolbar/Toolbar.tsx`
- `src/components/Toolbar/AboutModal.tsx`
- `src/components/Toolbar/ImageImportModal.tsx`
- `src/components/Settings/SettingsModal.tsx`
- `src/components/Settings/SettingsSidebar.tsx`
- `src/components/Settings/SubtypeListEditor.tsx`
- `src/components/Settings/StylePreview.tsx`
- `src/components/Palette/Palette.tsx`
- `src/components/RecoveryPrompt.tsx`
- `src/components/Properties/ImageUpload.tsx`
- `src/components/TranscriptPanel/TranscriptPanelItem.tsx`
- `src/components/ImageEditor/ImageLightbox.tsx`
- `src/components/ui/Tooltip.tsx`

Commit:
```bash
git commit -m "$(cat <<'EOF'
feat(theme): Sage Garden foundation — PR 1 of UI rehaul

Replace Deep Void dark theme with Sage Garden light theme across all
chrome. Canvas + element rendering pixel-identical (sealed).

Foundation:
- theme.ts: rewrite token values; preserve existing API shape so most
  consumers don't need edits. Add focus.ring / focus.ringOnDark, danger
  group, explicit z-index ladder.
- index.css: rewrite :root CSS variables to sage values; remove every
  deep-void selector reference.

Targeted edits (because of removed keys, hardcoded literals, or
forbidden Tailwind utilities):
- App.tsx: bg-gray-50, three z-* utilities, full-screen shadow + hint
- Toolbar.tsx: theme.colors.error / rgba(239,68,68,…) IconButton danger
- AboutModal.tsx: Catppuccin hex #45475a / #313244
- ImageImportModal.tsx: extensive Tailwind colors → token-driven inline
- SettingsModal.tsx + StylePreview.tsx: theme.colors.void[950]
- Palette.tsx: theme.colors.void[950] + theme.colors.accent.glow
- RecoveryPrompt.tsx: hardcoded rgba(0,0,0,0.6) scrim
- TranscriptPanelItem.tsx: hardcoded #10141c
- Tooltip.tsx: hardcoded rgba shadow

Verified:
- audit grep returns only sealed-path hits + theme.ts shim definitions
- axe DevTools: no AA contrast violations on every modal + main app
- visual regression: canvas + elements pixel-identical to pre-PR-1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Confirm**

Run: `git log --oneline -3`. The new commit appears at the top.

---

## Task 17: Deploy to jenkleiman.com

**Files:** (none modified in this repo; updates the sibling repo)

Per the dual-repo dance documented in `CLAUDE.md`.

- [ ] **Step 1: Build the production bundle**

```bash
npm run build
```

Expected: `dist/` populated with the production build. No build errors.

- [ ] **Step 2: Copy to jenkleiman.com repo**

```bash
rm -rf ~/Documents/GitHub/jenkleiman.com/public/tools/etd/*
cp -r dist/* ~/Documents/GitHub/jenkleiman.com/public/tools/etd/
```

- [ ] **Step 3: Commit + push jenkleiman.com**

```bash
cd ~/Documents/GitHub/jenkleiman.com
git add public/tools/etd/
git commit -m "Update ETD tool: Sage Garden foundation (PR 1 of UI rehaul)"
git push
cd -
```

Netlify deploys automatically on push.

- [ ] **Step 4: Verify on jenkleiman.com**

Open https://jenkleiman.com/tools/etd in a browser (after the Netlify deploy completes, usually ~1–2 minutes). Confirm the chrome is sage and the canvas + elements look exactly like the local build.

- [ ] **Step 5: Push the ETD repo branch**

If working on a feature branch:
```bash
git push -u origin <branch-name>
```

If working directly on main:
```bash
git push origin main
```

---

## Self-review checklist

Before marking PR 1 complete, scan back through this plan:

- [ ] Every spec section relevant to PR 1 has a task? (Spec §4 tokens → Task 1, 2. §4.6 z-index → Task 1 step 2 + Task 3 step 3. §11 PR 1 audit list → Tasks 3–12. Verification → Tasks 13–15. Deploy → Task 17. Yes — covered.)
- [ ] Every step has the actual code, not a placeholder? (Spot-check Tasks 1, 6, 13 — yes.)
- [ ] Type names consistent? (`theme.button.primary.bg` used consistently. `theme.z.fsToolbar` matches definition. `theme.danger.fg` etc. match.)
- [ ] Sealed paths preserved? (Task 8 step 3 calls out the Konva content boundary in StylePreview. Task 15 verifies canvas pixel-identical.)
- [ ] Commit happens once at the end, not per file? (Yes — Task 16 step 4 commits atomically.)

If a gap is found mid-execution, add the missing step inline and continue.

---

## What this PR does NOT do

These ship in later PRs of the rehaul; do not attempt them here.

- Restructure the toolbar (PR 2)
- Restyle palette / properties / transcript layouts (PR 3)
- Build shared Modal component, Toast component, replace `alert()` calls (PR 4)
- Restyle Recovery prompt frame, demote to toast — **stays a modal**, just gets sage scrim here in PR 1 (PR 4 wraps in shared Modal)
- Canvas empty-state HTML overlay (PR 5)
- Hover / focus / active state audit (PR 5)
