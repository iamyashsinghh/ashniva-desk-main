import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { CredentialReveal } from './CredentialReveal';

/**
 * The timed reveal, which is the one place a password reaches the browser.
 *
 * Two things are worth a test and nothing else here is: that it stops showing the password when
 * the server's countdown runs out, and that no cache is left holding a copy afterwards.
 */

const SECRET = 'correct-horse-battery-staple';

function renderReveal() {
  setAuthenticated('test-token', sessionUserFor('TESTER'));
  // A plain object rather than a real Response: reading a Response body needs timers this test
  // has replaced with fake ones.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      username: 'qa@acme.test',
      secret: SECRET,
      visibleForSeconds: 60,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  } as unknown as Response);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <CredentialReveal grantId="grant-1" />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

/**
 * Testing Library's own waiting helpers use timers this test has faked, so the reveal request is
 * settled by flushing the microtask queue inside `act` instead of by polling the DOM.
 */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CredentialReveal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides the password again once the server’s countdown runs out', async () => {
    renderReveal();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal password' }));
    await settle();

    expect(screen.getByText(SECRET)).toBeInTheDocument();

    // 59 seconds in it is still on screen; the sixtieth is the one that clears it.
    act(() => void vi.advanceTimersByTime(59_000));
    expect(screen.getByText(SECRET)).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(1_000));
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal again' })).toBeInTheDocument();
  });

  it('forgets the password when the tester hides it early', async () => {
    renderReveal();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal password' }));
    await settle();
    expect(screen.getByText(SECRET)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide it now' }));
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it('leaves no copy in any React Query cache', async () => {
    const { queryClient } = renderReveal();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal password' }));
    await settle();
    expect(screen.getByText(SECRET)).toBeInTheDocument();

    // A cached secret would outlive the countdown and be readable from anywhere in the app. The
    // mutation cache counts too, which is why the component resets the mutation after reading it.
    const queries = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((entry) => entry.state),
    );
    const mutations = JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((entry) => entry.state),
    );
    expect(queries).not.toContain(SECRET);
    expect(mutations).not.toContain(SECRET);
  });

  it('explains itself instead of offering a reveal nobody may use', () => {
    setAuthenticated('test-token', sessionUserFor('TESTER'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CredentialReveal grantId={null} unavailableReason="Ask for access first" />
      </QueryClientProvider>,
    );

    const button = screen.getByRole('button', { name: 'Reveal password' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Ask for access first');
  });
});
