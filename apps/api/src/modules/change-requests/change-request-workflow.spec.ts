import { PERMISSIONS, ROLE_KEYS, type ChangeRequestStatus } from '@ashniva/types';

import { assertChangeRequestAction, explainChangeRequestAction } from './change-request-workflow';

const pm = {
  userId: 'pm',
  organizationId: 'provider',
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  isServiceProvider: true,
  permissions: [PERMISSIONS.CHANGE_REQUEST_MANAGE, PERMISSIONS.CHANGE_REQUEST_RAISE],
};
const developer = {
  userId: 'dev',
  organizationId: 'provider',
  roleKey: ROLE_KEYS.DEVELOPER,
  isServiceProvider: true,
  permissions: [PERMISSIONS.CHANGE_REQUEST_READ],
};
const clientAdmin = {
  userId: 'ca',
  organizationId: 'acme',
  roleKey: ROLE_KEYS.CLIENT_ADMIN,
  isServiceProvider: false,
  permissions: [PERMISSIONS.CHANGE_REQUEST_RAISE, PERMISSIONS.APPROVAL_DECIDE],
};
const clientEmployee = {
  ...clientAdmin,
  userId: 'ce',
  roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
  permissions: [PERMISSIONS.CHANGE_REQUEST_READ],
};

const cr = (status: ChangeRequestStatus, requestedById = 'ca') => ({
  status,
  requestedById,
  clientOrganizationId: 'acme',
});

describe('change-request workflow', () => {
  it('the requester submits a draft; others cannot', () => {
    expect(explainChangeRequestAction(cr('DRAFT'), clientAdmin, 'submit').enabled).toBe(true);
    expect(explainChangeRequestAction(cr('DRAFT'), clientEmployee, 'submit').enabled).toBe(false);
    expect(explainChangeRequestAction(cr('DRAFT'), developer, 'submit').enabled).toBe(false);
  });

  it('only managers review and send to the client', () => {
    expect(explainChangeRequestAction(cr('SUBMITTED'), pm, 'start-internal-review').enabled).toBe(
      true,
    );
    expect(
      explainChangeRequestAction(cr('SUBMITTED'), developer, 'start-internal-review').enabled,
    ).toBe(false);
    expect(explainChangeRequestAction(cr('INTERNAL_REVIEW'), pm, 'send-to-client').enabled).toBe(
      true,
    );
  });

  it('only the client organization approves during client review', () => {
    expect(explainChangeRequestAction(cr('CLIENT_REVIEW'), clientAdmin, 'approve').enabled).toBe(
      true,
    );
    expect(explainChangeRequestAction(cr('CLIENT_REVIEW'), pm, 'approve').enabled).toBe(false);
    expect(explainChangeRequestAction(cr('CLIENT_REVIEW'), clientEmployee, 'approve').enabled).toBe(
      false,
    );
  });

  it('managers can request changes internally but not approve', () => {
    expect(explainChangeRequestAction(cr('INTERNAL_REVIEW'), pm, 'request-changes').enabled).toBe(
      true,
    );
    expect(explainChangeRequestAction(cr('INTERNAL_REVIEW'), pm, 'approve').enabled).toBe(false);
  });

  it('tasks are generated only after approval', () => {
    expect(explainChangeRequestAction(cr('APPROVED'), pm, 'generate-tasks').enabled).toBe(true);
    expect(explainChangeRequestAction(cr('CLIENT_REVIEW'), pm, 'generate-tasks').enabled).toBe(
      false,
    );
  });

  it('reports impossible transitions as conflicts and forbidden roles as forbidden', () => {
    expect(() => assertChangeRequestAction(cr('COMPLETED'), pm, 'submit')).toThrow(
      'Not available while the request is completed',
    );
    expect(() => assertChangeRequestAction(cr('DRAFT'), developer, 'submit')).toThrow(
      'Only the requester',
    );
  });
});
