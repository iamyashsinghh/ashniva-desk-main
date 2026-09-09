import { z } from 'zod';

import {
  themeColorSchema,
  themeFontStackSchema,
  themeLengthSchema,
  themeRatioSchema,
  themeShadowSchema,
} from './theme-values';

/**
 * The theme document: the versioned shape a theme is published, stored and transported in.
 *
 * It replaces "three colours" as Desk's idea of a theme. The families here are the families that
 * actually exist in `packages/ui/src/tokens/tokens.css` — colour, typography, spacing, radius,
 * shadow and focus — so a document can say everything the design system can express and nothing
 * it cannot.
 *
 * Two rules shape it:
 *
 *  * **Everything below `version` is optional.** A document is an *override* over a complete
 *    default, so a partial one is a partial override and never a half-built page. There is no
 *    such thing as a document that is valid but leaves the app unstyled.
 *  * **Every value is validated against its own kind**, never as a string — see
 *    `theme-values.ts` for why that is the security boundary rather than a nicety.
 */

/**
 * The document shape this build understands.
 *
 * Present so Desk can *refuse* a document rather than half-apply one. A future version may move a
 * token between families or change what a value means; applying the parts that happen to parse
 * would produce a page that is neither the old theme nor the new one, which is worse than keeping
 * the theme already in effect.
 */
export const THEME_DOCUMENT_VERSION = 1;

const themeVersionSchema = z
  .number()
  .int()
  .refine((value) => value === THEME_DOCUMENT_VERSION, {
    message: `Unsupported theme document version — this build understands version ${THEME_DOCUMENT_VERSION}`,
  });

/** Brand, surface, text and status colours. */
export const themeColorsSchema = z
  .object({
    brandPrimary: themeColorSchema,
    brandSecondary: themeColorSchema,
    brandAccent: themeColorSchema,
    background: themeColorSchema,
    surface: themeColorSchema,
    surfaceMuted: themeColorSchema,
    border: themeColorSchema,
    borderSubtle: themeColorSchema,
    borderStrong: themeColorSchema,
    text: themeColorSchema,
    textMuted: themeColorSchema,
    textFaint: themeColorSchema,
    textOnBrand: themeColorSchema,
    danger: themeColorSchema,
  })
  .partial()
  .strict();

export const themeTypographySchema = z
  .object({
    fontSans: themeFontStackSchema,
    fontMono: themeFontStackSchema,
    sizeXs: themeLengthSchema,
    sizeSm: themeLengthSchema,
    sizeMd: themeLengthSchema,
    sizeLg: themeLengthSchema,
    sizeXl: themeLengthSchema,
    size2xl: themeLengthSchema,
    lineHeight: themeRatioSchema,
  })
  .partial()
  .strict();

export const themeSpacingSchema = z
  .object({
    space1: themeLengthSchema,
    space2: themeLengthSchema,
    space3: themeLengthSchema,
    space4: themeLengthSchema,
    space5: themeLengthSchema,
    space6: themeLengthSchema,
    space8: themeLengthSchema,
  })
  .partial()
  .strict();

export const themeRadiusSchema = z
  .object({
    sm: themeLengthSchema,
    md: themeLengthSchema,
    lg: themeLengthSchema,
    pill: themeLengthSchema,
  })
  .partial()
  .strict();

export const themeShadowsSchema = z
  .object({ sm: themeShadowSchema, md: themeShadowSchema })
  .partial()
  .strict();

/** The keyboard focus ring. Its own family because accessibility outranks decoration. */
export const themeFocusSchema = z.object({ ring: themeShadowSchema }).partial().strict();

/**
 * A theme document as published, stored or received.
 *
 * `strict()` on purpose: an unknown key is refused rather than ignored, so a document written
 * against a newer schema fails loudly instead of quietly losing half of itself.
 */
export const themeDocumentSchema = z
  .object({
    version: themeVersionSchema,
    colors: themeColorsSchema.optional(),
    typography: themeTypographySchema.optional(),
    spacing: themeSpacingSchema.optional(),
    radius: themeRadiusSchema.optional(),
    shadow: themeShadowsSchema.optional(),
    focus: themeFocusSchema.optional(),
  })
  .strict();

export type ThemeDocument = z.infer<typeof themeDocumentSchema>;

/**
 * A document with every token filled in — what a renderer is handed, and what `GET /branding`
 * returns. Never stored: it is always the result of layering overrides over the defaults below.
 *
 * Its own schema rather than a cast, so the *response* is validated to the same standard as the
 * input. A resolved document that is missing a token would leave one CSS variable at whatever the
 * stylesheet last set, which is the half-applied theme this design exists to rule out.
 */
export const resolvedThemeDocumentSchema = z
  .object({
    version: themeVersionSchema,
    colors: themeColorsSchema.required(),
    typography: themeTypographySchema.required(),
    spacing: themeSpacingSchema.required(),
    radius: themeRadiusSchema.required(),
    shadow: themeShadowsSchema.required(),
    focus: themeFocusSchema.required(),
  })
  .strict();

export type ResolvedThemeDocument = z.infer<typeof resolvedThemeDocumentSchema>;

/**
 * The approved Ashniva Desk theme, and the floor every override sits on.
 *
 * Kept identical to the `:root` block of `tokens.css`. The CSS file is what the app renders with
 * before any document arrives; this is what it renders with when a document arrives and only
 * mentions two tokens. If the two drifted, turning one token off would move the others.
 */
export const DEFAULT_THEME_DOCUMENT: ResolvedThemeDocument = {
  version: THEME_DOCUMENT_VERSION,
  colors: {
    brandPrimary: '#3b5fa0',
    brandSecondary: '#1b1c1e',
    brandAccent: '#1f6b43',
    background: '#f4f4f2',
    surface: '#ffffff',
    surfaceMuted: '#f6f6f4',
    border: '#e4e4e0',
    borderSubtle: '#efefec',
    borderStrong: '#d6d6d2',
    text: '#1b1c1e',
    textMuted: '#5f6064',
    textFaint: '#6e6f74',
    textOnBrand: '#ffffff',
    danger: '#a8321f',
  },
  typography: {
    fontSans: "'IBM Plex Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontMono: "'IBM Plex Mono', Menlo, Consolas, monospace",
    sizeXs: '11px',
    sizeSm: '12.5px',
    sizeMd: '13.5px',
    sizeLg: '16px',
    sizeXl: '20px',
    size2xl: '26px',
    lineHeight: 1.45,
  },
  spacing: {
    space1: '4px',
    space2: '8px',
    space3: '12px',
    space4: '16px',
    space5: '20px',
    space6: '24px',
    space8: '32px',
  },
  radius: { sm: '4px', md: '6px', lg: '8px', pill: '999px' },
  shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)', md: '0 4px 16px rgba(0, 0, 0, 0.1)' },
  focus: { ring: '0 0 0 3px rgba(59, 95, 160, 0.35)' },
};

/**
 * Layers partial documents over the defaults, later layers winning.
 *
 * Family by family rather than `{...a, ...b}` over the whole object, because a top-level spread
 * would let a layer that mentions one colour erase every other colour in the layer beneath it —
 * which is exactly the "partial document, broken page" this schema exists to prevent.
 */
export function resolveThemeDocument(
  ...layers: readonly (ThemeDocument | null | undefined)[]
): ResolvedThemeDocument {
  const resolved: ResolvedThemeDocument = {
    version: THEME_DOCUMENT_VERSION,
    colors: { ...DEFAULT_THEME_DOCUMENT.colors },
    typography: { ...DEFAULT_THEME_DOCUMENT.typography },
    spacing: { ...DEFAULT_THEME_DOCUMENT.spacing },
    radius: { ...DEFAULT_THEME_DOCUMENT.radius },
    shadow: { ...DEFAULT_THEME_DOCUMENT.shadow },
    focus: { ...DEFAULT_THEME_DOCUMENT.focus },
  };

  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    Object.assign(resolved.colors, definedOnly(layer.colors));
    Object.assign(resolved.typography, definedOnly(layer.typography));
    Object.assign(resolved.spacing, definedOnly(layer.spacing));
    Object.assign(resolved.radius, definedOnly(layer.radius));
    Object.assign(resolved.shadow, definedOnly(layer.shadow));
    Object.assign(resolved.focus, definedOnly(layer.focus));
  }

  return resolved;
}

/** An explicit `undefined` in a layer means "not stated", not "clear the token underneath". */
function definedOnly<T extends object>(family: T | undefined): Partial<T> {
  if (!family) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(family).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * Parses a document that arrived from outside Desk, returning null when it does not parse rather
 * than throwing.
 *
 * Null, not an exception, and only for documents Desk does not own. A Theme Manager that starts
 * serving nonsense must cost a tenant their customisation and nothing else — never a 500 on the
 * endpoint the sign-in page reads. Desk's *own* stored branding gets the same treatment on that
 * public path and the opposite one on the administration screen that governs it; `BrandingStore`
 * has the two readings and the reasoning.
 */
export function parseThemeDocument(value: unknown): ThemeDocument | null {
  const parsed = themeDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
