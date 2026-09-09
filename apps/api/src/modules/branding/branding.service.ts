import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  brandingSchema,
  DEFAULT_BRANDING,
  resolveThemeDocument,
  type Branding,
  type ResolvedThemeDocument,
  type StoredBranding,
  type ThemeSourceReadiness,
} from '@ashniva/types';

import type { Organization } from '../../generated/prisma/client';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { BrandingStore } from './branding-store.service';
import { THEME_SOURCE, type ThemeContext, type ThemeSource } from './theme/theme-source.interface';

/**
 * Resolves the branding shown by the web and mobile apps.
 *
 * The resolution order is the whole point, and it runs from most specific to most reliable:
 *
 *   1. whatever the configured theme source has for this organization — the Theme Manager's last
 *      good document, or, for the local source, the tenant's own stored theme;
 *   2. the organization's stored branding, which is what Desk has always used;
 *   3. `DEFAULT_BRANDING`, which is compiled in and cannot fail.
 *
 * Each step is an override over the one below it rather than a replacement, so a document that
 * mentions two tokens changes two tokens. Nothing in step 1 can throw — see `ThemeSource` — which
 * is what makes it true that a Theme Manager outage costs a tenant their newest tokens and
 * nothing else. `GET /branding` is public and is the first request the sign-in page makes.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly organizations: OrganizationsRepository,
    private readonly store: BrandingStore,
    @Inject(THEME_SOURCE) private readonly themeSource: ThemeSource,
  ) {}

  async getBranding(organizationSlug?: string): Promise<Branding> {
    const organization = await this.requireOrganization(organizationSlug);
    const stored = this.store.read(organization?.settings);
    const sourceDocument = organization
      ? await this.themeSource.load(contextOf(organization))
      : null;

    // The source wins over the stored document, and both win over the built-in theme.
    const theme = resolveThemeDocument(stored.theme, sourceDocument);
    return brandingSchema.parse({
      productName: stored.productName ?? DEFAULT_BRANDING.productName,
      logoText: stored.logoText ?? DEFAULT_BRANDING.logoText,
      logoUrl: stored.logoUrl ?? DEFAULT_BRANDING.logoUrl,
      logoFileId: stored.logoFileId ?? DEFAULT_BRANDING.logoFileId,
      ...projectBrandColors(theme, stored),
    });
  }

  /** The readiness of the configured source, for the administration screen that governs it. */
  async themeSourceReadiness(organizationId: string): Promise<ThemeSourceReadiness> {
    const organization = await this.organizations.findById(organizationId);
    return this.themeSource.readiness(organization ? contextOf(organization) : null);
  }

  private async requireOrganization(slug?: string): Promise<Organization | null> {
    const organization = slug
      ? await this.organizations.findBySlug(slug)
      : await this.organizations.findServiceProvider();
    if (slug && !organization) {
      throw new NotFoundException(`Organization "${slug}" not found`);
    }
    return organization;
  }
}

function contextOf(organization: Organization): ThemeContext {
  return { organizationId: organization.id, organizationSlug: organization.slug };
}

/**
 * Keeps `colors` and `theme.colors` saying the same thing.
 *
 * `colors` is the three-colour summary every existing consumer reads, and rows written before the
 * token document existed still carry it. So the legacy value wins where it is present, and it is
 * written back into the theme rather than left beside it — otherwise the logo mark and the CSS
 * variable behind it would come from two different places and eventually disagree.
 */
function projectBrandColors(
  theme: ResolvedThemeDocument,
  stored: StoredBranding,
): { colors: Branding['colors']; theme: ResolvedThemeDocument } {
  const colors = {
    primary: stored.colors?.primary ?? theme.colors.brandPrimary,
    secondary: stored.colors?.secondary ?? theme.colors.brandSecondary,
    accent: stored.colors?.accent ?? theme.colors.brandAccent,
  };
  return {
    colors,
    theme: {
      ...theme,
      colors: {
        ...theme.colors,
        brandPrimary: colors.primary,
        brandSecondary: colors.secondary,
        brandAccent: colors.accent,
      },
    },
  };
}
