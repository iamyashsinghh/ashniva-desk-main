import type { SupportTierPolicySummary } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { SupportTiersCard } from './SupportTiersCard';

/**
 * What the tiers card promises an administrator.
 *
 * Three of the settings on it — the named owner, the fallback strategy and the availability window
 * — are stored and shown but read by nothing: routing is unchanged whatever they say. Somebody who
 * picks "tell the support executive at once" and is shown no caveat will believe an executive is
 * being told. Saying so on the screen is the whole fix, so it is what this test holds in place.
 */

function tier(over: Partial<SupportTierPolicySummary> = {}): SupportTierPolicySummary {
  return {
    tier: 'STANDARD',
    admissionEnabled: true,
    slaPolicy: null,
    minimumPriority: null,
    callsEnabled: true,
    requesterInitiatedCalls: true,
    dedicatedOwnership: false,
    ackMinutes: null,
    escalationMinutes: null,
    fallbackStrategy: 'SUPPORT_QUEUE',
    availabilityWindow: 'BUSINESS_HOURS',
    configured: false,
    updatedAt: null,
    ...over,
  };
}

function renderCard() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [tier()],
  } as Response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SupportTiersCard canManage />
    </QueryClientProvider>,
  );
}

describe('SupportTiersCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says which settings are recorded only and do not change routing', async () => {
    renderCard();

    // One caveat per inert field: the named owner, the fallback strategy and the window.
    const caveats = await screen.findAllByText(/does not change routing yet/);
    expect(caveats).toHaveLength(3);
    // On the two selects it is wired as the control's description, not merely printed nearby.
    for (const label of ['When nobody is available', 'Availability']) {
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
        /Recorded for the support agreement; it does not change routing yet/,
      );
    }
  });

  it('makes no such claim about the settings that do change behaviour', async () => {
    renderCard();

    // The acknowledgement clock is read by the router, so it must not be labelled inert.
    expect(await screen.findByLabelText('Acknowledge within')).toHaveAccessibleDescription(
      /Blank keeps the project's own/,
    );
  });
});
