import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';

import { explainApprovalAction, listApprovalActions } from './approval-workflow';

const provider = 'org-provider';
const client = 'org-client';

const pm = {
  userId: 'pm',
  organizationId: provider,
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  isServiceProvider: true,
  permissions: [PERMISSIONS.APPROVAL_MANAGE],
};
const clientAdmin = {
  userId: 'client-admin',
  organizationId: client,
  roleKey: ROLE_KEYS.CLIENT_ADMIN,
  isServiceProvider: false,
  permissions: [PERMISSIONS.APPROVAL_DECIDE],
};

const published = {
  status: 'PUBLISHED' as const,
  requestedById: 'pm',
  publishedById: 'pm',
  clientOrganizationId: client,
};

describe('approval workflow', () => {
  it('lets the client decide on a published request', () => {
    expect(explainApprovalAction(published, clientAdmin, 'approve').enabled).toBe(true);
    expect(explainApprovalAction(published, clientAdmin, 'reject').enabled).toBe(true);
  });

  it('never lets the provider decide for the client', () => {
    const result = explainApprovalAction(published, pm, 'approve');
    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('client organization');
  });

  it('never lets the same person be on both sides', () => {
    const dual = { ...clientAdmin, userId: 'pm' };
    expect(explainApprovalAction(published, dual, 'approve').enabled).toBe(false);
  });

  it('rejects decisions on unpublished requests as workflow conflicts', () => {
    const draft = { ...published, status: 'DRAFT' as const };
    expect(explainApprovalAction(draft, clientAdmin, 'approve').enabled).toBe(false);
    expect(explainApprovalAction(draft, pm, 'publish').enabled).toBe(false);
    expect(explainApprovalAction(draft, pm, 'send-to-internal-review').enabled).toBe(true);
  });

  it('lists every action with a reason', () => {
    const actions = listApprovalActions(published, clientAdmin);
    expect(actions.map((entry) => entry.action)).toContain('withdraw');
    expect(actions.find((entry) => entry.action === 'withdraw')?.enabled).toBe(false);
  });
});
