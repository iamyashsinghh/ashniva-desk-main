import { ROLE_KEYS } from '@ashniva/types';

import { sessionUserFor } from '../../test/fixtures';
import { mobileItems, navigationFor } from './navigation';

const labels = (roleKey: Parameters<typeof sessionUserFor>[0], isClient = false) =>
  navigationFor(sessionUserFor(roleKey, isClient)).flatMap((group) =>
    group.items.map((item) => item.label),
  );

describe('navigationFor', () => {
  it('gives the super admin the admin group including audit history', () => {
    const groups = navigationFor(sessionUserFor(ROLE_KEYS.SUPER_ADMIN));
    expect(groups.map((group) => group.heading)).toEqual([undefined, 'Admin']);
    expect(labels(ROLE_KEYS.SUPER_ADMIN)).toEqual(
      expect.arrayContaining(['Tasks', 'Tickets', 'Projects', 'Reports', 'Audit history']),
    );
  });

  it('links the Phase 2 screens for a super admin', () => {
    const items = navigationFor(sessionUserFor(ROLE_KEYS.SUPER_ADMIN)).flatMap(
      (group) => group.items,
    );
    const contracts = items.find((item) => item.label === 'Contracts');
    expect(contracts?.to).toBe('/contracts');
    expect(contracts?.unavailable).toBeUndefined();
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Change requests',
        'Approvals',
        'Notifications',
        'SLA policies',
        'Reports',
      ]),
    );
  });

  it('keeps developers out of admin screens', () => {
    const groups = navigationFor(sessionUserFor(ROLE_KEYS.DEVELOPER));
    expect(groups).toHaveLength(1);
    expect(labels(ROLE_KEYS.DEVELOPER)).not.toContain('Users & teams');
    expect(labels(ROLE_KEYS.DEVELOPER)).toContain('Today');
  });

  it('limits internal employees to their dashboard and tickets', () => {
    expect(labels(ROLE_KEYS.INTERNAL_EMPLOYEE)).toEqual([
      'Dashboard',
      'My tickets',
      'Notifications',
    ]);
  });

  it('gives clients only portal routes', () => {
    const items = navigationFor(sessionUserFor(ROLE_KEYS.CLIENT_ADMIN, true)).flatMap(
      (group) => group.items,
    );
    expect(items.every((item) => item.to.startsWith('/portal'))).toBe(true);
    expect(items.find((item) => item.label === 'Contracts')?.to).toBe('/portal/contracts');
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Approvals', 'Change requests', 'Reports', 'Notifications']),
    );
  });

  /**
   * A client employee holds none of `approval:decide`, `uat:decide` or `report:read-own`. Listing
   * those three for every client account put links in their menu that answered 403 — which reads
   * as a broken product rather than as somebody else's job.
   */
  it('does not offer a client employee the three screens only their administrator may open', () => {
    const employee = labels(ROLE_KEYS.CLIENT_EMPLOYEE, true);
    expect(employee).not.toContain('Approvals');
    expect(employee).not.toContain('Sign-off');
    expect(employee).not.toContain('Reports');
    // What they can genuinely use is still there.
    expect(employee).toEqual(
      expect.arrayContaining(['Overview', 'Projects', 'Tickets', 'Change requests']),
    );
  });

  it('still offers all three to a client administrator', () => {
    expect(labels(ROLE_KEYS.CLIENT_ADMIN, true)).toEqual(
      expect.arrayContaining(['Approvals', 'Sign-off', 'Reports']),
    );
  });

  /**
   * The billing settings screen's only action is `PUT /settings/billing`, which needs
   * `billing-profile:manage`. Gated on `invoice:write` it appeared in a manager's menu and every
   * save from it was a 403 — the same "broken product" reading as the client-employee links above.
   */
  it('offers billing settings only to someone who may save them', () => {
    expect(labels(ROLE_KEYS.SUPER_ADMIN)).toContain('Billing');
    expect(labels(ROLE_KEYS.PROJECT_MANAGER)).not.toContain('Billing');
    // The manager keeps the screens they can actually use.
    expect(labels(ROLE_KEYS.PROJECT_MANAGER)).toContain('Invoices');
  });

  it('puts at most four working links in the phone tab bar', () => {
    const items = mobileItems(navigationFor(sessionUserFor(ROLE_KEYS.SUPER_ADMIN)));
    expect(items.length).toBeLessThanOrEqual(4);
    expect(items.every((item) => !item.unavailable)).toBe(true);
  });
});
