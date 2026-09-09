import { DEFAULT_THEME_DOCUMENT, type Branding } from '@ashniva/types';

import {
  applyColorScheme,
  currentColorScheme,
  SCHEME_DEPENDENT_CSS_PROPERTIES,
  type ColorScheme,
  type ColorSchemePreference,
} from './color-scheme';
import { brandCssVariables } from './tokens';
import { SETTABLE_CSS_PROPERTIES, themeCssProperties } from './theme-variables';

/**
 * Derives a slightly darker hover colour from a #rrggbb colour.
 * Kept simple on purpose: reduce each channel by ~15%.
 */
export function darkenHexColor(hexColor: string, amount = 0.15): string {
  const value = hexColor.replace('#', '');
  if (value.length !== 6) {
    return hexColor;
  }
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const darkened = channels.map((channel) => Math.max(0, Math.round(channel * (1 - amount))));
  return '#' + darkened.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

/** Produces a light tint of a brand colour for soft backgrounds (e.g. active nav item). */
export function tintHexColor(hexColor: string, amount = 0.88): string {
  const value = hexColor.replace('#', '');
  if (value.length !== 6) {
    return hexColor;
  }
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const tinted = channels.map((channel) => Math.round(channel + (255 - channel) * amount));
  return '#' + tinted.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

/**
 * Writes custom properties onto an element, dropping anything not on the allow-list.
 *
 * The one place a theme reaches the live document, and the reason it is one place: a property
 * name that arrived with a document is untrusted input, and `setProperty` will happily set a
 * property nobody designed. Dropping is silent by design — a document written against a newer
 * schema should cost the tenant the tokens this build does not know, not the page.
 *
 * Returns the names it refused, so a test can assert the refusal rather than infer it from the
 * absence of an effect.
 */
export function applyCssProperties(
  properties: Readonly<Record<string, string>>,
  root: HTMLElement = document.documentElement,
): string[] {
  const dropped: string[] = [];
  for (const [property, value] of Object.entries(properties)) {
    if (!SETTABLE_CSS_PROPERTIES.has(property)) {
      dropped.push(property);
      continue;
    }
    root.style.setProperty(property, value);
  }
  return dropped;
}

/**
 * Writes the organization's branding into the CSS custom properties defined in tokens.css.
 * Called once by the web app's BrandingProvider; safe to call again when branding changes.
 *
 * The theme document carries every token; the three brand *shades* are still derived here rather
 * than published, because they are a function of the brand colour rather than a decision — asking
 * a theme author to keep a hover colour consistent with the colour it hovers from is how those
 * two drift apart.
 *
 * On a page painted dark, the scheme-dependent colours are skipped rather than written. A theme
 * document describes one palette, and that palette is a light one — writing its white surface
 * inline would beat the dark rules in `tokens.css`, which no later stylesheet could recover from.
 * The names it skipped come back in the return value alongside the ones the allow-list refused,
 * so "my brand colour did not apply" is answerable from one place.
 */
export function applyBrandingToDocument(
  branding: Branding,
  root: HTMLElement = document.documentElement,
): string[] {
  const { primary, accent } = branding.colors;
  const properties: Record<string, string> = {
    ...themeCssProperties(branding.theme ?? DEFAULT_THEME_DOCUMENT),
    // After the document, so the brand colours a caller passed in `colors` win over the theme's
    // and the derived shades match whatever ends up in `--brand-primary`.
    [brandCssVariables.primary]: primary,
    [brandCssVariables.primaryHover]: darkenHexColor(primary),
    [brandCssVariables.primarySoft]: tintHexColor(primary),
    [brandCssVariables.secondary]: branding.colors.secondary,
    [brandCssVariables.accent]: accent,
    [brandCssVariables.accentHover]: darkenHexColor(accent),
  };

  if (currentColorScheme(root) === 'light') {
    return applyCssProperties(properties, root);
  }

  const skipped: string[] = [];
  const applicable: Record<string, string> = {};
  for (const [property, value] of Object.entries(properties)) {
    if (SCHEME_DEPENDENT_CSS_PROPERTIES.has(property)) {
      skipped.push(property);
      continue;
    }
    applicable[property] = value;
  }
  return [...applyCssProperties(applicable, root), ...skipped];
}

/**
 * Paints the document in a colour scheme and applies the organization's branding to it.
 *
 * One call rather than two, and in this order, because the two steps are not independent: the
 * branding applier has to know which scheme it is writing into, and switching scheme has to be
 * followed by a re-application or the page keeps the inline colours of the scheme it just left.
 * Every caller that can do both should use this.
 */
export function applyTheme(
  branding: Branding,
  preference: ColorSchemePreference,
  root: HTMLElement = document.documentElement,
): ColorScheme {
  const scheme = applyColorScheme(preference, root);
  applyBrandingToDocument(branding, root);
  return scheme;
}
