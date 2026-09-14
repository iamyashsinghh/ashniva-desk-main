import { REAUTH_HEADER, ROLE_KEYS, type ClientBillingProfile } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { ClientBillingCard } from './ClientBillingCard';

/**
 * Recording who an invoice is billed to.
 *
 * `PUT /settings/billing/clients/:id` carries `@RequireRecentAuth()`, exactly like the payee
 * change beside it. This is the same shape of defect this branch exists to fix, so the client is
 * held to it here rather than trusted: a password prompt, then the header on the request, and the
 * client organization in the path rather than smuggled into the body.
 */

const ACME = { id: 'org-acme', name: 'Acme Retail Pvt Ltd' };

const recorded: ClientBillingProfile = {
  clientOrganizationId: ACME.id,
  clientName: ACME.name,
  legalName: 'Acme Retail Private Limited',
  addressLine1: '12 Marine Drive',
  addressLine2: null,
  city: 'Mumbai',
  state: 'Maharashtra',
  stateCode: '27',
  postalCode: '400020',
  country: 'India',
  gstin: '27AABCU9603R1ZM',
  updatedAt: '2026-09-08T04:00:00.000Z',
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function renderCard(existing: ClientBillingProfile[]): Call[] {
  const calls: Call[] = [];
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.SUPER_ADMIN));
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        body:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : undefined,
      });

      const method = init?.method ?? 'GET';
      let json: unknown = recorded;
      if (url.includes('/auth/reauth')) {
        json = { reauthToken: 'fresh-token' };
      } else if (url.includes('/settings/billing/clients') && method === 'GET') {
        json = existing;
      } else if (url.includes('/organizations')) {
        json = [
          { ...ACME, slug: 'acme', isServiceProvider: false },
          { id: 'org-us', name: 'Ashniva', slug: 'ashniva', isServiceProvider: true },
        ];
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(json),
      } as Response);
    },
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClientBillingCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

/** The picker renders its placeholder before the clients arrive, so wait for the real option. */
async function chooseAcme(): Promise<void> {
  await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));
  fireEvent.change(screen.getByLabelText('Client'), { target: { value: ACME.id } });
}

async function chooseAcmeAndSave(calls: Call[]): Promise<Call> {
  await chooseAcme();
  fireEvent.click(await screen.findByRole('button', { name: 'Save client billing details' }));

  fireEvent.change(await screen.findByLabelText(/sign-in password/i), { target: { value: 'hunter2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
  const put = calls.find((call) => call.method === 'PUT');
  if (!put) {
    throw new Error('no PUT was sent');
  }
  return put;
}

describe('ClientBillingCard', () => {
  beforeAll(() => {
    // jsdom renders <dialog> but implements neither showModal nor close, which the Modal calls.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends the re-authentication header, to the client named in the path', async () => {
    const calls = renderCard([recorded]);
    const put = await chooseAcmeAndSave(calls);

    expect(put.url).toContain(`/settings/billing/clients/${ACME.id}`);
    expect(put.headers[REAUTH_HEADER]).toBe('fresh-token');
    // The client is the URL, not a body field that could disagree with it.
    expect(put.body).not.toHaveProperty('clientOrganizationId');
    expect(put.body).toMatchObject({ legalName: recorded.legalName, stateCode: '27' });
  });

  it('offers only client organizations, and marks the ones already recorded', async () => {
    renderCard([recorded]);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));
    const labels = screen.getAllByRole('option').map((option) => option.textContent);
    // The provider is not a client of itself, and has its own billing profile above this card.
    expect(labels).not.toContain('Ashniva');
    expect(labels).toContain(`${ACME.name} · recorded`);
  });

  it('starts empty for a client nobody has recorded, and omits a blank GSTIN', async () => {
    // Unregistered recipients have no GSTIN, and `""` fails validation where absent does not.
    const calls = renderCard([]);
    await chooseAcme();
    expect(await screen.findByLabelText(/Registered name/)).toHaveValue('');

    fireEvent.change(screen.getByLabelText(/Registered name/), {
      target: { value: 'Acme Retail Private Limited' },
    });
    fireEvent.change(screen.getByLabelText(/Address line 1/), {
      target: { value: '12 Marine Dr' },
    });
    fireEvent.change(screen.getByLabelText(/^City/), { target: { value: 'Mumbai' } });
    fireEvent.change(screen.getByLabelText(/^State/), { target: { value: 'Maharashtra' } });
    fireEvent.change(screen.getByLabelText(/Client state code/), { target: { value: '27' } });
    fireEvent.change(screen.getByLabelText(/Postal code/), { target: { value: '400020' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save client billing details' }));
    fireEvent.change(await screen.findByLabelText(/sign-in password/i), { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body).not.toHaveProperty('gstin');
    expect(put?.body).not.toHaveProperty('addressLine2');
  });
});
