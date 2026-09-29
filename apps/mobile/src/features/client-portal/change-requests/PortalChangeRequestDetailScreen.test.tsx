import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  jsonResponse,
  renderScreen,
  requestedPaths,
  sessionUser,
} from '../../../shared/testing/harness';
import { PortalChangeRequestDetailScreen } from './PortalChangeRequestDetailScreen';

/**
 * A change request from the client's side, and above all its buttons: the decision buttons only
 * for a person who decides while the provider waits on the client, the draft buttons only for
 * the person who raised it — and each sends to the portal endpoint, never an internal one.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as {
  restoreSession: jest.Mock;
};

const fetchMock = jest.fn();
const ME = '11111111-1111-4111-8111-111111111111';

function signIn(permissions: PermissionKey[]) {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({
      id: ME,
      roleKey: ROLE_KEYS.CLIENT_ADMIN,
      roleName: 'Client Admin',
      permissions,
      organization: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Northwind',
        slug: 'northwind',
        isServiceProvider: false,
      },
    }),
  });
}

function changeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cr1',
    number: 'CR-0012',
    title: 'Add an export button',
    status: 'CLIENT_REVIEW',
    project: { id: 'p1', code: 'WEB', name: 'Website rebuild' },
    requestedBy: { id: 'someone-else', name: 'Alex Kim', email: 'alex@example.com' },
    estimatedMinutes: 480,
    costImpact: '1200.00',
    currency: 'USD',
    timelineImpactDays: 3,
    scheduledFor: null,
    submittedAt: '2026-09-10T09:00:00.000Z',
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-12T09:00:00.000Z',
    description: 'Let us export the report as a spreadsheet.',
    businessReason: 'Finance needs it monthly.',
    scope: null,
    impact: null,
    decisionNote: null,
    comments: [],
    files: [],
    history: [],
    canApprove: true,
    canRequestChanges: true,
    canReply: true,
    ...overrides,
  };
}

function serve(detail: ReturnType<typeof changeRequest>) {
  fetchMock.mockImplementation((url: string, init?: { method?: string }) =>
    Promise.resolve(jsonResponse(init?.method === 'POST' ? {} : detail)),
  );
}

function posted(): { path: string; body: unknown }[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as { method?: string } | undefined)?.method === 'POST')
    .map(([url, init]) => ({
      path: String(url),
      body: JSON.parse(String((init as { body?: string }).body ?? '{}')) as unknown,
    }));
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('while the provider waits on the client', () => {
  it('shows the request and its estimate from the portal endpoint', async () => {
    signIn([PERMISSIONS.CHANGE_REQUEST_READ, PERMISSIONS.APPROVAL_DECIDE]);
    serve(changeRequest());
    const view = await renderScreen(<PortalChangeRequestDetailScreen changeRequestId="cr1" />);

    expect(await view.findByText('Add an export button')).toBeTruthy();
    expect(view.getByText('Your decision is needed')).toBeTruthy();
    expect(view.getByText('Finance needs it monthly.')).toBeTruthy();
    expect(requestedPaths(fetchMock)[0]).toContain('/portal/change-requests/cr1');
  });

  it('approves through the portal, with the optional note', async () => {
    signIn([PERMISSIONS.CHANGE_REQUEST_READ, PERMISSIONS.APPROVAL_DECIDE]);
    serve(changeRequest());
    const view = await renderScreen(<PortalChangeRequestDetailScreen changeRequestId="cr1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Approve' }));
    await fireEvent.changeText(view.getByLabelText('Note for the provider'), 'Go ahead');
    const approve = view.getAllByRole('button', { name: 'Approve' });
    await fireEvent.press(approve[approve.length - 1]!);

    await waitFor(() => expect(posted()).toHaveLength(1));
    expect(posted()[0]?.path).toContain('/portal/change-requests/cr1/approve');
    expect(posted()[0]?.body).toEqual({ note: 'Go ahead' });
  });

  it('will not send a rejection without a reason', async () => {
    signIn([PERMISSIONS.CHANGE_REQUEST_READ, PERMISSIONS.APPROVAL_DECIDE]);
    serve(changeRequest());
    const view = await renderScreen(<PortalChangeRequestDetailScreen changeRequestId="cr1" />);

    await fireEvent.press(await view.findByRole('button', { name: 'Reject' }));
    const reject = () => {
      const buttons = view.getAllByRole('button', { name: 'Reject' });
      return buttons[buttons.length - 1]!;
    };
    expect(reject().props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(view.getByLabelText('Why?'), 'Out of budget');
    await fireEvent.press(reject());

    await waitFor(() => expect(posted()[0]?.path).toContain('/portal/change-requests/cr1/reject'));
    expect(posted()[0]?.body).toEqual({ note: 'Out of budget' });
  });

  it('offers no decision to someone without approval:decide, whatever the flags say', async () => {
    signIn([PERMISSIONS.CHANGE_REQUEST_READ]);
    serve(changeRequest());
    const view = await renderScreen(<PortalChangeRequestDetailScreen changeRequestId="cr1" />);

    await view.findByText('Add an export button');
    expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(view.getByText('The provider is working on this request.')).toBeTruthy();
  });
});

describe('a draft', () => {
  const draft = { status: 'DRAFT', canApprove: false, canRequestChanges: false };

  it('lets the person who raised it submit it to the provider', async () => {
    signIn([PERMISSIONS.CHANGE_REQUEST_READ, PERMISSIONS.CHANGE_REQUEST_RAISE]);
    serve(changeRequest({ ...draft, requestedBy: { id: ME, name: 'Sam Patel', email: 'x' } }));
    const view = await renderScreen(<PortalChangeRequestDetailScreen changeRequestId="cr1" />);

    expect(await view.findByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Cancel request' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Submit to the provider' }));

    await waitFor(() => expect(posted()[0]?.path).toContain('/portal/change-requests/cr1/submit'));
  });

  it('is not someone else’s to submit', async () => {
    signIn([PERMISSIONS.CHANGE_REQUEST_READ, PERMISSIONS.CHANGE_REQUEST_RAISE]);
    serve(changeRequest(draft));
    const view = await renderScreen(<PortalChangeRequestDetailScreen changeRequestId="cr1" />);

    await view.findByText('Add an export button');
    expect(view.queryByRole('button', { name: 'Submit to the provider' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
