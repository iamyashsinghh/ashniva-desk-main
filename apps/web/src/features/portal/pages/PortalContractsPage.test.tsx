import { CONTRACT_STATUS, CONTRACT_TYPE, type PortalContractSummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { setAuthenticated } from '../../auth/session-store';
import { sessionUserFor } from '../../../test/fixtures';
import { PortalContractsPage } from './PortalContractsPage';

/**
 * The remaining-hours row was a number in a `<strong>` with no bar at all, and the equivalent bar
 * elsewhere in the product was `aria-hidden`. It is a `Meter` now, so the figure a client cares
 * about most on this screen carries its own name and its own spoken value.
 */
function contract(over: Partial<PortalContractSummary> = {}): PortalContractSummary {
  return {
    id: 'contract-1',
    number: 'ACM-C-01',
    title: 'Retail platform support',
    type: CONTRACT_TYPE.SUPPORT_HOURS,
    status: CONTRACT_STATUS.ACTIVE,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    renewalDate: null,
    isExpiringSoon: false,
    project: null,
    hours: {
      includedMinutes: 600,
      purchasedMinutes: 0,
      carriedForwardMinutes: 0,
      usedMinutes: 450,
      remainingMinutes: 150,
      isLow: true,
    },
    ...over,
  } as PortalContractSummary;
}

function show(contracts: PortalContractSummary[]) {
  setAuthenticated('test-token', sessionUserFor('CLIENT_ADMIN', true));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(contracts), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PortalContractsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PortalContractsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the hours meter after the contract and gives it a spoken value', async () => {
    show([contract()]);

    const meter = await screen.findByRole('progressbar', {
      name: 'Support hours left on Retail platform support',
    });
    expect(meter).toHaveAttribute('aria-valuetext', '2h 30m of 10h left');
  });

  // Colour is not the only signal: the bar turns red and the words say so as well.
  it('says "Running low" in words as well as in the bar', async () => {
    show([contract()]);
    expect(await screen.findByText('Running low')).toBeInTheDocument();
  });

  it('shows placeholder cards rather than a spinner while it loads', () => {
    show([contract()]);
    expect(screen.getByRole('group', { name: 'Loading contracts' })).toBeInTheDocument();
  });

  it('offers the empty state when the client has no contracts', async () => {
    show([]);
    await waitFor(() => expect(screen.getByText('No contracts yet')).toBeInTheDocument());
  });
});
