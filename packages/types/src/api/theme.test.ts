import { brandingUpdateSchema, DEFAULT_BRANDING } from './branding';
import {
  DEFAULT_THEME_DOCUMENT,
  parseThemeDocument,
  resolveThemeDocument,
  resolvedThemeDocumentSchema,
  themeDocumentSchema,
  THEME_DOCUMENT_VERSION,
} from './theme';

/**
 * These values are written into CSS custom properties, so this schema is the security boundary
 * rather than a convenience. Each refusal below is checked on its own, because "the document was
 * rejected" is not the same claim as "this field was rejected" — a schema that refused everything
 * would pass a single combined assertion and be useless.
 */
describe('themeDocumentSchema — what it refuses', () => {
  it('accepts a minimal document', () => {
    expect(themeDocumentSchema.parse({ version: 1 })).toEqual({ version: 1 });
  });

  it('refuses a version it does not understand', () => {
    expect(themeDocumentSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(themeDocumentSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(themeDocumentSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a colour that is not #rrggbb', () => {
    for (const primary of ['red', '#fff', '#3b5fa0ff', 'rgb(1,2,3)', 'var(--x)']) {
      expect(
        themeDocumentSchema.safeParse({ version: 1, colors: { brandPrimary: primary } }).success,
      ).toBe(false);
    }
    expect(
      themeDocumentSchema.safeParse({ version: 1, colors: { brandPrimary: '#3b5fa0' } }).success,
    ).toBe(true);
  });

  it('refuses a length with no unit, a wrong unit or an expression', () => {
    for (const value of ['12', '12pt', '12vw', 'calc(1px + 1px)', '1e3px', '-4px']) {
      expect(themeDocumentSchema.safeParse({ version: 1, radius: { md: value } }).success).toBe(
        false,
      );
    }
    expect(themeDocumentSchema.safeParse({ version: 1, radius: { md: '6px' } }).success).toBe(true);
    expect(themeDocumentSchema.safeParse({ version: 1, radius: { pill: '999px' } }).success).toBe(
      true,
    );
  });

  /** The declaration-escape case: a value that closes the property and opens a rule of its own. */
  it('refuses a value that tries to escape the declaration', () => {
    const escapes = [
      '#3b5fa0; } html { background: red',
      'url(https://example.test/x.png)',
      'expression(alert(1))',
      '/* */ red',
    ];
    for (const value of escapes) {
      expect(
        themeDocumentSchema.safeParse({ version: 1, colors: { surface: value } }).success,
      ).toBe(false);
      expect(
        themeDocumentSchema.safeParse({ version: 1, spacing: { space1: value } }).success,
      ).toBe(false);
      expect(
        themeDocumentSchema.safeParse({ version: 1, typography: { fontSans: value } }).success,
      ).toBe(false);
    }
  });

  it('refuses an over-long string even when it is otherwise well formed', () => {
    const longStack = `${'Aaaaaaaaaa, '.repeat(20)}sans-serif`;
    expect(longStack.length).toBeGreaterThan(160);
    expect(
      themeDocumentSchema.safeParse({ version: 1, typography: { fontSans: longStack } }).success,
    ).toBe(false);
    expect(
      themeDocumentSchema.safeParse({ version: 1, radius: { md: `${'9'.repeat(20)}px` } }).success,
    ).toBe(false);
  });

  it('refuses a shadow that is not a single pinned layer', () => {
    for (const value of ['0 0 0 red', 'inset 0 1px 2px rgba(0, 0, 0, 0.1)', '0 1px 2px #000000']) {
      expect(themeDocumentSchema.safeParse({ version: 1, shadow: { sm: value } }).success).toBe(
        false,
      );
    }
    expect(
      themeDocumentSchema.safeParse({ version: 1, shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)' } })
        .success,
    ).toBe(true);
    expect(
      themeDocumentSchema.safeParse({
        version: 1,
        focus: { ring: '0 0 0 3px rgba(59, 95, 160, 0.35)' },
      }).success,
    ).toBe(true);
  });

  it('refuses a line height that is a string or out of range', () => {
    expect(
      themeDocumentSchema.safeParse({ version: 1, typography: { lineHeight: '1.45' } }).success,
    ).toBe(false);
    expect(
      themeDocumentSchema.safeParse({ version: 1, typography: { lineHeight: 40 } }).success,
    ).toBe(false);
    expect(
      themeDocumentSchema.safeParse({ version: 1, typography: { lineHeight: 1.45 } }).success,
    ).toBe(true);
  });

  it('refuses an unknown family or token rather than silently dropping it', () => {
    expect(themeDocumentSchema.safeParse({ version: 1, motion: { fast: '1ms' } }).success).toBe(
      false,
    );
    expect(themeDocumentSchema.safeParse({ version: 1, radius: { huge: '99px' } }).success).toBe(
      false,
    );
  });

  it('returns null instead of throwing for a document that does not parse', () => {
    expect(parseThemeDocument({ version: 9 })).toBeNull();
    expect(parseThemeDocument(undefined)).toBeNull();
    expect(parseThemeDocument({ version: 1 })).toEqual({ version: 1 });
  });
});

describe('resolveThemeDocument — a partial document is a partial override', () => {
  it('fills every token from the defaults when nothing is stated', () => {
    expect(resolveThemeDocument()).toEqual(DEFAULT_THEME_DOCUMENT);
    expect(resolvedThemeDocumentSchema.safeParse(resolveThemeDocument()).success).toBe(true);
  });

  it('overrides only the tokens a layer names', () => {
    const resolved = resolveThemeDocument({
      version: THEME_DOCUMENT_VERSION,
      colors: { brandPrimary: '#112233' },
    });

    expect(resolved.colors.brandPrimary).toBe('#112233');
    expect(resolved.colors.surface).toBe(DEFAULT_THEME_DOCUMENT.colors.surface);
    expect(resolved.radius).toEqual(DEFAULT_THEME_DOCUMENT.radius);
  });

  it('lets a later layer win token by token', () => {
    const resolved = resolveThemeDocument(
      { version: 1, colors: { brandPrimary: '#111111', surface: '#222222' } },
      null,
      { version: 1, colors: { brandPrimary: '#333333' } },
    );

    expect(resolved.colors.brandPrimary).toBe('#333333');
    expect(resolved.colors.surface).toBe('#222222');
  });
});

describe('brandingUpdateSchema', () => {
  it('accepts a change to one field', () => {
    expect(brandingUpdateSchema.parse({ productName: 'Acme Desk' })).toEqual({
      productName: 'Acme Desk',
    });
  });

  it('accepts clearing a logo and refuses a non-URL', () => {
    expect(brandingUpdateSchema.safeParse({ logoUrl: null }).success).toBe(true);
    expect(brandingUpdateSchema.safeParse({ logoUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(brandingUpdateSchema.safeParse({ logoFileId: 'not-a-uuid' }).success).toBe(false);
  });

  /**
   * The logo is an image `src` on the sign-in page. Plain HTTP there is mixed content on an
   * HTTPS deployment and a substitutable picture everywhere else, so it is admitted only where
   * there is no network between the browser and the file.
   */
  it('takes an https logo, and http only on loopback', () => {
    for (const logoUrl of [
      'https://cdn.acme.test/logo.png',
      'http://localhost:5173/logo.png',
      'http://127.0.0.1:8080/logo.png',
      'http://[::1]/logo.png',
      'http://LOCALHOST/logo.png',
    ]) {
      expect(brandingUpdateSchema.safeParse({ logoUrl }).success).toBe(true);
    }
    for (const logoUrl of [
      'http://cdn.acme.test/logo.png',
      'http://127.0.0.1.acme.test/logo.png',
      'ftp://cdn.acme.test/logo.png',
      'data:image/png;base64,AAAA',
      'not a url',
    ]) {
      expect(brandingUpdateSchema.safeParse({ logoUrl }).success).toBe(false);
    }
  });

  it('refuses an unknown field', () => {
    expect(brandingUpdateSchema.safeParse({ colors: { primary: '#112233' } }).success).toBe(false);
  });

  it('carries a theme document through the same validation', () => {
    expect(
      brandingUpdateSchema.safeParse({ theme: { version: 1, colors: { text: 'black' } } }).success,
    ).toBe(false);
    expect(
      brandingUpdateSchema.safeParse({ theme: { version: 1, colors: { text: '#000000' } } })
        .success,
    ).toBe(true);
  });
});

describe('DEFAULT_BRANDING', () => {
  it('projects its three colours from the theme document', () => {
    expect(DEFAULT_BRANDING.colors.primary).toBe(DEFAULT_THEME_DOCUMENT.colors.brandPrimary);
    expect(DEFAULT_BRANDING.colors.secondary).toBe(DEFAULT_THEME_DOCUMENT.colors.brandSecondary);
    expect(DEFAULT_BRANDING.colors.accent).toBe(DEFAULT_THEME_DOCUMENT.colors.brandAccent);
  });
});
