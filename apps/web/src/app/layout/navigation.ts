import { PERMISSIONS, ROLE_KEYS, isClientRole, type SessionUser } from '@ashniva/types';

export interface NavigationItem {
  label: string;
  to: string;
  /** Phase 2 feature: shown greyed with a label, never as a working link. */
  unavailable?: boolean;
  /** Matches child routes too (e.g. /tasks/…); the default is an exact match. */
  prefix?: boolean;
  /** Shown in the phone tab bar (first four are used). */
  mobile?: boolean;
}

export interface NavigationGroup {
  heading?: string;
  items: NavigationItem[];
}

const DASHBOARD_LABEL: Partial<Record<SessionUser['roleKey'], string>> = {
  [ROLE_KEYS.DEVELOPER]: 'Today',
  [ROLE_KEYS.TESTER]: 'QA dashboard',
};

/**
 * Sidebar / tab-bar navigation per role, following the approved prototype's per-role menus.
 * Items are also filtered by permission so a custom role never sees a link it cannot use.
 */
export function navigationFor(user: SessionUser): NavigationGroup[] {
  const has = (permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) =>
    user.permissions.includes(permission);

  if (isClientRole(user.roleKey)) {
    /**
     * The portal menu, filtered the same way the internal one is.
     *
     * Approvals, sign-off and reports are a client *administrator's*; an employee holds none of
     * those three permissions. Listing them for everybody put three links in an employee's menu
     * that answered 403 — which reads as a broken product rather than as somebody else's job.
     */
    const portal: NavigationItem[] = [
      { label: 'Overview', to: '/portal', mobile: true },
      { label: 'Projects', to: '/portal/projects', prefix: true, mobile: true },
      { label: 'Tickets', to: '/portal/tickets', prefix: true, mobile: true },
    ];
    if (has(PERMISSIONS.APPROVAL_DECIDE)) {
      portal.push({ label: 'Approvals', to: '/portal/approvals', prefix: true, mobile: true });
    }
    if (has(PERMISSIONS.UAT_DECIDE)) {
      portal.push({ label: 'Sign-off', to: '/portal/uat', prefix: true, mobile: true });
    }
    portal.push(
      { label: 'Change requests', to: '/portal/change-requests', prefix: true },
      { label: 'Releases', to: '/portal/release-notes', prefix: true },
      { label: 'Progress', to: '/portal/progress-summaries', prefix: true },
      { label: 'Invoices', to: '/portal/invoices', prefix: true },
      { label: 'Contracts', to: '/portal/contracts', prefix: true },
    );
    if (has(PERMISSIONS.REPORT_READ_OWN)) {
      portal.push({ label: 'Reports', to: '/portal/reports' });
    }
    portal.push({ label: 'Notifications', to: '/portal/notifications' });
    return [{ items: portal }];
  }

  if (user.roleKey === ROLE_KEYS.INTERNAL_EMPLOYEE) {
    return [
      {
        items: [
          { label: 'Dashboard', to: '/', mobile: true },
          { label: 'My tickets', to: '/tickets', prefix: true, mobile: true },
          { label: 'Notifications', to: '/notifications' },
        ],
      },
    ];
  }

  const work: NavigationItem[] = [
    { label: DASHBOARD_LABEL[user.roleKey] ?? 'Dashboard', to: '/', mobile: true },
  ];
  if (has(PERMISSIONS.TASK_READ)) {
    work.push({ label: 'My tasks today', to: '/tasks?view=today' });
    work.push({ label: 'Tasks', to: '/tasks', prefix: true, mobile: true });
  }
  if (
    user.roleKey === ROLE_KEYS.INTERN ||
    (has(PERMISSIONS.TASK_ASSIGN) &&
      (user.roleKey === ROLE_KEYS.SUPER_ADMIN ||
        user.roleKey === ROLE_KEYS.PROJECT_MANAGER ||
        user.roleKey === ROLE_KEYS.TEAM_LEAD))
  ) {
    work.push({ label: 'Intern work', to: '/intern-work', prefix: true });
  }
  if (has(PERMISSIONS.TASK_REVIEW) || user.roleKey === ROLE_KEYS.TESTER) {
    work.push({ label: 'Reviews', to: '/tasks?view=review' });
  }
  if (has(PERMISSIONS.TICKET_READ)) {
    work.push({ label: 'Tickets', to: '/tickets', prefix: true, mobile: true });
  }
  if (has(PERMISSIONS.PROJECT_READ)) {
    work.push({ label: 'Projects', to: '/projects', prefix: true });
  }
  if (has(PERMISSIONS.CONVERSATION_PARTICIPATE)) {
    work.push({ label: 'Messages', to: '/messages', prefix: true, mobile: true });
  }
  if (has(PERMISSIONS.CONTRACT_READ)) {
    work.push({ label: 'Contracts', to: '/contracts', prefix: true });
  }
  if (has(PERMISSIONS.APPROVAL_MANAGE) || has(PERMISSIONS.APPROVAL_DECIDE)) {
    work.push({ label: 'Approvals', to: '/approvals', prefix: true });
  }
  if (has(PERMISSIONS.CHANGE_REQUEST_READ)) {
    work.push({ label: 'Change requests', to: '/change-requests', prefix: true });
  }
  // Exactly what `GET /qa/assignments` asks for: a tester records results, a lead assigns.
  // `qa:verify-live` used to be listed here as well, on the reasoning that whoever verifies live
  // needs the queue to find the assignment — but the endpoint does not accept it, so a role
  // holding only that key was shown a link to a 403. Every default role that holds
  // `qa:verify-live` also holds one of these two, so the link is where it was.
  if (has(PERMISSIONS.QA_RECORD_RESULT) || has(PERMISSIONS.QA_ASSIGN)) {
    work.push({ label: 'Testing', to: '/qa', prefix: true });
  }
  if (has(PERMISSIONS.SUPPORT_ROUTING_MANAGE)) {
    work.push({ label: 'Support queue', to: '/support-queue' });
  }
  // Reading a problem is a separate permission from reading a ticket, because a problem names
  // every client that reported the same fault.
  if (has(PERMISSIONS.PROBLEM_READ)) {
    work.push({ label: 'Problems', to: '/problems', prefix: true });
  }
  if (has(PERMISSIONS.PROBLEM_MANAGE)) {
    work.push({ label: 'Recurring issues', to: '/support/recurring' });
  }
  if (has(PERMISSIONS.INCIDENT_READ)) {
    work.push({ label: 'Incidents', to: '/incidents', prefix: true });
  }
  // `GET /releases` and `GET /releases/:id` both ask for `release:manage`; approving one is a
  // step inside a release somebody else opened, not a way in. A role holding only
  // `release:approve` was shown a screen that answers 403 on its first request.
  if (has(PERMISSIONS.RELEASE_MANAGE)) {
    work.push({ label: 'Releases', to: '/releases', prefix: true });
  }
  if (has(PERMISSIONS.RELEASE_NOTE_READ)) {
    work.push({ label: 'Release notes', to: '/release-notes', prefix: true });
  }
  if (has(PERMISSIONS.AI_SUMMARY_READ)) {
    work.push({ label: 'Progress summaries', to: '/ai-summaries', prefix: true });
  }
  if (has(PERMISSIONS.INVOICE_READ)) {
    work.push({ label: 'Invoices', to: '/invoices', prefix: true });
  }
  if (has(PERMISSIONS.PAYMENT_READ)) {
    work.push({ label: 'Payments', to: '/payments' });
  }
  if (has(PERMISSIONS.TASK_READ)) {
    work.push({ label: 'Completed today', to: '/completed-today' });
  }
  if (has(PERMISSIONS.REPORT_READ_OWN)) {
    work.push({ label: 'Daily reports', to: '/reports' });
    work.push({ label: 'Reports', to: '/reports/advanced' });
  }
  if (has(PERMISSIONS.REPORT_READ_TEAM)) {
    work.push({ label: 'Login & break log', to: '/team/session-logs' });
  }
  work.push({ label: 'Notifications', to: '/notifications' });

  const admin: NavigationItem[] = [];
  if (has(PERMISSIONS.ORGANIZATION_MANAGE)) {
    admin.push({ label: 'Companies & clients', to: '/admin/companies' });
  }
  if (has(PERMISSIONS.USER_MANAGE)) {
    admin.push({ label: 'Users & teams', to: '/admin/users' });
  }
  if (has(PERMISSIONS.ROLE_MANAGE)) {
    admin.push({ label: 'Roles & permissions', to: '/admin/roles' });
  }
  if (has(PERMISSIONS.SLA_MANAGE)) {
    admin.push({ label: 'SLA policies', to: '/admin/sla' });
  }
  if (has(PERMISSIONS.SUPPORT_ROUTING_MANAGE)) {
    admin.push({ label: 'Support routing', to: '/admin/support-routing' });
  }
  if (has(PERMISSIONS.PRODUCT_READ)) {
    admin.push({ label: 'Products', to: '/admin/products', prefix: true });
  }
  // The page's only action is `PUT /settings/billing`, which needs `billing-profile:manage`.
  // Gating on `invoice:write` offered the screen to people the API would always refuse.
  if (has(PERMISSIONS.BILLING_PROFILE_MANAGE)) {
    admin.push({ label: 'Billing', to: '/settings/billing' });
  }
  if (has(PERMISSIONS.INTEGRATION_READ)) {
    admin.push({ label: 'Email', to: '/settings/email' });
    admin.push({ label: 'WhatsApp', to: '/settings/whatsapp' });
  }
  if (has(PERMISSIONS.BRANDING_MANAGE)) {
    admin.push({ label: 'Branding', to: '/admin/branding' });
  }
  // The switches shipped with package 9b behind their own permission and had no screen, so the
  // only way to turn internal chat off was to call the API by hand.
  if (has(PERMISSIONS.CONVERSATION_SETTINGS_MANAGE)) {
    admin.push({ label: 'Internal communication', to: '/settings/communication' });
  }
  if (has(PERMISSIONS.AUDIT_LOG_READ)) {
    admin.push({ label: 'Audit history', to: '/admin/audit' });
    // The route existed since Phase 2 with nothing linking to it, so the only way to reach the
    // health of the database, queue and storage was to know the URL.
    admin.push({ label: 'System status', to: '/system/status' });
  }

  const groups: NavigationGroup[] = [{ items: work }];
  if (admin.length > 0) {
    groups.push({ heading: 'Admin', items: admin });
  }
  return groups;
}

export function mobileItems(groups: NavigationGroup[]): NavigationItem[] {
  return groups
    .flatMap((group) => group.items)
    .filter((item) => item.mobile && !item.unavailable)
    .slice(0, 4);
}
