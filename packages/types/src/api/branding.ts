import { z } from 'zod';

import { themeColorSchema, themeLabelSchema, themeUrlSchema } from './theme-values';
import { DEFAULT_THEME_DOCUMENT, resolvedThemeDocumentSchema, themeDocumentSchema } from './theme';
import type { ThemeSourceReadiness } from './theme-source';

/**
 * Branding is configurable per organization from Admin → Branding.
 * The web app reads it from GET /branding and writes it into CSS custom properties.
 *
 * `colors` is the three-colour summary Desk has always had, and stays: it is what the logo mark,
 * the mobile app and every existing consumer read. `theme` is the full, resolved token document
 * behind it — the same brand colours plus the surface, typography, spacing, radius, shadow and
 * focus families. The two never disagree, because `colors` is projected from `theme` when the
 * response is built rather than stored separately.
 */
export const brandingSchema = z.object({
  productName: themeLabelSchema,
  logoText: z.string().min(1).max(4),
  logoUrl: themeUrlSchema.nullable(),
  /**
   * A logo uploaded through `POST /files` and served by `GET /branding/logo`.
   *
   * An id rather than a URL because the sign-in page is unauthenticated and cannot carry a bearer
   * token to `/files/:id/download`. The client turns this into a request for the organization's
   * *own* logo; it never asks for a file by id, so this being public grants nothing.
   */
  logoFileId: z.string().uuid().nullable().default(null),
  colors: z.object({
    primary: themeColorSchema,
    secondary: themeColorSchema,
    accent: themeColorSchema,
  }),
  /**
   * Defaulted rather than required so an older client, or a cached response written before this
   * field existed, still parses. A response is always complete; a *stored* document never is.
   */
  theme: resolvedThemeDocumentSchema.default(() => DEFAULT_THEME_DOCUMENT),
});

export type Branding = z.infer<typeof brandingSchema>;

/**
 * What `PATCH /admin/branding` accepts.
 *
 * Every field is optional and means "change this"; anything absent is left alone. `logoUrl` and
 * `logoFileId` are nullable so a logo can be removed, which "optional" alone cannot express.
 *
 * `theme` is a partial document, not a resolved one: an administrator sets the four tokens they
 * care about and inherits the rest, and the stored value stays an override rather than becoming a
 * frozen copy of today's defaults.
 */
export const brandingUpdateSchema = z
  .object({
    productName: themeLabelSchema.optional(),
    logoText: z.string().min(1).max(4).optional(),
    logoUrl: themeUrlSchema.nullable().optional(),
    logoFileId: z.string().uuid().nullable().optional(),
    theme: themeDocumentSchema.optional(),
  })
  .strict();

export type BrandingUpdate = z.infer<typeof brandingUpdateSchema>;

/**
 * What is actually kept in `organizations.settings.branding`.
 *
 * Deliberately not `Branding`: the stored value is an override, so `colors` is absent (it is
 * projected from the theme) and every field may be missing. Anything that does not parse is
 * dropped rather than served — see `BrandingService`.
 */
export const storedBrandingSchema = z
  .object({
    productName: themeLabelSchema.optional(),
    logoText: z.string().min(1).max(4).optional(),
    logoUrl: themeUrlSchema.nullable().optional(),
    logoFileId: z.string().uuid().nullable().optional(),
    /** The legacy three-colour shape, still read so existing rows keep working. */
    colors: z
      .object({
        primary: themeColorSchema.optional(),
        secondary: themeColorSchema.optional(),
        accent: themeColorSchema.optional(),
      })
      .optional(),
    theme: themeDocumentSchema.optional(),
  })
  .passthrough();

export type StoredBranding = z.infer<typeof storedBrandingSchema>;

/**
 * What the Admin → Branding screen is given, in one request.
 *
 * Three things, because the screen has to answer three questions that are genuinely different:
 * what does a person actually see (`effective`), what has this tenant chosen to change (`stored`),
 * and is anything else driving the theme (`themeSource`). A screen with only the first cannot tell
 * an inherited default from a deliberate override, and one with only the second cannot show a
 * preview.
 */
export interface AdminBrandingView {
  effective: Branding;
  stored: StoredBranding;
  themeSource: ThemeSourceReadiness;
}

/** Temporary Ashniva Desk branding approved in the design phase (neutral slate blue + green). */
export const DEFAULT_BRANDING: Branding = {
  productName: 'Ashniva Desk',
  logoText: 'AD',
  logoUrl: null,
  logoFileId: null,
  colors: {
    primary: DEFAULT_THEME_DOCUMENT.colors.brandPrimary,
    secondary: DEFAULT_THEME_DOCUMENT.colors.brandSecondary,
    accent: DEFAULT_THEME_DOCUMENT.colors.brandAccent,
  },
  theme: DEFAULT_THEME_DOCUMENT,
};
