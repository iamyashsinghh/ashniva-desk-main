/**
 * TypeScript mirror of tokens.css for code that cannot read CSS variables
 * (charts, the future React Native app, tests). Keep both files in sync.
 *
 * Only the values a non-CSS consumer actually needs are mirrored. A token that exists purely to
 * be read by a stylesheet — the state washes, the stacking order, the derived spacing steps — is
 * deliberately absent, because a second copy of a value nobody reads here is a second copy to
 * keep correct.
 */
export const breakpoints = {
  /** Phones */
  sm: 480,
  /** Tablets — sidebar collapses below this */
  md: 900,
  /** Desktop */
  lg: 1200,
} as const;

export const neutralColors = {
  bg: '#f4f4f2',
  surface: '#ffffff',
  border: '#e4e4e0',
  text: '#1b1c1e',
  textMuted: '#5f6064',
  textFaint: '#6e6f74',
  danger: '#a8321f',
} as const;

/**
 * The same seven neutrals under `[data-theme='dark']`.
 *
 * A chart drawn onto a canvas cannot inherit a CSS variable, so it has to be told which scheme it
 * is drawing into. `currentColorScheme()` answers that; this is the palette to use when it says
 * dark.
 */
export const darkNeutralColors = {
  bg: '#131416',
  surface: '#1b1d20',
  border: '#2f3236',
  text: '#eceef0',
  textMuted: '#a4a9ae',
  textFaint: '#878d93',
  danger: '#ef8f76',
} as const;

export const priorityColors = {
  CRITICAL: '#a8321f',
  HIGH: '#c2410c',
  MEDIUM: '#c99a1e',
  LOW: '#9a9b9f',
} as const;

export const darkPriorityColors = {
  CRITICAL: '#ef8f76',
  HIGH: '#ef9455',
  MEDIUM: '#e2b64a',
  LOW: '#8d9298',
} as const;

export const fontFamilies = {
  sans: "'IBM Plex Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', Menlo, Consolas, monospace",
} as const;

/** The 4px spacing scale, in pixels. */
export const spacing = {
  0: 0,
  half: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Type sizes in pixels. Dense on purpose: this is an operational tool, not a marketing site. */
export const fontSizes = {
  xs: 11,
  sm: 12.5,
  md: 13.5,
  lg: 16,
  xl: 20,
  '2xl': 26,
  '3xl': 32.5,
} as const;

export const lineHeights = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.45,
  relaxed: 1.65,
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const radii = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 999,
} as const;

/** Stacking order. Read `tokens.css` for the CSS-side names. */
export const zIndex = {
  base: 0,
  sticky: 100,
  dropdown: 200,
  drawer: 300,
  modal: 400,
  toast: 500,
  tooltip: 600,
} as const;

/** Transition durations in milliseconds. */
export const durations = {
  instant: 80,
  fast: 120,
  base: 180,
  slow: 260,
} as const;

/** Names of the CSS variables the branding provider writes at runtime. */
export const brandCssVariables = {
  primary: '--brand-primary',
  primaryHover: '--brand-primary-hover',
  primarySoft: '--brand-primary-soft',
  secondary: '--brand-secondary',
  accent: '--brand-accent',
  accentHover: '--brand-accent-hover',
} as const;
