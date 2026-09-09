import { ROLE_KEYS, TESTING_ASSIGNMENT_KIND, TEST_ENVIRONMENT } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { SendToTestingModal, type SendableKind } from './SendToTestingModal';

/**
 * What this modal actually posts.
 *
 * It is the only caller of `POST /qa/assignments` in the whole application, so the kind it sends
 * is the only kind of testing assignment anybody can create from the UI. While that was hardcoded
 * to QA, no LIVE_VERIFICATION assignment could exist — and `PUBLISHED → VERIFIED` is refused
 * without a passed one, on every project, because `requiresLiveVerification` defaults on.
 */
function renderModal(kind?: SendableKind) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SendToTestingModal
          subject={{
            projectId: 'project-acm',
            releaseId: 'release-1',
            label: '2026.09.1',
            whatToTest: '2026.09.1 — Counter printing fixes',
          }}
          kind={kind}
          onClose={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The submit button, whatever this kind of hand-over happens to call itself. */
function sendButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Send/ });
}

/** The body of the single POST the modal made, parsed. */
function postedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
  );
  if (!call) {
    throw new Error('the modal posted nothing');
  }
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

describe('SendToTestingModal', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    // jsdom renders <dialog> but implements neither showModal nor close, which the Modal calls.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ id: 'assignment-1' }),
      text: () => Promise.resolve('{"id":"assignment-1"}'),
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a QA assignment on staging by default', async () => {
    renderModal();
    fireEvent.click(sendButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBody(fetchMock)).toMatchObject({
      kind: TESTING_ASSIGNMENT_KIND.QA,
      environment: TEST_ENVIRONMENT.STAGING,
      releaseId: 'release-1',
    });
  });

  it('sends a live verification on production when that is what was asked for', async () => {
    renderModal(TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION);
    fireEvent.click(sendButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // The kind is what `verify-live` looks for; the environment is where a live check happens.
    expect(postedBody(fetchMock)).toMatchObject({
      kind: TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION,
      environment: TEST_ENVIRONMENT.PRODUCTION,
      releaseId: 'release-1',
    });
  });
});
