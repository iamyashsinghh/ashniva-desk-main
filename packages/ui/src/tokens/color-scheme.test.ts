import { DEFAULT_BRANDING } from '@ashniva/types';

import { applyBrandingToDocument, applyTheme } from './apply-branding';
import {
  applyColorScheme,
  COLOR_SCHEME_ATTRIBUTE,
  currentColorScheme,
  resolveColorScheme,
  SCHEME_DEPENDENT_CSS_PROPERTIES,
} from './color-scheme';

function stubPrefersDark(matches: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') && matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('resolveColorScheme', () => {
  it('takes an explicit choice at face value', () => {
    expect(resolveColorScheme('light')).toBe('light');
    expect(resolveColorScheme('dark')).toBe('dark');
  });

  it('asks the operating system for "system"', () => {
    const restore = stubPrefersDark(true);
    expect(resolveColorScheme('system')).toBe('dark');
    restore();
  });

  it('falls back to light when the operating system says nothing', () => {
    const restore = stubPrefersDark(false);
    expect(resolveColorScheme('system')).toBe('light');
    restore();
  });
});

describe('applyColorScheme', () => {
  it('marks the element so tokens.css can select on it', () => {
    const root = document.createElement('div');
    expect(applyColorScheme('dark', root)).toBe('dark');
    expect(root.getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe('dark');
    expect(currentColorScheme(root)).toBe('dark');
  });

  /**
   * The one that matters. Branding is applied at sign-in; the scheme can change afterwards. An
   * inline style beats every stylesheet rule, so a light `--color-surface` left behind would
   * paint white cards onto a dark page and nothing in CSS could take it back.
   */
  it('clears the light surface colours branding left inline when going dark', () => {
    const root = document.createElement('div');
    applyBrandingToDocument(DEFAULT_BRANDING, root);
    expect(root.style.getPropertyValue('--color-surface')).not.toBe('');

    applyColorScheme('dark', root);

    for (const property of SCHEME_DEPENDENT_CSS_PROPERTIES) {
      expect(root.style.getPropertyValue(property)).toBe('');
    }
  });

  it('leaves the brand colours alone — they are the point of branding', () => {
    const root = document.createElement('div');
    applyBrandingToDocument(
      {
        ...DEFAULT_BRANDING,
        colors: { primary: '#112233', secondary: '#000000', accent: '#445566' },
      },
      root,
    );
    applyColorScheme('dark', root);

    expect(root.style.getPropertyValue('--brand-primary')).toBe('#112233');
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#445566');
  });
});

describe('applyBrandingToDocument on a dark page', () => {
  it('reports the scheme-dependent tokens it declined to write', () => {
    const root = document.createElement('div');
    root.setAttribute(COLOR_SCHEME_ATTRIBUTE, 'dark');

    const notApplied = applyBrandingToDocument(DEFAULT_BRANDING, root);

    expect(notApplied).toEqual(expect.arrayContaining(['--color-surface', '--color-text']));
    expect(root.style.getPropertyValue('--color-surface')).toBe('');
    // Geometry and type are the same design in both schemes, so they still apply.
    expect(root.style.getPropertyValue('--radius-lg')).not.toBe('');
    expect(root.style.getPropertyValue('--font-sans')).not.toBe('');
  });
});

describe('applyTheme', () => {
  it('sets the scheme and applies branding in an order that leaves neither half-done', () => {
    const root = document.createElement('div');

    expect(applyTheme(DEFAULT_BRANDING, 'dark', root)).toBe('dark');
    expect(root.style.getPropertyValue('--color-bg')).toBe('');

    expect(applyTheme(DEFAULT_BRANDING, 'light', root)).toBe('light');
    expect(root.style.getPropertyValue('--color-bg')).toBe(
      DEFAULT_BRANDING.theme.colors.background,
    );
  });
});
