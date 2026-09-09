import { ROLE_KEYS } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { readinessFixture, releaseFixture } from '../release-fixtures';
import { PublishConfirmDialog } from './PublishConfirmDialog';

/**
 * Typing the version back.
 *
 * The server compares the same string and is the check that matters; this one exists so the
 * operator finds out before production rather than after. It must not be the more forgiving of
 * the two: a trimmed or case-folded comparison here would wave through input the server refuses,
 * and — worse — would mean the person never actually read what is on the screen.
 */

function renderDialog(release = releaseFixture()) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.SUPER_ADMIN));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PublishConfirmDialog release={release} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

function publishButton() {
  return screen.getByRole('button', { name: /^Publish to/ });
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText(/Type the version to confirm/), { target: { value } });
}

describe('PublishConfirmDialog', () => {
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => releaseFixture(),
    } as unknown as Response);
  });
  afterEach(() => vi.restoreAllMocks());

  it('refuses to publish until the version is typed exactly', () => {
    renderDialog();

    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAccessibleDescription(
      'Type 2026.09.1 exactly to confirm this publish',
    );

    type('2026.09.2');
    expect(publishButton()).toBeDisabled();
    expect(screen.getByText('That is not this release’s version')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('is no kinder than the server about spacing and capitals', () => {
    renderDialog(releaseFixture({ version: 'v2026.09.1' }));

    type(' v2026.09.1');
    expect(publishButton()).toBeDisabled();

    type('v2026.09.1 ');
    expect(publishButton()).toBeDisabled();

    type('V2026.09.1');
    expect(publishButton()).toBeDisabled();
  });

  it('sends the version exactly as typed once it matches', async () => {
    renderDialog();

    type('2026.09.1');
    expect(publishButton()).toBeEnabled();
    fireEvent.click(publishButton());

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(String(url)).toContain('/releases/release-1/publish');
    expect(JSON.parse(String(init?.body))).toEqual({ confirmVersion: '2026.09.1' });
  });

  it('skips the typing when the project does not ask for it', () => {
    renderDialog(
      releaseFixture({ readiness: readinessFixture({ requiresTypedConfirmation: false }) }),
    );

    expect(screen.queryByLabelText(/Type the version to confirm/)).not.toBeInTheDocument();
    expect(publishButton()).toBeEnabled();
  });

  it('will not publish a release the server has not called publishable', () => {
    renderDialog(
      releaseFixture({
        readiness: readinessFixture({
          publishable: false,
          requiresTypedConfirmation: false,
          gates: [
            { key: 'items', satisfied: true, reason: '2 items included' },
            { key: 'approvals', satisfied: false, reason: 'Waiting on the QA lead' },
            { key: 'qa', satisfied: true, reason: 'All 4 QA checks passed' },
            { key: 'uat', satisfied: true, reason: 'The client has signed off' },
            { key: 'publisher', satisfied: true, reason: 'You may publish releases' },
          ],
        }),
      }),
    );

    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAccessibleDescription('Waiting on the QA lead');
  });
});
