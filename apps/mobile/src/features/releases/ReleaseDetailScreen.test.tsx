import { PERMISSIONS, ROLE_KEYS, type PermissionKey } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderScreen } from '../../shared/testing/harness';
import { ReleaseDetailScreen } from './ReleaseDetailScreen';
import { fakeApi, releaseDetail, releasePolicy, sent, signedIn } from './release-test-data';

/**
 * One release. Whether it may ship is the server's readiness checklist, printed; the tests pin the
 * requests each workflow action sends and the gating the phone mirrors from the API.
 */

jest.mock('../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../auth/auth-api') as { restoreSession: jest.Mock };
const fetchMock = jest.fn();

const MANAGER: PermissionKey[] = [
  PERMISSIONS.RELEASE_MANAGE,
  PERMISSIONS.RELEASE_APPROVE,
  PERMISSIONS.RELEASE_PUBLISH,
  PERMISSIONS.PROJECT_READ,
];

function serve(release = releaseDetail()) {
  fetchMock.mockImplementation(
    fakeApi({
      '/projects/p1/release-policy': releasePolicy(),
      '/uat': [],
      '/releases/r1': release,
      'POST /releases/r1/request-approval': release,
      'POST /releases/r1/approve': release,
      'POST /releases/r1/publish': release,
    }),
  );
}

async function open(permissions: PermissionKey[] = MANAGER) {
  restoreSession.mockResolvedValue(signedIn(ROLE_KEYS.PROJECT_MANAGER, permissions));
  const view = await renderScreen(<ReleaseDetailScreen releaseId="r1" />);
  await view.findByText('2026.09.1 — September release');
  return view;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('labels the plan as internal and lists what is going out', async () => {
  serve();
  const view = await open();

  expect(view.getByText('Release notes — internal, never shown to the client')).toBeTruthy();
  expect(view.getByText('Deploy after 18:00 and watch the payment logs.')).toBeTruthy();
  expect(view.getByText('Task · ACM-142')).toBeTruthy();
});

it('keeps Publish off with the server’s own reason when a gate fails', async () => {
  serve(
    releaseDetail({
      status: 'APPROVED',
      readiness: {
        publishable: false,
        requiresTypedConfirmation: false,
        gates: [{ key: 'qa', satisfied: false, reason: 'No QA check has passed yet' }],
      },
    }),
  );
  const view = await open();

  expect(view.getByRole('button', { name: 'Publish' })).toBeDisabled();
  expect(view.getByText('Publish: No QA check has passed yet')).toBeTruthy();
});

it('sends the typed version exactly as typed when the project asks for it', async () => {
  serve(
    releaseDetail({
      status: 'APPROVED',
      readiness: { publishable: true, requiresTypedConfirmation: true, gates: [] },
    }),
  );
  const view = await open();

  await fireEvent.press(view.getByRole('button', { name: 'Publish' }));
  const confirm = view.getByRole('button', { name: 'Publish to Production' });
  await fireEvent.changeText(view.getByLabelText('Type the version to confirm'), '2026.09.1 ');
  expect(confirm).toBeDisabled();

  await fireEvent.changeText(view.getByLabelText('Type the version to confirm'), '2026.09.1');
  await fireEvent.press(view.getByRole('button', { name: 'Publish to Production' }));
  await waitFor(() =>
    expect(sent(fetchMock, 'POST', '/releases/r1/publish')).toEqual({
      confirmVersion: '2026.09.1',
    }),
  );
});

it('requests approval straight from the bar', async () => {
  serve();
  const view = await open();

  await fireEvent.press(view.getByRole('button', { name: 'Request approval' }));
  await waitFor(() =>
    expect(sent(fetchMock, 'POST', '/releases/r1/request-approval')).not.toBeNull(),
  );
});

it('will not reject without a reason, then sends it', async () => {
  serve(
    releaseDetail({
      status: 'APPROVAL_REQUESTED',
      approvals: [
        {
          id: 'a1',
          approverRole: 'PROJECT_MANAGER',
          decision: 'PENDING',
          approverUserId: null,
          approverName: null,
          note: null,
          decidedAt: null,
        },
      ],
    }),
  );
  const view = await open();

  await fireEvent.press(view.getByRole('button', { name: 'Reject' }));
  // The bar's button and the sheet's share a name; the sheet's is drawn last.
  const confirm = () => {
    const [, inSheet] = view.getAllByRole('button', { name: 'Reject' });
    if (!inSheet) {
      throw new Error('The reject sheet did not open');
    }
    return inSheet;
  };
  expect(confirm()).toBeDisabled();

  await fireEvent.changeText(view.getByLabelText('Why'), 'Checkout still fails on Safari');
  await fireEvent.press(confirm());
  await waitFor(() =>
    expect(sent(fetchMock, 'POST', '/releases/r1/approve')).toEqual({
      decision: 'REJECTED',
      note: 'Checkout still fails on Safari',
    }),
  );
});

it('offers no approval buttons without release:approve', async () => {
  serve(releaseDetail({ status: 'APPROVAL_REQUESTED' }));
  const view = await open([PERMISSIONS.RELEASE_MANAGE]);

  expect(view.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Reject' })).toBeNull();
});
