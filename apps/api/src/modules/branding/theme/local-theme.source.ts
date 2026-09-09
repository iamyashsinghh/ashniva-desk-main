import { Injectable } from '@nestjs/common';
import { THEME_SOURCE_KEY, type ThemeDocument, type ThemeSourceReadiness } from '@ashniva/types';

import { BrandingStore } from '../branding-store.service';
import type { ThemeContext, ThemeSource } from './theme-source.interface';

/**
 * The theme a tenant edits themselves, in Admin → Branding.
 *
 * This is Desk's behaviour with or without a Theme Manager, and it is what every existing test
 * exercises. It reaches nothing outside the deployment, which is why it is the default: a theme
 * should not be a thing that can be down.
 */
@Injectable()
export class LocalThemeSource implements ThemeSource {
  readonly key = THEME_SOURCE_KEY.LOCAL;

  constructor(private readonly store: BrandingStore) {}

  async load(context: ThemeContext): Promise<ThemeDocument | null> {
    const stored = await this.store.readFor(context.organizationId);
    return stored.theme ?? null;
  }

  async readiness(): Promise<ThemeSourceReadiness> {
    return {
      source: this.key,
      healthy: true,
      ready: [
        'Themes are stored on the organization and edited in Admin → Branding.',
        'Every token is validated on the way in and again on the way out.',
        'Nothing outside the deployment is contacted, so nothing outside it can fail.',
      ],
      missing: [],
      behaviourWhenUnready:
        'Not applicable: the local source depends on nothing that can be unavailable. An ' +
        'organization that has set no overrides is served the built-in Ashniva Desk theme.',
      lastDocumentAt: null,
    };
  }
}
