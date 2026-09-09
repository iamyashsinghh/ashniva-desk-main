import { ROLE_KEYS, UAT_DECISION, type UatRequestDetail } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { releaseFixture } from '../../releases/release-fixtures';
import { ClientSignOffCard } from './ClientSignOffCard';

/**
 * The provider's side of a UAT conversation.
 *
 * `GET /uat/:id` and `POST /uat/:id/comments` are documented as the provider's reply on the
 * thread, and nothing in the application called either: this card printed a status and a note, so
 * a client who asked a question before approving was asking nobody. The sign-off then waits on an
 * answer that will not come, and the UAT gate waits with it.
 */
const REQUEST: UatRequestDetail = {
  id: 'uat-1',
  releaseId: 'release-1',
  taskId: null,
  summaryPlain: 'You can now download last month’s invoices as one PDF.',
  previewUrl: null,
  checklist: [],
  status: UAT_DECISION.PENDING,
  note: null,
  decidedAt: null,
  decidedByName: null,
  createdAt: '2026-09-06T08:00:00.000Z',
  clientOrganizationId: 'org-acme',
  clientName: 'Acme Retail Pvt Ltd',
  releaseVersion: '2026.09.1',
  createdByName: 'Priya S',
  updatedAt: '2026-09-06T08:00:00.000Z',
  comments: [
    {
      id: 'comment-1',
      body: 'Does this include the credit notes?',
      authorName: 'Anita R',
      fromClient: true,
      createdAt: '2026-09-06T09:00:00.000Z',
    },
  ],
};

function renderCard() {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    calls.push({ url, init: init as RequestInit | undefined });
    // The list read is `/uat?releaseId=…`; the thread read is `/uat/<id>`.
    const body = /\/uat\/[^?]/.test(url) ? REQUEST : [REQUEST];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClientSignOffCard release={releaseFixture()} canManage />
    </QueryClientProvider>,
  );
  return calls;
}

describe('ClientSignOffCard', () => {
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

  it('shows the client’s question and lets the provider answer it', async () => {
    const calls = renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Open the thread' }));
    expect(await screen.findByText('Does this include the credit notes?')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Reply/), {
      target: { value: 'It does — credit notes are on page two.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => {
      const posted = calls.find(
        (call) => call.init?.method === 'POST' && call.url.includes('/uat/uat-1/comments'),
      );
      expect(JSON.parse(String(posted?.init?.body))).toEqual({
        body: 'It does — credit notes are on page two.',
      });
    });
  });
});
