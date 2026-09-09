import { RELEASE_STATUS, ROLE_KEYS } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { releaseFixture } from '../release-fixtures';
import { ReleaseDetailPage } from './ReleaseDetailPage';

/**
 * Getting a published release verified.
 *
 * `PUBLISHED → VERIFIED` is refused unless a LIVE_VERIFICATION assignment on the release has
 * passed, and `requiresLiveVerification` defaults on — so this screen has to be able to ask for
 * one. Until it could, "Verify live" answered 409 for ever and there was no control anywhere in
 * the application that would have unblocked it.
 */
function renderPage(status: string) {
  setAuthenticated('test-token', sessionUserFor(ROLE_KEYS.PROJECT_MANAGER));
  const release = releaseFixture({
    status: status as ReturnType<typeof releaseFixture>['status'],
    publishedAt: '2026-09-06T08:00:00.000Z',
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const body = url.includes('/releases/release-1') ? release : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/releases/release-1']}>
        <Routes>
          <Route path="/releases/:id" element={<ReleaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReleaseDetailPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers a live check on a published release', async () => {
    renderPage(RELEASE_STATUS.PUBLISHED);
    expect(await screen.findByRole('button', { name: 'Send for live check' })).toBeInTheDocument();
    // And not the staging hand-over: what a released version needs is somebody opening production.
    expect(screen.queryByRole('button', { name: 'Send to testing' })).not.toBeInTheDocument();
  });

  it('offers ordinary QA on a release that has not gone out', async () => {
    renderPage(RELEASE_STATUS.APPROVED);
    expect(await screen.findByRole('button', { name: 'Send to testing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send for live check' })).not.toBeInTheDocument();
  });
});
