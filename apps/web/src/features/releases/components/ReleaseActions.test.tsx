import { RELEASE_STATUS, ROLE_KEYS, type RoleKey } from '@ashniva/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { sessionUserFor } from '../../../test/fixtures';
import { setAuthenticated } from '../../auth/session-store';
import { readinessFixture, releaseFixture } from '../release-fixtures';
import { ReleaseActions } from './ReleaseActions';

/**
 * The Publish button is the server's answer, printed.
 *
 * Nothing in the browser works out whether the approvals are in or QA passed: `publishable`
 * decides whether the button works, and the failing gates' own `reason` strings are the whole of
 * what it says when it does not.
 */

function renderActions(release = releaseFixture(), roleKey: RoleKey = ROLE_KEYS.TEAM_LEAD) {
  setAuthenticated('test-token', sessionUserFor(roleKey));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReleaseActions release={release} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BLOCKED = readinessFixture({
  publishable: false,
  gates: [
    { key: 'items', satisfied: true, reason: '2 items included' },
    { key: 'approvals', satisfied: false, reason: 'Waiting on the QA lead' },
    { key: 'qa', satisfied: false, reason: '2 QA checks failed' },
    { key: 'uat', satisfied: false, reason: 'The client has not been asked to sign off' },
    {
      key: 'publisher',
      satisfied: false,
      reason: 'Publishing needs the release:publish permission',
    },
  ],
});

describe('ReleaseActions', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  });
  afterEach(() => vi.restoreAllMocks());

  it('disables Publish and gives every failing gate’s reason', () => {
    renderActions(releaseFixture({ readiness: BLOCKED }));

    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    for (const gate of BLOCKED.gates.filter((entry) => !entry.satisfied)) {
      expect(publish).toHaveAccessibleDescription(new RegExp(escape(gate.reason)));
    }
    // A satisfied gate is not a complaint, so it stays out of the explanation.
    expect(publish).not.toHaveAccessibleDescription(/2 items included/);
  });

  it('shows a team lead who may approve but not publish why Publish is off', () => {
    renderActions(
      releaseFixture({
        status: RELEASE_STATUS.APPROVAL_REQUESTED,
        readiness: readinessFixture({
          publishable: false,
          gates: [
            { key: 'items', satisfied: true, reason: '2 items included' },
            { key: 'approvals', satisfied: true, reason: 'All 2 sign-offs given' },
            { key: 'qa', satisfied: true, reason: 'All 4 QA checks passed' },
            { key: 'uat', satisfied: true, reason: 'The client has signed off' },
            {
              key: 'publisher',
              satisfied: false,
              reason: 'Publishing needs the release:publish permission',
            },
          ],
        }),
      }),
    );

    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription('Publishing needs the release:publish permission');
  });

  it('enables Publish only when the server says the release is publishable', () => {
    renderActions(releaseFixture(), ROLE_KEYS.SUPER_ADMIN);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  });

  /**
   * Every gate passing is not the same as being publishable: a draft satisfies the checklist and
   * still cannot ship. The button must not fall silent in that case.
   */
  it('still explains itself when no gate is failing but the release is not publishable', () => {
    renderActions(
      releaseFixture({
        status: RELEASE_STATUS.DRAFT,
        readiness: readinessFixture({ publishable: false }),
      }),
    );

    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription('A release that is Draft cannot be published');
  });

  it('offers no Publish button once the release has gone out', () => {
    renderActions(
      releaseFixture({
        status: RELEASE_STATUS.PUBLISHED,
        readiness: readinessFixture({ publishable: false }),
      }),
      ROLE_KEYS.SUPER_ADMIN,
    );

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll back' })).toBeEnabled();
  });
});

/** The gate reasons carry regex metacharacters (".", ":"), so they are matched literally. */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
