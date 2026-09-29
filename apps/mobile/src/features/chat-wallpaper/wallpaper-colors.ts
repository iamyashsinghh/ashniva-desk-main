import type { ThemeColors } from '../../shared/theme/theme';

/**
 * The theme colours a chat may be painted with.
 *
 * Token names rather than values, so a wallpaper follows dark mode and the tenant's brand colour.
 * `primary` itself is left out on purpose: your own bubbles are drawn in it, and would vanish.
 */
export const WALLPAPER_COLOR_TOKENS = [
  'primarySoft',
  'infoSoft',
  'successSoft',
  'warningSoft',
  'dangerSoft',
  'surfaceSunken',
  'info',
  'success',
  'warning',
] as const satisfies readonly (keyof ThemeColors)[];

export type WallpaperColorToken = (typeof WALLPAPER_COLOR_TOKENS)[number];

export const WALLPAPER_COLOR_LABELS: Record<WallpaperColorToken, string> = {
  primarySoft: 'Soft brand',
  infoSoft: 'Soft blue',
  successSoft: 'Soft green',
  warningSoft: 'Soft amber',
  dangerSoft: 'Soft rose',
  surfaceSunken: 'Stone',
  info: 'Blue',
  success: 'Green',
  warning: 'Amber',
};

export function isWallpaperColorToken(value: unknown): value is WallpaperColorToken {
  return (WALLPAPER_COLOR_TOKENS as readonly unknown[]).includes(value);
}
