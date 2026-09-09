import { DEFAULT_BRANDING } from '@ashniva/types';
import { COLOR_SCHEME_ATTRIBUTE } from '@ashniva/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { BrandingProvider } from '../providers/BrandingProvider';
import { ColorSchemeToggle } from './ColorSchemeToggle';

function respondWithBranding(branding: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(branding), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function renderToggle() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <ColorSchemeToggle />
      </BrandingProvider>
    </QueryClientProvider>,
  );
}

const root = () => document.documentElement;

describe('ColorSchemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    root().removeAttribute(COLOR_SCHEME_ATTRIBUTE);
    root().style.cssText = '';
    // jsdom has no matchMedia. The default answer is "the system is light", which is what the
    // untouched `system` preference should resolve to.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('paints the document dark and remembers the choice', async () => {
    respondWithBranding(DEFAULT_BRANDING);
    renderToggle();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(root().getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe('dark');
    expect(window.localStorage.getItem('ashniva.color-scheme')).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });

  it('starts in the scheme this browser last chose', async () => {
    window.localStorage.setItem('ashniva.color-scheme', 'dark');
    respondWithBranding(DEFAULT_BRANDING);
    renderToggle();

    await waitFor(() => expect(root().getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe('dark'));
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });

  it('goes back to light, and "Auto" follows a system that is asking for light', async () => {
    window.localStorage.setItem('ashniva.color-scheme', 'dark');
    respondWithBranding(DEFAULT_BRANDING);
    renderToggle();

    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));

    expect(root().getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe('light');
    expect(window.localStorage.getItem('ashniva.color-scheme')).toBe('system');
  });

  /*
   * The interaction that makes any of this non-trivial.
   *
   * A tenant's theme is written as inline custom properties on the root element, and an inline
   * property beats every rule in every stylesheet — so a theme carrying a light `--color-surface`
   * would paint white cards onto the dark page and no CSS could undo it. `applyTheme` is expected
   * to skip the scheme-dependent tokens while dark, leaving them to `tokens.css`; a tenant's own
   * brand colour is not scheme-dependent and must survive.
   */
  it('does not let a tenant theme paint white cards onto a dark page', async () => {
    respondWithBranding({
      ...DEFAULT_BRANDING,
      colors: { primary: '#7a1fa2', secondary: '#000000', accent: '#445566' },
      theme: {
        ...DEFAULT_BRANDING.theme,
        colors: { ...DEFAULT_BRANDING.theme?.colors, surface: '#ffffff', text: '#111111' },
      },
    });
    renderToggle();

    await waitFor(() => expect(root().style.getPropertyValue('--brand-primary')).toBe('#7a1fa2'));
    // Light first: the tenant's surface is applied, because in light it is the right answer.
    expect(root().style.getPropertyValue('--color-surface')).toBe('#ffffff');

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(root().getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe('dark');
    expect(root().style.getPropertyValue('--color-surface')).toBe('');
    expect(root().style.getPropertyValue('--color-text')).toBe('');
    expect(root().style.getPropertyValue('--brand-primary')).toBe('#7a1fa2');
  });
});
