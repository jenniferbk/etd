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
