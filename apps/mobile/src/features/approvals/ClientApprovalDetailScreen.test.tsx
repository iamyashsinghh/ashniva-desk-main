import { APPROVAL_STATUS, PERMISSIONS, ROLE_KEYS, type PortalApprovalDetail } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { ClientApprovalDetailScreen } from './ClientApprovalDetailScreen';

/**
 * The client's decision screen.
 *
 * Four things are worth proving, and all four are about what the *API* said rather than what the
 * app guessed: that a person the API will not let decide is told so instead of being shown a form
 * that answers 403; that the form appears when it will; that a refusal that needs a reason cannot
 * be sent without one; and that the API's own words are what a failure puts on the screen.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as {
  restoreSession: jest.Mock;
};

const fetchMock = jest.fn();

const CLIENT = sessionUser({
  roleKey: ROLE_KEYS.CLIENT_ADMIN,
  roleName: 'Client Admin',
  permissions: [PERMISSIONS.APPROVAL_DECIDE, PERMISSIONS.PROJECT_READ],
  organization: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Northwind',
    slug: 'northwind',
    isServiceProvider: false,
  },
});

function approval(overrides: Partial<PortalApprovalDetail> = {}): PortalApprovalDetail {
  return {
    id: 'a1',
    title: 'Phase 2 handover',
    status: APPROVAL_STATUS.PUBLISHED,
    subject: { type: 'MILESTONE', id: 'm1', label: 'Phase 2', link: null },
    project: null,
    publishedAt: '2026-09-01T09:00:00.000Z',
    dueDate: null,
    decidedBy: null,
    decidedAt: null,
    isOverdue: false,
    summary: 'Everything in phase two is finished and on staging.',
    decisionComment: null,
    files: [],
    history: [],
    canDecide: true,
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: CLIENT });
});

describe('a request this person may decide', () => {
  it('shows what they are being asked to approve, and the form', async () => {
    fetchMock.mockResolvedValue(jsonResponse(approval()));
    const view = await renderScreen(<ClientApprovalDetailScreen approvalId="a1" />);

    expect(
      await view.findByText('Everything in phase two is finished and on staging.'),
    ).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Approve this' })).toBeTruthy();
  });

  it('will not send a request for changes without saying what they are', async () => {
    fetchMock.mockResolvedValue(jsonResponse(approval()));
    const view = await renderScreen(<ClientApprovalDetailScreen approvalId="a1" />);

    await fireEvent.press(await view.findByRole('tab', { name: 'Ask for changes' }));
    const button = await view.findByRole('button', { name: 'Ask for changes' });
    expect(button.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(button);
    expect(requestedPaths(fetchMock).some((path) => path.includes('request-changes'))).toBe(false);
  });

  it('sends the approval to the route the API named', async () => {
    fetchMock.mockResolvedValue(jsonResponse(approval()));
    const view = await renderScreen(<ClientApprovalDetailScreen approvalId="a1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Approve this' }));

    expect(
      requestedPaths(fetchMock).some((path) => path.endsWith('/portal/approvals/a1/approve')),
    ).toBe(true);
  });
});

describe('a request this person may not decide', () => {
  it('says who has to answer it rather than showing a form', async () => {
    fetchMock.mockResolvedValue(jsonResponse(approval({ canDecide: false })));
    const view = await renderScreen(<ClientApprovalDetailScreen approvalId="a1" />);

    expect(
      await view.findByText('Only a client administrator can decide this request.'),
    ).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Approve this' })).toBeNull();
  });

  it('says who decided it once it has been decided', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        approval({
          canDecide: false,
          status: APPROVAL_STATUS.CLIENT_APPROVED,
          decidedBy: { id: 'u9', name: 'Dana Kim', email: 'dana@example.com' },
          decidedAt: '2026-09-03T09:00:00.000Z',
          decisionComment: 'Looks good.',
        }),
      ),
    );
    const view = await renderScreen(<ClientApprovalDetailScreen approvalId="a1" />);

    expect(await view.findByText(/^Decided by Dana Kim on /)).toBeTruthy();
    expect(view.getByText('Looks good.')).toBeTruthy();
  });
});

describe('what is attached and what happened', () => {
  it('lists the files and marks which side acted in the history', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        approval({
          files: [
            {
              id: 'f1',
              name: 'handover.pdf',
              contentType: 'application/pdf',
              sizeBytes: 2048,
              visibility: 'CLIENT',
              caption: null,
              uploadedBy: { id: 'u1', name: 'Priya Rao', email: 'priya@example.com' },
              createdAt: '2026-09-01T09:00:00.000Z',
            },
          ],
          history: [
            {
              id: 'h1',
              fromStatus: APPROVAL_STATUS.INTERNAL_REVIEW,
              toStatus: APPROVAL_STATUS.PUBLISHED,
              comment: null,
              actor: { id: 'u1', name: 'Priya Rao', email: 'priya@example.com' },
              side: 'INTERNAL',
              createdAt: '2026-09-01T09:00:00.000Z',
            },
          ],
        }),
      ),
    );
    const view = await renderScreen(<ClientApprovalDetailScreen approvalId="a1" />);

    expect(await view.findByText('handover.pdf')).toBeTruthy();
    // The client never uploads to a request; the provider prepares what is attached.
    expect(view.queryByRole('button', { name: 'Attach a photo' })).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: /History/ }));
    expect(await view.findByText('Provider')).toBeTruthy();
  });
});

describe('when the API refuses the read', () => {
  it('shows the API’s own sentence and offers a retry', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'You do not have access to this request' }, 403),
    );
    const view = await renderScreen(<ClientApprovalDetailScreen approvalId="a1" />);

    expect(await view.findByText('You do not have access to this request')).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
