import { INCIDENT_STATUS, ROLE_KEYS, type IncidentDetail } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { incidentFixture } from '../problem-fixtures';
import { IncidentDetailPage } from './IncidentDetailPage';

/**
 * Working an incident rather than only ending one.
 *
 * The page offered Add note, Resolve and Close, so every incident jumped OPEN → RESOLVED:
 * INVESTIGATING, IDENTIFIED and MONITORING were reachable only through `PATCH /incidents/:id`,
 * which nothing called. And the "Nothing linked" empty state instructed the reader to link tickets,
 * tasks and releases while `POST /incidents/:id/links` had no caller at all.
 */
function renderPage(incident: IncidentDetail) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    calls.push({ url, init: init as RequestInit | undefined });
    const body = url.includes('/incidents/incident-1') ? incident : { items: [] };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/incidents/incident-1']}>
        <Routes>
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

describe('IncidentDetailPage', () => {
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

  it('offers the moves the state machine allows from OPEN, and no others', async () => {
    renderPage(incidentFixture({ status: INCIDENT_STATUS.OPEN }));

    expect(await screen.findByRole('button', { name: 'Investigating' })).toBeEnabled();
    // OPEN goes to INVESTIGATING or RESOLVED and nowhere else, so these two are not offered here.
    expect(screen.queryByRole('button', { name: 'Cause identified' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Monitoring the fix' })).not.toBeInTheDocument();
  });

  it('lets an investigated incident be monitored — the status nothing could ever reach', async () => {
    const calls = renderPage(incidentFixture({ status: INCIDENT_STATUS.INVESTIGATING }));

    const monitor = await screen.findByRole('button', { name: 'Monitoring the fix' });
    expect(screen.getByRole('button', { name: 'Cause identified' })).toBeEnabled();
    fireEvent.click(monitor);

    await waitFor(() => {
      const patch = calls.find((call) => call.init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.init?.body))).toMatchObject({
        status: INCIDENT_STATUS.MONITORING,
      });
    });
  });

  it('gives the empty state the control it tells the reader to use', async () => {
    const calls = renderPage(incidentFixture());

    fireEvent.click(await screen.findByRole('button', { name: 'Link work' }));
    const picker = await screen.findByLabelText(/^Ticket/);
    fireEvent.change(picker, { target: { value: '' } });
    // The list is read from the ordinary tickets endpoint, narrowed to the incident's project.
    await waitFor(() => expect(calls.some((call) => call.url.includes('/tickets?'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Link it' })).toBeDisabled();
  });
});
