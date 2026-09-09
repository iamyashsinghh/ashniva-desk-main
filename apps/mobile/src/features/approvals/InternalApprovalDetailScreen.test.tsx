import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  PERMISSIONS,
  ROLE_KEYS,
  type ApprovalActionAvailability,
  type ApprovalDetail,
} from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../shared/testing/harness';
import { InternalApprovalDetailScreen } from './InternalApprovalDetailScreen';

/**
 * The provider's side of one request.
 *
 * Every button on this screen came from `approval.actions`, which the API computed for this
 * caller on this request. What the screen adds is words and an order — and one refusal: it never
 * draws Edit, whatever the API offers.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };

const fetchMock = jest.fn();

const MANAGER = sessionUser({
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  roleName: 'Project Manager',
  permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.APPROVAL_MANAGE],
});

function approval(actions: ApprovalActionAvailability[]): ApprovalDetail {
  return {
    id: 'a1',
    title: 'Phase 2 handover',
    status: APPROVAL_STATUS.INTERNAL_REVIEW,
    subject: { type: 'MILESTONE', id: 'm1', label: 'Phase 2', link: null },
    clientOrganization: { id: 'c1', name: 'Northwind', slug: 'northwind' },
    project: null,
    contract: null,
    requestedBy: { id: 'u1', name: 'Priya Rao', email: 'priya@example.com' },
    publishedAt: null,
    dueDate: null,
    decidedBy: null,
    decidedAt: null,
    isOverdue: false,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    summary: 'Everything in phase two is finished.',
    internalNotes: 'Chase Priya about the invoice.',
    internalReviewer: null,
    internalReviewedAt: null,
    publishedBy: null,
    decisionComment: null,
    files: [],
    history: [],
    actions,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  restoreSession.mockResolvedValue({ status: 'signed-in', user: MANAGER });
});

describe('a request in internal review', () => {
  it('publishes it through the route the API named', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(approval([{ action: APPROVAL_ACTION.PUBLISH, enabled: true }])),
    );
    const view = await renderScreen(<InternalApprovalDetailScreen approvalId="a1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Publish to the client' }));
    expect(requestedPaths(fetchMock).some((path) => path.endsWith('/approvals/a1/publish'))).toBe(
      true,
    );
  });

  it('shows a refused action greyed, with the API’s reason, and sends nothing', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        approval([
          {
            action: APPROVAL_ACTION.PUBLISH,
            enabled: false,
            reason: 'Somebody other than the author has to review this first',
          },
        ]),
      ),
    );
    const view = await renderScreen(<InternalApprovalDetailScreen approvalId="a1" />);

    const button = await view.findByRole('button', { name: 'Publish to the client' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(
      await view.findByText('Somebody other than the author has to review this first'),
    ).toBeTruthy();

    await fireEvent.press(button);
    expect(requestedPaths(fetchMock).some((path) => path.includes('/publish'))).toBe(false);
  });

  it('never offers to edit the wording, whatever the API says', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(approval([{ action: APPROVAL_ACTION.EDIT, enabled: true }])),
    );
    const view = await renderScreen(<InternalApprovalDetailScreen approvalId="a1" />);

    expect(
      await view.findByText('Nothing to do from here. Editing the wording stays on the web app.'),
    ).toBeTruthy();
  });

  it('shows the internal notes to the provider, marked as internal', async () => {
    fetchMock.mockResolvedValue(jsonResponse(approval([])));
    const view = await renderScreen(<InternalApprovalDetailScreen approvalId="a1" />);

    expect(await view.findByText('Internal notes — the client never sees these')).toBeTruthy();
    expect(await view.findByText('Chase Priya about the invoice.')).toBeTruthy();
  });
});

describe('when the API refuses the read', () => {
  it('shows its sentence and offers a retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Approval request not found' }, 404));
    const view = await renderScreen(<InternalApprovalDetailScreen approvalId="a1" />);

    expect(await view.findByText('Approval request not found')).toBeTruthy();
    expect(await view.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
