import { Logger } from '@nestjs/common';

import type { OrganizationsRepository } from '../organizations/organizations.repository';
import { BrandingStore } from './branding-store.service';

/**
 * The two readings, and why there are two.
 *
 * A stored branding blob can stop parsing without anybody touching it: `logoUrl` used to admit
 * any URL `new URL()` would parse, the theme document is `.strict()`, and until the write path
 * existed a hand-edited row was the only way to set a theme at all. So "this row does not parse"
 * is an ordinary state of a real database, and what happens next depends entirely on who is
 * waiting for the answer — a person who has not signed in yet, or the administrator whose screen
 * is about that very row.
 */
describe('BrandingStore — a row it cannot read', () => {
  /** A row shaped by an older, laxer rule: `ftp:` was a URL that `new URL()` parsed happily. */
  const LEGACY_SETTINGS = {
    branding: { productName: 'Acme Desk', logoUrl: 'ftp://cdn.acme.test/logo.png' },
  };

  let warn: jest.SpyInstance;

  function store(): BrandingStore {
    return new BrandingStore({} as unknown as OrganizationsRepository);
  }

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads it as no overrides at all, rather than throwing on the public path', () => {
    expect(store().read(LEGACY_SETTINGS)).toEqual({});
  });

  it('says so in the log, naming the field and never its value', () => {
    store().read(LEGACY_SETTINGS);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('logoUrl');
    // The value is what failed validation; a log line is not the place to repeat it.
    expect(message).not.toContain('ftp://cdn.acme.test/logo.png');
  });

  it('still refuses it strictly, for the screen whose subject it is', () => {
    expect(() => store().readStrict(LEGACY_SETTINGS)).toThrow();
  });

  it('reads a valid row identically either way', () => {
    const settings = { branding: { productName: 'Acme Desk', logoText: 'AC' } };
    expect(store().read(settings)).toEqual({ productName: 'Acme Desk', logoText: 'AC' });
    expect(store().readStrict(settings)).toEqual(store().read(settings));
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats an absent branding key as no overrides, quietly, in both readings', () => {
    for (const settings of [null, undefined, {}, { branding: null }, { branding: 'nonsense' }]) {
      expect(store().read(settings)).toEqual({});
      expect(store().readStrict(settings)).toEqual({});
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
