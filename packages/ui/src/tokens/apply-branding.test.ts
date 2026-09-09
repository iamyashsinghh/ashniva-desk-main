import { DEFAULT_BRANDING, DEFAULT_THEME_DOCUMENT } from '@ashniva/types';

import {
  applyBrandingToDocument,
  applyCssProperties,
  darkenHexColor,
  tintHexColor,
} from './apply-branding';

describe('applyBrandingToDocument', () => {
  it('writes brand colours into CSS custom properties', () => {
    const root = document.createElement('div');
    applyBrandingToDocument(
      {
        ...DEFAULT_BRANDING,
        colors: { primary: '#112233', secondary: '#000000', accent: '#445566' },
      },
      root,
    );

    expect(root.style.getPropertyValue('--brand-primary')).toBe('#112233');
    expect(root.style.getPropertyValue('--brand-secondary')).toBe('#000000');
    expect(root.style.getPropertyValue('--brand-accent')).toBe('#445566');
    expect(root.style.getPropertyValue('--brand-primary-hover')).toBe(darkenHexColor('#112233'));
    expect(root.style.getPropertyValue('--brand-primary-soft')).toBe(tintHexColor('#112233'));
  });

  it('writes the whole token document, not only the brand colours', () => {
    const root = document.createElement('div');
    applyBrandingToDocument(
      {
        ...DEFAULT_BRANDING,
        theme: {
          ...DEFAULT_THEME_DOCUMENT,
          radius: { ...DEFAULT_THEME_DOCUMENT.radius, md: '2px' },
          typography: { ...DEFAULT_THEME_DOCUMENT.typography, lineHeight: 1.7 },
        },
      },
      root,
    );

    expect(root.style.getPropertyValue('--radius-md')).toBe('2px');
    expect(root.style.getPropertyValue('--line-height')).toBe('1.7');
    expect(root.style.getPropertyValue('--focus-ring')).toBe(DEFAULT_THEME_DOCUMENT.focus.ring);
  });
});

describe('applyCssProperties — the allow-list', () => {
  it('writes a property that is on the list', () => {
    const root = document.createElement('div');
    expect(applyCssProperties({ '--color-bg': '#ffffff' }, root)).toEqual([]);
    expect(root.style.getPropertyValue('--color-bg')).toBe('#ffffff');
  });

  /**
   * The one that matters. A theme that could name its own property could reach tokens nobody
   * reviewed — the semantic tones, the priority colours, the touch target — or invent properties
   * a future stylesheet might read.
   */
  it('drops a property that is not on the list', () => {
    const root = document.createElement('div');
    const dropped = applyCssProperties(
      { '--tone-danger-bg': '#e3efe6', '--touch-target': '1px', '--not-a-token': 'x' },
      root,
    );

    expect(dropped).toEqual(['--tone-danger-bg', '--touch-target', '--not-a-token']);
    expect(root.style.getPropertyValue('--tone-danger-bg')).toBe('');
    expect(root.style.getPropertyValue('--touch-target')).toBe('');
    expect(root.style.getPropertyValue('--not-a-token')).toBe('');
  });

  it('keeps the allowed properties in a mixed batch', () => {
    const root = document.createElement('div');
    const dropped = applyCssProperties({ '--radius-lg': '10px', '--sidebar-width': '900px' }, root);

    expect(dropped).toEqual(['--sidebar-width']);
    expect(root.style.getPropertyValue('--radius-lg')).toBe('10px');
    expect(root.style.getPropertyValue('--sidebar-width')).toBe('');
  });
});

describe('colour helpers', () => {
  it('darkens each channel', () => {
    expect(darkenHexColor('#ffffff', 0.5)).toBe('#808080');
  });

  it('tints towards white', () => {
    expect(tintHexColor('#000000', 1)).toBe('#ffffff');
  });

  it('returns invalid input unchanged', () => {
    expect(darkenHexColor('blue')).toBe('blue');
  });
});
