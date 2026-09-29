import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  type PermissionKey,
  type RoleKey,
} from '@ashniva/types';

import { sessionUser } from '../../shared/testing/harness';
import { quickCreateActions } from './quick-create';

/**
 * The "+" offers what the web's own create controls offer the same person, and nothing more.
 */

const CLIENT_ORGANIZATION = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Northwind',
  slug: 'northwind',
  isServiceProvider: false,
};

function routesFor(roleKey: RoleKey, permissions: readonly PermissionKey[], client = false) {
  const user = sessionUser({
    roleKey,
    permissions: [...permissions],
    ...(client ? { organization: CLIENT_ORGANIZATION } : {}),
  });
  const can = (permission: PermissionKey) => permissions.includes(permission);
  return quickCreateActions(user, can).map((action) => action.route);
}

it('offers nothing to nobody', () => {
  expect(quickCreateActions(null, () => true)).toEqual([]);
});

it('offers a client only a ticket, as the portal topbar does', () => {
  expect(
    routesFor(
      ROLE_KEYS.CLIENT_ADMIN,
      [PERMISSIONS.TICKET_RAISE, PERMISSIONS.TASK_CREATE, PERMISSIONS.CHANGE_REQUEST_RAISE],
      true,
    ),
  ).toEqual(['RaiseTicket']);
});

it('offers a client without ticket:raise nothing at all', () => {
  expect(routesFor(ROLE_KEYS.CLIENT_EMPLOYEE, [], true)).toEqual([]);
});

it('offers each action on its own permission', () => {
  expect(routesFor(ROLE_KEYS.DEVELOPER, [PERMISSIONS.TASK_CREATE])).toEqual(['TaskForm']);
  expect(routesFor(ROLE_KEYS.DEVELOPER, [PERMISSIONS.PROJECT_MANAGE])).toEqual(['ProjectForm']);
  expect(routesFor(ROLE_KEYS.DEVELOPER, [PERMISSIONS.INVOICE_WRITE])).toEqual(['InvoiceEditor']);
  expect(routesFor(ROLE_KEYS.DEVELOPER, [PERMISSIONS.CHANGE_REQUEST_RAISE])).toEqual([
    'ChangeRequestForm',
  ]);
});

it('offers intern work only to a manager role that can also assign', () => {
  expect(routesFor(ROLE_KEYS.TEAM_LEAD, [PERMISSIONS.TASK_ASSIGN])).toContain('InternWorkForm');
  expect(routesFor(ROLE_KEYS.DEVELOPER, [PERMISSIONS.TASK_ASSIGN])).not.toContain('InternWorkForm');
  expect(routesFor(ROLE_KEYS.TEAM_LEAD, [])).not.toContain('InternWorkForm');
});

it('offers a new conversation only with personal chat, as the web does', () => {
  expect(routesFor(ROLE_KEYS.DEVELOPER, [PERMISSIONS.CONVERSATION_PARTICIPATE])).not.toContain(
    'NewConversation',
  );
  expect(
    routesFor(ROLE_KEYS.DEVELOPER, [
      PERMISSIONS.CONVERSATION_PARTICIPATE,
      PERMISSIONS.CONVERSATION_REACH_ORGANIZATION,
    ]),
  ).toContain('NewConversation');
});

it('gives a project manager with the default permissions the lead’s set', () => {
  const routes = routesFor(
    ROLE_KEYS.PROJECT_MANAGER,
    DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.PROJECT_MANAGER],
  );
  expect(routes).toEqual(expect.arrayContaining(['TaskForm', 'ProjectForm', 'InternWorkForm']));
});
