import { REAUTH_HEADER, ROLE_KEYS, type BillingProfile } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { BillingSettingsPage } from './BillingSettingsPage';

/**
 * The billing settings screen.
 *
 * `PUT /settings/billing` carries `@RequireRecentAuth()`, so a save without the re-authentication
 * header is a 403 for everybody. That is what shipped: the screen never asked for the password,
 * and a person saw "Confirm your password to continue" with no prompt to confirm it in. These
 * tests hold the client to the contract the route states — a password prompt, then the header on
 * the request — and to not blanking what the form does not show.
 */

const profile: BillingProfile = {
  legalName: 'Ashniva Technologies Private Limited',
  addressLine1: '4th Floor, Tech Park',
  addressLine2: null,
  city: 'Bengaluru',
  state: 'Karnataka',
  stateCode: '29',
  postalCode: '560001',
  country: 'India',
  gstin: '29AABCU9603R1ZM',
  pan: 'AABCU9603R',
  email: 'billing@ashniva.example',
  phone: null,
  currency: 'INR',
  paymentTermsDays: 30,
  defaultTaxRate: '18.00',
  defaultTaxTreatment: 'EXCLUSIVE',
  roundTotals: true,
  invoicePrefix: 'INV',
  nextSequence: 7,
  sequenceYear: '2026-27',
  financialYearStartMonth: 4,
  logoFileId: 'file-logo',
  signatureFileId: 'file-signature',
  bankDetails: 'HDFC Bank · A/C 50200012345678',
  terms: 'Payment due within 30 days.',
  internalNotes: null,
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

/** The page reads four endpoints; the two list ones must answer with lists, not the profile. */
function answerFor(url: string): unknown {
  if (url.includes('/auth/reauth')) {
    return { reauthToken: 'fresh-token' };
  }
  if (url.includes('/settings/billing/clients') || url.includes('/organizations')) {
    return [];
  }
  return profile;
}

function renderPage(): Call[] {
  const calls: Call[] = [];
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.SUPER_ADMIN));
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined;
      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        body,
      });

      const json = answerFor(url);
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
        <BillingSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

/** Presses Save, answers the password prompt, and returns the PUT that went out. */
async function saveWithPassword(calls: Call[]): Promise<Call> {
  fireEvent.click(await screen.findByRole('button', { name: 'Save billing details' }));

  // The route asks for the password again, so the screen has to ask for it too.
  const password = await screen.findByLabelText(/sign-in password/i);
  fireEvent.change(password, { target: { value: 'hunter2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
  const put = calls.find((call) => call.method === 'PUT');
  if (!put) {
    throw new Error('no PUT was sent');
  }
  return put;
}

describe('BillingSettingsPage', () => {
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

  it('sends the re-authentication header the save is guarded by', async () => {
    const calls = renderPage();
    const put = await saveWithPassword(calls);

    expect(put.url).toContain('/settings/billing');
    expect(put.headers[REAUTH_HEADER]).toBe('fresh-token');
  });

  it('leaves out the fields it does not show, rather than blanking them', async () => {
    // The PUT is a full replace. Sending nothing for a field the form has no input for is what
    // keeps the logo and the signature; sending a default is what silently deleted them.
    const calls = renderPage();
    const put = await saveWithPassword(calls);

    expect(put.body).not.toHaveProperty('logoFileId');
    expect(put.body).not.toHaveProperty('signatureFileId');
    // The financial year is shown now, so it is sent — as the number it was loaded with.
    expect(put.body?.financialYearStartMonth).toBe(4);
  });

  it('sends nothing at all for an optional field that was cleared', async () => {
    const calls = renderPage();
    fireEvent.change(await screen.findByLabelText('Invoice prefix'), { target: { value: '' } });

    const put = await saveWithPassword(calls);
    // `""` fails validation, so clearing the box told the person their prefix was invalid when
    // they meant to fall back to the default.
    expect(put.body).not.toHaveProperty('invoicePrefix');
  });
});
