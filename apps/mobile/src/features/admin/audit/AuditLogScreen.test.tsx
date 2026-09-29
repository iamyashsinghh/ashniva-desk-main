import { PERMISSIONS, type PermissionKey } from '@ashniva/types';
import { fireEvent } from '@testing-library/react-native';

import { renderScreen, sessionUser } from '../../../shared/testing/harness';
import { auditEntry, fakeApi, type ApiCall } from '../shared/admin-test-data';
import { AuditLogScreen } from './AuditLogScreen';

/**
 * Audit history. The search is the API's, so it is asserted on the request; an entry opens to its
 * before and after; a client's staff are never shown the history, whatever their permissions.
 */

jest.mock('../../auth/auth-api', () => ({
  login: jest.fn(),
  logout: jest.fn(async () => undefined),
  restoreSession: jest.fn(),
}));

const { restoreSession } = jest.requireMock('../../auth/auth-api') as { restoreSession: jest.Mock };

function signIn(permissions: PermissionKey[], isServiceProvider = true) {
  const user = sessionUser({ roleKey: 'SUPER_ADMIN', permissions });
  restoreSession.mockResolvedValue({
    status: 'signed-in',
    user: { ...user, organization: { ...user.organization, isServiceProvider } },
  });
}

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  api = fakeApi({
    'GET /audit-logs': { items: [auditEntry()], nextCursor: null },
  });
  globalThis.fetch = api.fetch;
});

it('lists entries with who did what and opens one to its before and after', async () => {
  signIn([PERMISSIONS.AUDIT_LOG_READ]);
  const view = await renderScreen(<AuditLogScreen />);

  expect(await view.findByText('user.role_changed')).toBeTruthy();
  expect(view.getByText('roleKey: TEAM_LEAD')).toBeTruthy();

  await fireEvent.press(view.getByRole('button', { name: /^user\.role_changed by Priya Admin/ }));
  expect(await view.findByText('Before')).toBeTruthy();
  expect(view.getByText('After')).toBeTruthy();
  expect(view.getByText(/"roleKey": "DEVELOPER"/)).toBeTruthy();
});

it('searches on the server', async () => {
  signIn([PERMISSIONS.AUDIT_LOG_READ]);
  api = fakeApi({
    'GET /audit-logs': (call: ApiCall) => ({
      items: [
        call.query.search ? auditEntry({ id: 'audit-2', action: 'role.updated' }) : auditEntry(),
      ],
      nextCursor: null,
    }),
  });
  globalThis.fetch = api.fetch;
  const view = await renderScreen(<AuditLogScreen />);
  await view.findByText('user.role_changed');

  await fireEvent.changeText(view.getByLabelText('Search action or record id'), 'role');
  expect(await view.findByText('role.updated')).toBeTruthy();
  expect(api.find('GET', '/audit-logs').some((call) => call.query.search === 'role')).toBe(true);
});

it('is closed to a client’s staff even with the permission', async () => {
  signIn([PERMISSIONS.AUDIT_LOG_READ], false);
  const view = await renderScreen(<AuditLogScreen />);

  expect(await view.findByText('Not available to you')).toBeTruthy();
  expect(api.calls).toHaveLength(0);
});
