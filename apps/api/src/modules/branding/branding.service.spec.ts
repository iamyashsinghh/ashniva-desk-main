import { Logger, NotFoundException } from '@nestjs/common';
import { DEFAULT_BRANDING, DEFAULT_THEME_DOCUMENT, THEME_SOURCE_KEY } from '@ashniva/types';

import type { OrganizationsRepository } from '../organizations/organizations.repository';
import { BrandingStore } from './branding-store.service';
import { BrandingService } from './branding.service';
import type { ThemeSource } from './theme/theme-source.interface';

const NO_THEME_SOURCE: ThemeSource = {
  key: THEME_SOURCE_KEY.LOCAL,
  load: jest.fn().mockResolvedValue(null),
  readiness: jest.fn(),
};

function buildService(
  organizations: Partial<jest.Mocked<OrganizationsRepository>>,
  themeSource: ThemeSource = NO_THEME_SOURCE,
) {
  const repository = organizations as unknown as OrganizationsRepository;
  return new BrandingService(repository, new BrandingStore(repository), themeSource);
}

/** A row shaped like an Organization, with only the fields branding resolution reads. */
function organization(settings: unknown) {
  return { id: 'org-1', slug: 'acme', settings };
}

describe('BrandingService', () => {
  // An unreadable row is warned about; the warning is asserted in `branding-store.service.spec.ts`
  // and only makes noise here.
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('returns the default branding when nothing is stored', async () => {
    const service = buildService({
      findServiceProvider: jest.fn().mockResolvedValue(organization({})),
    });
    await expect(service.getBranding()).resolves.toEqual(DEFAULT_BRANDING);
  });

  it('merges stored overrides over the defaults', async () => {
    const service = buildService({
      findBySlug: jest
        .fn()
        .mockResolvedValue(
          organization({ branding: { productName: 'Acme Desk', colors: { primary: '#123456' } } }),
        ),
    });
    const branding = await service.getBranding('acme');
    expect(branding.productName).toBe('Acme Desk');
    expect(branding.colors.primary).toBe('#123456');
    expect(branding.colors.accent).toBe(DEFAULT_BRANDING.colors.accent);
  });

  /**
   * `GET /branding` is `@Public()` and is the first request the sign-in page makes, so an
   * unreadable row must cost that tenant its customisation and nothing else. Both halves matter:
   * the bad value is not served, *and* the endpoint still answers. Serving `red` would be a
   * broken page; a 500 here is a login screen that cannot render at all.
   */
  it('never serves an invalid stored colour, and never fails the request over one', async () => {
    const service = buildService({
      findServiceProvider: jest
        .fn()
        .mockResolvedValue(organization({ branding: { colors: { primary: 'red' } } })),
    });

    const branding = await service.getBranding();
    expect(branding.colors.primary).toBe(DEFAULT_BRANDING.colors.primary);
    expect(branding).toEqual(DEFAULT_BRANDING);
  });

  /**
   * The regression this exists for. `logoUrl` was `z.string().url()` before the theme document,
   * so rows carrying values the current rule refuses are ordinary rather than hypothetical —
   * and every one of them used to turn the public endpoint into a 500.
   */
  it('serves defaults for a row written under an older, laxer rule', async () => {
    const service = buildService({
      findServiceProvider: jest.fn().mockResolvedValue(
        organization({
          branding: { productName: 'Acme Desk', logoUrl: 'ftp://cdn.acme.test/logo.png' },
        }),
      ),
    });

    const branding = await service.getBranding();
    expect(branding.logoUrl).toBeNull();
    expect(branding.productName).toBe(DEFAULT_BRANDING.productName);
  });

  it('404s for an unknown organization slug', async () => {
    const service = buildService({ findBySlug: jest.fn().mockResolvedValue(null) });
    await expect(service.getBranding('missing')).rejects.toThrow(NotFoundException);
  });

  it('serves a stored token document, defaulting every token it does not mention', async () => {
    const service = buildService({
      findServiceProvider: jest
        .fn()
        .mockResolvedValue(
          organization({ branding: { theme: { version: 1, radius: { md: '2px' } } } }),
        ),
    });

    const branding = await service.getBranding();
    expect(branding.theme.radius.md).toBe('2px');
    expect(branding.theme.radius.lg).toBe(DEFAULT_THEME_DOCUMENT.radius.lg);
    expect(branding.theme.focus.ring).toBe(DEFAULT_THEME_DOCUMENT.focus.ring);
  });

  it('lets the theme source win over the stored document, token by token', async () => {
    const source: ThemeSource = {
      key: THEME_SOURCE_KEY.REMOTE,
      load: jest.fn().mockResolvedValue({ version: 1, colors: { surface: '#fafafa' } }),
      readiness: jest.fn(),
    };
    const service = buildService(
      {
        findServiceProvider: jest.fn().mockResolvedValue(
          organization({
            branding: { theme: { version: 1, colors: { surface: '#111111', text: '#222222' } } },
          }),
        ),
      },
      source,
    );

    const branding = await service.getBranding();
    expect(branding.theme.colors.surface).toBe('#fafafa');
    expect(branding.theme.colors.text).toBe('#222222');
  });

  /**
   * The three-colour summary and the token document are two views of one thing. If they could
   * disagree, the logo mark and the CSS variable behind it would come from different places.
   */
  it('keeps colors and theme.colors saying the same thing', async () => {
    const service = buildService({
      findServiceProvider: jest
        .fn()
        .mockResolvedValue(organization({ branding: { colors: { primary: '#123456' } } })),
    });

    const branding = await service.getBranding();
    expect(branding.theme.colors.brandPrimary).toBe('#123456');
    expect(branding.colors.primary).toBe('#123456');
  });
});
