import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { BrandingProvider } from '../../../app/providers/BrandingProvider';
import { setAnonymous } from '../session-store';
import { LoginPage } from './LoginPage';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderLogin() {
  setAnonymous();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>
      </BrandingProvider>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('validates email and password before submitting', () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('shows the API message when the credentials are wrong', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(
          jsonResponse(401, {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid email or password',
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return Promise.reject(new TypeError('offline'));
    });
    renderLogin();
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: 'developer@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'),
    );
  });
});
