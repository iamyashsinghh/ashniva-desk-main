// The tokens subpath, not the package root: the root re-exports web React components whose CSS
// imports Metro cannot bundle. `@ashniva/ui/tokens` is plain TypeScript with no runtime deps.
import { darkPriorityColors, neutralColors, priorityColors } from '@ashniva/ui/tokens';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * The native theme.
 *
 * Built from the shared design tokens rather than restated: `@ashniva/ui` exports a TypeScript
 * mirror of `tokens.css` for exactly this — the CSS file itself is web-only. The colours here are
 * the same values the web app paints with, so the two do not drift.
 *
 * Branding is not hardcoded. `brandColors` holds the fallbacks; `ThemeProvider` replaces them
 * with whatever `GET /branding` returns for the tenant, the same way the web app overrides its
 * CSS variables at runtime. The soft brand wash is derived from whatever primary arrives, so a
 * tenant colour tints selected chips and tiles without a second setting.
 *
 * Two palettes, light and dark, chosen from the device setting. A dark palette is not a filter
 * over the light one — the surfaces lift rather than darken — so both are written out.
 */

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  /** Wells inside a surface: a search field, a segmented track, a progress bar's rail. */
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  /** A light wash of the brand colour, for selected chips, tiles and focus halos. */
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  /** Backgrounds for a neutral status pill. */
  pillBackground: string;
  /** The scrim behind a dialog or sheet. */
  overlay: string;
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
  surfaceSunken: '#ecece8',
  border: neutralColors.border,
  borderStrong: '#cfcfca',
  text: neutralColors.text,
  textMuted: neutralColors.textMuted,
  textFaint: neutralColors.textFaint,
  primary: FALLBACK_BRAND.primary,
  primaryText: FALLBACK_BRAND.primaryText,
  primarySoft: mix(FALLBACK_BRAND.primary, '#ffffff', 0.88),
  danger: neutralColors.danger,
  dangerSoft: '#f8e7e3',
  success: '#2c6e49',
  successSoft: '#e3f0e8',
  warning: '#8a6300',
  warningSoft: '#f6eed8',
  info: '#1f4f7a',
  infoSoft: '#e3ecf5',
  pillBackground: '#eeeeea',
  overlay: 'rgba(20, 21, 22, 0.45)',
};

export const darkColors: ThemeColors = {
  background: '#151617',
  surface: '#1d1f21',
  surfaceRaised: '#26292b',
  surfaceSunken: '#121314',
  border: '#33373a',
  borderStrong: '#464b4f',
  text: '#f2f2f0',
  textMuted: '#a9abaf',
  textFaint: '#84868a',
  primary: '#4e9c81',
  primaryText: '#0d1210',
  primarySoft: mix('#4e9c81', '#1d1f21', 0.8),
  danger: '#e2725c',
  dangerSoft: '#3a2420',
  success: '#5aa87f',
  successSoft: '#1f3128',
  warning: '#d7a53c',
  warningSoft: '#372d18',
  info: '#6aa7d4',
  infoSoft: '#1d2c39',
  pillBackground: '#2c3033',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/** Spacing, on a four-point grid, matching the web tokens. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  /** The side gutter of every screen. */
  screen: 16,
  /** Between the sections of one screen. */
  section: 24,
} as const;

export const radius = { xs: 4, sm: 8, md: 14, lg: 20, pill: 999 } as const;

/**
 * Extra hues for icon tiles, so a grid of destinations is told apart by colour as well as by
 * picture. Decoration only: none of them carries a status, which stays with the semantic colours.
 */
export type AccentName = 'violet' | 'teal' | 'orange' | 'pink';
export type AccentPalette = Record<AccentName, { color: string; background: string }>;

const lightAccents: AccentPalette = {
  violet: { color: '#6d4fc2', background: '#eee9fb' },
  teal: { color: '#0f7b83', background: '#e0f3f4' },
  orange: { color: '#c05a1c', background: '#fbeadf' },
  pink: { color: '#b83e7a', background: '#f9e4ef' },
};

const darkAccents: AccentPalette = {
  violet: { color: '#a792ef', background: '#2a2440' },
  teal: { color: '#5cc4cb', background: '#17312f' },
  orange: { color: '#f0995f', background: '#3a2618' },
  pink: { color: '#ec8cbb', background: '#3a1f2d' },
};

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

/**
 * The type scale, by role rather than by size.
 *
 * A screen asks for "a section heading", not "17 semibold", so the hierarchy stays the same on
 * every screen and changes in one place.
 */
export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4 },
  button: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typography;

/**
 * One elevation, used sparingly.
 *
 * Cards sit on the warm grey background and are told apart by colour; the shadow is a hint of
 * lift, not a drop. Android's elevation shadow is heavier and greyer than iOS's, so there the
 * card keeps a hairline instead.
 */
export const shadow: { card: ViewStyle; raised: ViewStyle } = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    default: {},
  }),
  raised: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    default: { elevation: 8 },
  }),
};

/** The minimum comfortable target, from the platform accessibility guidance. */
export const TOUCH_TARGET = 44;

/** How dim a control that cannot be used right now is. */
export const DISABLED_OPACITY = 0.45;

export const priority = priorityColors;

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  typography: typeof typography;
  shadow: typeof shadow;
  accents: AccentPalette;
  /** Priority colours for this scheme: CRITICAL, HIGH, MEDIUM, LOW. */
  priority: Record<keyof typeof priorityColors, string>;
  isDark: boolean;
}

export function themeFor(scheme: 'light' | 'dark', brandPrimary?: string | null): Theme {
  const base = scheme === 'dark' ? darkColors : lightColors;
  const colors = brandPrimary
    ? {
        ...base,
        primary: brandPrimary,
        primarySoft: mix(brandPrimary, base.surface, scheme === 'dark' ? 0.8 : 0.88),
      }
    : base;
  return {
    colors,
    spacing,
    radius,
    fontSize,
    typography,
    shadow,
    accents: scheme === 'dark' ? darkAccents : lightAccents,
    priority: scheme === 'dark' ? darkPriorityColors : priorityColors,
    isDark: scheme === 'dark',
  };
}

/**
 * Blends a colour toward another, for the soft washes.
 *
 * A tenant colour can arrive in any form the branding endpoint accepts; anything that is not a
 * six-digit hex falls back to the base colour rather than producing an invalid string.
 */
export function mix(color: string, toward: string, amount: number): string {
  const a = parseHex(color);
  const b = parseHex(toward);
  if (!a || !b) {
    return toward;
  }
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(a[0], b[0])}${channel(a[1], b[1])}${channel(a[2], b[2])}`;
}

function parseHex(color: string): [number, number, number] | null {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) {
    return null;
  }
  const value = parseInt(hex, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
