/**
 * Deep Void Theme
 * Matching jenkleiman.com aesthetic - deep dark with cyan accents
 */

export const theme = {
  // Core palette - matching jenkleiman.com
  colors: {
    // Deep void tones
    void: {
      950: '#030509',    // Deepest
      900: '#050a14',    // Primary background (dark-bg)
      850: '#0a1019',    // Slightly elevated
      800: '#141824',    // Surface (dark-surface)
      700: '#1a2030',    // Hover states
      600: '#1f2937',    // Borders (dark-border)
      500: '#2a3548',    // Elevated borders
      400: '#374151',    // Subtle elements
    },
    // Text hierarchy
    text: {
      primary: '#f3f4f6',    // Primary text (gray-100)
      secondary: '#d1d5db',  // Secondary (gray-300)
      tertiary: '#9ca3af',   // Tertiary (gray-400)
      muted: '#6b7280',      // Muted (gray-500)
    },
    // Cyan accent - bioluminescent blue
    accent: {
      50: '#ecfeff',
      100: '#cffafe',
      200: '#a5f3fc',
      300: '#67e8f9',
      400: '#22d3ee',
      500: '#00f0ff',   // Primary accent
      600: '#00c0cc',   // Hover
      700: '#0891b2',
      glow: 'rgba(0, 240, 255, 0.15)',
      glowStrong: 'rgba(0, 240, 255, 0.25)',
    },
    // Secondary colors
    secondary: '#0aff60',   // Fern green
    highlight: '#ffd700',   // Sunlight gold
    // Semantic colors
    success: '#0aff60',
    warning: '#ffd700',
    error: '#ef4444',
    info: '#00f0ff',
  },

  sidebar: {
    bg: '#050a14',
    bgGradient: 'linear-gradient(180deg, #0a1019 0%, #050a14 100%)',
    surface: '#141824',
    surfaceHover: '#1a2030',
    surfaceActive: '#1f2937',
    text: '#f3f4f6',
    textSecondary: '#d1d5db',
    muted: '#9ca3af',
    accent: '#00f0ff',
    accentHover: '#00c0cc',
    accentText: '#ecfeff',
    border: '#1f2937',
    borderSubtle: '#141824',
    hover: '#1a2030',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  },

  canvas: {
    bg: '#fafafa',
    bgAlt: '#f5f5f5',
    grid: '#e5e5e5',
    gridMajor: '#d4d4d4',
  },

  toolbar: {
    bg: '#050a14',
    bgGradient: 'linear-gradient(180deg, #0a1019 0%, #050a14 100%)',
    border: '#1f2937',
    shadow: '0 2px 16px rgba(0, 0, 0, 0.4)',
  },

  properties: {
    bg: '#050a14',
    bgGradient: 'linear-gradient(0deg, #030509 0%, #0a1019 100%)',
    border: '#1f2937',
    shadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
  },

  // Form controls - cyan focus states
  input: {
    bg: '#141824',
    bgHover: '#1a2030',
    bgFocus: '#1a2030',
    border: '#1f2937',
    borderHover: '#2a3548',
    borderFocus: '#00f0ff',
    text: '#f3f4f6',
    placeholder: '#6b7280',
    ring: 'rgba(0, 240, 255, 0.3)',
  },

  // Button variants
  button: {
    primary: {
      bg: '#00f0ff',
      bgHover: '#00c0cc',
      text: '#050a14',
    },
    secondary: {
      bg: '#141824',
      bgHover: '#1a2030',
      text: '#f3f4f6',
      border: '#1f2937',
    },
    ghost: {
      bg: 'transparent',
      bgHover: '#1a2030',
      text: '#d1d5db',
    },
    danger: {
      bg: '#ef4444',
      bgHover: '#dc2626',
      text: '#ffffff',
    },
  },

  // Selection and focus
  selection: {
    bg: 'rgba(0, 240, 255, 0.2)',
    border: '#00f0ff',
    ring: '0 0 0 2px rgba(0, 240, 255, 0.3)',
  },

  // Spacing scale (in pixels)
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
  },

  // Border radius
  radius: {
    sm: 4,
    md: 6,
    lg: 10,
    xl: 14,
    full: 9999,
  },

  // Transitions
  transition: {
    fast: '100ms ease-out',
    normal: '150ms ease-out',
    slow: '250ms ease-out',
  },

  // Shadows
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 2px 8px rgba(0, 0, 0, 0.35)',
    lg: '0 4px 16px rgba(0, 0, 0, 0.4)',
    xl: '0 8px 32px rgba(0, 0, 0, 0.5)',
    glow: '0 0 20px rgba(0, 240, 255, 0.2)',
  },

  // Glassmorphism
  glass: {
    bg: 'rgba(20, 24, 36, 0.7)',
    border: 'rgba(31, 41, 55, 0.5)',
    blur: 'blur(12px)',
  },
};

// CSS custom properties
export const cssVars = {
  '--color-bg': theme.sidebar.bg,
  '--color-surface': theme.sidebar.surface,
  '--color-text': theme.sidebar.text,
  '--color-text-secondary': theme.sidebar.textSecondary,
  '--color-text-muted': theme.sidebar.muted,
  '--color-accent': theme.sidebar.accent,
  '--color-border': theme.sidebar.border,
};
