import { ROLE_KEYS, SIMILARITY_DECISION, type RoleKey } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { problemKeys } from '../api';
import { similarFixture, suggestionFixture } from '../problem-fixtures';
import { SimilarIssuesPanel } from './SimilarIssuesPanel';

/**
 * The suggested-duplicates panel on a ticket.
 *
 * Two things are being pinned down. The warning is the approved sentence — "Similar issues · N
 * clients on <version>" — and the line under it is the approved reassurance, which is the only
 * reason it is safe to name other clients on this panel at all. And **Confirm duplicate** is
 * disabled for a reader who may suggest but not link, because the approved flow is that somebody
 * asks and somebody senior confirms.
 */
function renderPanel(data = similarFixture(), roleKey: RoleKey = ROLE_KEYS.SUPPORT_EXECUTIVE) {
  setAuthenticated('test-token', sessionUserFor(roleKey));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seeded rather than fetched: the panel's job is to render what the server sent.
  client.setQueryData(problemKeys.similar('ticket-1'), data);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SimilarIssuesPanel ticketId="ticket-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SimilarIssuesPanel', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the approved warning and the line that makes it safe', () => {
    renderPanel();
    expect(screen.getByText('Similar issues · 3 clients on 3.1.4')).toBeInTheDocument();
    expect(
      screen.getByText('Client identities are never shown to other clients.'),
    ).toBeInTheDocument();
    expect(screen.getByText('3 of 3 clients')).toBeInTheDocument();
  });

  it('says how many versions rather than picking one when the reports disagree', () => {
    renderPanel(
      similarFixture({
        clientCount: 2,
        suggestions: [
          suggestionFixture({ productVersion: '3.1.4' }),
          suggestionFixture({ ticketId: 'ticket-3', key: 'T-31', productVersion: '3.2.0' }),
        ],
      }),
    );
    expect(screen.getByText('Similar issues · 2 clients across 2 versions')).toBeInTheDocument();
  });

  it('quotes the matcher’s own reasons for each suggestion', () => {
    renderPanel();
    expect(
      screen.getByText(
        /Zenith Logistics Ltd · 3\.1\.4 · error code ERR_PRN_TIMEOUT · module Billing · version 3\.1\.4/,
      ),
    ).toBeInTheDocument();
  });

  it('lets a support executive confirm a duplicate', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Confirm duplicate' })).toBeEnabled();
  });

  it('disables Confirm for somebody who may only suggest one', () => {
    renderPanel(similarFixture(), ROLE_KEYS.DEVELOPER);
    const confirm = screen.getByRole('button', { name: 'Confirm duplicate' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription(/problem:manage/);
    // Dismissing is still theirs to do: it is the link that needs confirming, not the judgement.
    expect(screen.getByRole('button', { name: 'Not the same' })).toBeEnabled();
  });

  it('keeps a decided pair on the list and stops offering it again', () => {
    renderPanel(
      similarFixture({
        suggestions: [suggestionFixture({ decision: SIMILARITY_DECISION.DISMISSED })],
      }),
    );
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm duplicate' })).not.toBeInTheDocument();
  });

  it('shows nothing at all to a reader who cannot see problems', () => {
    const { container } = renderPanel(similarFixture(), ROLE_KEYS.INTERNAL_EMPLOYEE);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays out of the way when there is nothing to suggest', () => {
    const { container } = renderPanel(similarFixture({ suggestions: [] }));
    expect(container).toBeEmptyDOMElement();
  });
});
