// The tokens subpath, not the package root: the root re-exports web React components whose CSS
// imports Metro cannot bundle. `@ashniva/ui/tokens` is plain TypeScript with no runtime deps.
import { neutralColors, priorityColors } from '@ashniva/ui/tokens';

/**
 * The native theme.
 *
 * Built from the shared design tokens rather than restated: `@ashniva/ui` exports a TypeScript
 * mirror of `tokens.css` for exactly this — the CSS file itself is web-only. The colours here are
 * the same values the web app paints with, so the two do not drift.
 *
 * Branding is not hardcoded. `brandColors` holds the fallbacks; `ThemeProvider` replaces them
 * with whatever `GET /branding` returns for the tenant, the same way the web app overrides its
 * CSS variables at runtime.
 *
 * Two palettes, light and dark, chosen from the device setting. A dark palette is not a filter
 * over the light one — the surfaces lift rather than darken — so both are written out.
 */

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  warning: string;
  info: string;
  /** Backgrounds for a status pill. */
  pillBackground: string;
}

/** Fallbacks. Overridden per tenant at runtime, never treated as the brand. */
export const FALLBACK_BRAND = {
  primary: '#1f4d3f',
  primaryText: '#ffffff',
} as const;

export const lightColors: ThemeColors = {
  background: neutralColors.bg,
  surface: neutralColors.surface,
  surfaceRaised: '#ffffff',
  border: neutralColors.border,
  text: neutralColors.text,
  textMuted: neutralColors.textMuted,
  textFaint: neutralColors.textFaint,
  primary: FALLBACK_BRAND.primary,
  primaryText: FALLBACK_BRAND.primaryText,
  danger: neutralColors.danger,
  success: '#2c6e49',
  warning: '#8a6300',
  info: '#1f4f7a',
  pillBackground: '#eeeeea',
};

export const darkColors: ThemeColors = {
  background: '#151617',
  surface: '#1d1f21',
  surfaceRaised: '#26292b',
  border: '#33373a',
  text: '#f2f2f0',
  textMuted: '#a9abaf',
  textFaint: '#84868a',
  primary: '#4e9c81',
  primaryText: '#0d1210',
  danger: '#e2725c',
  success: '#5aa87f',
  warning: '#d7a53c',
  info: '#6aa7d4',
  pillBackground: '#2c3033',
};

/** Spacing, on a four-point grid, matching the web tokens. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

/**
 * Type sizes.
 *
 * `input` is 16 and must stay at least 16: iOS Safari and some Android keyboards zoom the page
 * when a focused input is smaller, which throws the layout about mid-typing.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  body: 16,
  input: 16,
  lg: 20,
  xl: 26,
} as const;

/** The minimum comfortable target, from the platform accessibility guidance. */
export const TOUCH_TARGET = 44;

export const priority = priorityColors;

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  isDark: boolean;
}

export function themeFor(scheme: 'light' | 'dark', brandPrimary?: string | null): Theme {
  const base = scheme === 'dark' ? darkColors : lightColors;
  return {
    colors: brandPrimary ? { ...base, primary: brandPrimary } : base,
    spacing,
    radius,
    fontSize,
    isDark: scheme === 'dark',
  };
}
