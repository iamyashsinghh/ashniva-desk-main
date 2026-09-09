import { DEFAULT_BRANDING, DEFAULT_THEME_DOCUMENT } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import { BrandingProvider } from './BrandingProvider';
import { useBranding } from './branding-context';

function ProductName() {
  const { branding } = useBranding();
  return <span data-testid="name">{branding.productName}</span>;
}

function renderWithBranding() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <ProductName />
      </BrandingProvider>
    </QueryClientProvider>,
  );
}

describe('BrandingProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.cssText = '';
  });

  it('applies branding from the API to CSS variables and the document title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          productName: 'Acme Desk',
          logoText: 'AC',
          logoUrl: null,
          colors: { primary: '#112233', secondary: '#000000', accent: '#445566' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderWithBranding();

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Acme Desk'));
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#112233');
    expect(document.title).toBe('Acme Desk');
  });

  it('applies the token document, and drops a token that is not on the allow-list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...DEFAULT_BRANDING,
          theme: {
            ...DEFAULT_THEME_DOCUMENT,
            radius: { ...DEFAULT_THEME_DOCUMENT.radius, md: '2px' },
            // Not a token this build knows. The response schema refuses it, so nothing downstream
            // ever has the chance to write it into the document.
            colors: { ...DEFAULT_THEME_DOCUMENT.colors, surface: '#fafafa' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderWithBranding();

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--radius-md')).toBe('2px'),
    );
    expect(document.documentElement.style.getPropertyValue('--color-surface')).toBe('#fafafa');
    expect(document.documentElement.style.getPropertyValue('--tone-danger-bg')).toBe('');
  });

  it('falls back to the default branding when the API is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network down'));

    renderWithBranding();

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ashniva Desk'));
    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('#3b5fa0');
  });
});
