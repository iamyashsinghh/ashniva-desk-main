import { APPROVAL_STATUS, PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { jsonResponse, renderScreen, sessionUser } from '../../shared/testing/harness';
import { RequestApprovalButton } from './RequestApprovalSheet';

/**
 * Preparing a request from a subject screen. It creates a draft — nothing the client can see —
 * and hands the new id back so the caller can open it.
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
  permissions: [PERMISSIONS.APPROVAL_MANAGE],
});

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('creates a draft for the subject and hands back its id', async () => {
  restoreSession.mockResolvedValue({ status: 'signed-in', user: MANAGER });
  fetchMock.mockResolvedValue(jsonResponse({ id: 'new-1', status: APPROVAL_STATUS.DRAFT }));
  const onCreated = jest.fn();
  const view = await renderScreen(
    <RequestApprovalButton
      subjectType="MILESTONE"
      subjectId="m1"
      defaultTitle="Sign off: Phase 2"
      onCreated={onCreated}
    />,
  );

  await fireEvent.press(await view.findByRole('button', { name: 'Request client approval' }));
  await fireEvent.changeText(
    view.getByLabelText('What the client is approving'),
    'Phase two is live on staging.',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Create draft' }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-1'));
  const [url, init] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
  expect(String(url)).toMatch(/\/approvals$/);
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({
    subjectType: 'MILESTONE',
    subjectId: 'm1',
    title: 'Sign off: Phase 2',
    summary: 'Phase two is live on staging.',
    dueDate: null,
    internalNotes: null,
  });
});

it('is not drawn for somebody who cannot manage approvals', async () => {
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: sessionUser({ permissions: [PERMISSIONS.PROJECT_READ] }),
  });
  const view = await renderScreen(
    <RequestApprovalButton
      subjectType="MILESTONE"
      subjectId="m1"
      defaultTitle="Sign off: Phase 2"
      onCreated={jest.fn()}
    />,
  );

  await waitFor(() => expect(restoreSession).toHaveBeenCalled());
  expect(view.queryByRole('button', { name: 'Request client approval' })).toBeNull();
});
