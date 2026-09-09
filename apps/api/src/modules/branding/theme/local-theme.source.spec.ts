import { Logger } from '@nestjs/common';
import { THEME_DOCUMENT_VERSION } from '@ashniva/types';

import { BrandingStore } from '../branding-store.service';
import type { OrganizationsRepository } from '../../organizations/organizations.repository';
import { LocalThemeSource } from './local-theme.source';
import type { ThemeContext } from './theme-source.interface';

const CONTEXT: ThemeContext = { organizationId: 'org-1', organizationSlug: 'acme' };

function build(settings: unknown) {
  const organizations = {
    findById: jest.fn().mockResolvedValue({ id: 'org-1', slug: 'acme', settings }),
  } as unknown as OrganizationsRepository;
  return new LocalThemeSource(new BrandingStore(organizations));
}

/**
 * `ThemeSource` writes down that `load` never throws, because it is called from `GET /branding`,
 * which is `@Public()` and is the first request the sign-in page makes. The local source is the
 * default, so it is the implementation that invariant matters most for — and the way to break it
 * is not an outage but an ordinary row this build can no longer parse.
 */
describe('LocalThemeSource.load never throws', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('serves the stored document when the row parses', async () => {
    const theme = { version: THEME_DOCUMENT_VERSION, colors: { brandPrimary: '#112233' } };
    await expect(build({ branding: { theme } }).load(CONTEXT)).resolves.toEqual(theme);
  });

  it('resolves to null for a row it cannot read, rather than rejecting', async () => {
    // Legal before `logoUrl` was narrowed to http(s), and still sitting in real settings columns.
    const settings = { branding: { logoUrl: 'ftp://cdn.acme.test/logo.png' } };
    await expect(build(settings).load(CONTEXT)).resolves.toBeNull();
  });

  it('resolves to null for a hand-written theme this build does not understand', async () => {
    const settings = { branding: { theme: { version: 1, motion: { fast: '1ms' } } } };
    await expect(build(settings).load(CONTEXT)).resolves.toBeNull();
  });

  it('resolves to null for an organization that has no overrides', async () => {
    await expect(build({}).load(CONTEXT)).resolves.toBeNull();
  });
});
