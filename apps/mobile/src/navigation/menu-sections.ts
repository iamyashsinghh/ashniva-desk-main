import { PERMISSIONS, type SessionUser } from '@ashniva/types';

import type { IconName } from '../shared/components/Icon';
import type { MenuItem, MenuRoute, MenuSection } from './menu-items';

/**
 * The side menu's delivery, money and admin sections, and a client's extra portal entries.
 *
 * Entry for entry the web sidebar's (`apps/web/src/app/layout/navigation.ts`), with the same
 * permission test on each — including the web's reasons for the less obvious ones, repeated where
 * they are decided. An entry appearing is never authority: the API decides.
 */

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const route = (key: string, label: string, icon: IconName, screen: MenuRoute): MenuItem => ({
  key,
  label,
  icon,
  target: { kind: 'route', screen },
});

function permitted(user: SessionUser): (permission: Permission) => boolean {
  return (permission) => user.permissions.includes(permission);
}

/** Only the non-empty sections, so a heading never sits over nothing. */
function sections(...list: MenuSection[]): MenuSection[] {
  return list.filter((section) => section.items.length > 0);
}

export function deliverySections(user: SessionUser): MenuSection[] {
  const has = permitted(user);

  const delivery: MenuItem[] = [];
  if (has(PERMISSIONS.CONTRACT_READ)) {
    delivery.push(route('contracts', 'Contracts', 'document-text-outline', 'Contracts'));
  }
  if (has(PERMISSIONS.CHANGE_REQUEST_READ)) {
    delivery.push(
      route('change-requests', 'Change requests', 'git-pull-request-outline', 'ChangeRequests'),
    );
  }
  // `GET /releases` asks for `release:manage`; approving is a step inside somebody else's release.
  if (has(PERMISSIONS.RELEASE_MANAGE)) {
    delivery.push(route('releases', 'Releases', 'rocket-outline', 'Releases'));
  }
  if (has(PERMISSIONS.RELEASE_NOTE_READ)) {
    delivery.push(route('release-notes', 'Release notes', 'newspaper-outline', 'ReleaseNotes'));
  }
  if (has(PERMISSIONS.AI_SUMMARY_READ)) {
    delivery.push(route('ai-summaries', 'Progress summaries', 'sparkles-outline', 'AiSummaries'));
  }

  // Reading a problem is its own permission: a problem names every client that reported the fault.
  const support: MenuItem[] = [];
  if (has(PERMISSIONS.PROBLEM_READ)) {
    support.push(route('problems', 'Problems', 'bug-outline', 'Problems'));
  }
  if (has(PERMISSIONS.PROBLEM_MANAGE)) {
    support.push(route('recurring', 'Recurring issues', 'repeat-outline', 'RecurringIssues'));
  }
  if (has(PERMISSIONS.INCIDENT_READ)) {
    support.push(route('incidents', 'Incidents', 'flame-outline', 'Incidents'));
  }

  const money: MenuItem[] = [];
  if (has(PERMISSIONS.INVOICE_READ)) {
    money.push(route('invoices', 'Invoices', 'receipt-outline', 'BillingInvoices'));
  }
  if (has(PERMISSIONS.PAYMENT_READ)) {
    money.push(route('payments', 'Payments', 'card-outline', 'Payments'));
  }
  if (has(PERMISSIONS.REPORT_READ_OWN)) {
    money.push(
      route('daily-reports', 'Daily reports', 'calendar-outline', 'Reports'),
      route('reports', 'Reports', 'bar-chart-outline', 'AdvancedReports'),
    );
  }

  return sections(
    { heading: 'Delivery', items: delivery },
    { heading: 'Problems & incidents', items: support },
    { heading: 'Billing & reports', items: money },
  );
}

export function adminSection(user: SessionUser): MenuSection[] {
  const has = permitted(user);
  const admin: MenuItem[] = [];
  if (has(PERMISSIONS.ORGANIZATION_MANAGE)) {
    admin.push(route('companies', 'Companies & clients', 'business-outline', 'AdminCompanies'));
  }
  if (has(PERMISSIONS.USER_MANAGE)) {
    admin.push(route('users', 'Users & teams', 'people-outline', 'AdminUsers'));
  }
  if (has(PERMISSIONS.ROLE_MANAGE)) {
    admin.push(route('roles', 'Roles & permissions', 'shield-checkmark-outline', 'AdminRoles'));
  }
  if (has(PERMISSIONS.SLA_MANAGE)) {
    admin.push(route('sla', 'SLA policies', 'timer-outline', 'SlaPolicies'));
  }
  if (has(PERMISSIONS.SUPPORT_ROUTING_MANAGE)) {
    admin.push(route('routing', 'Support routing', 'git-branch-outline', 'SupportRouting'));
  }
  if (has(PERMISSIONS.PRODUCT_READ)) {
    admin.push(route('products', 'Products', 'cube-outline', 'Products'));
  }
  // The page's only action is `PUT /settings/billing`, which needs `billing-profile:manage`.
  if (has(PERMISSIONS.BILLING_PROFILE_MANAGE)) {
    admin.push(route('billing', 'Billing', 'wallet-outline', 'BillingSettings'));
  }
  if (has(PERMISSIONS.INTEGRATION_READ)) {
    admin.push(
      route('email', 'Email', 'mail-outline', 'EmailSettings'),
      route('whatsapp', 'WhatsApp', 'logo-whatsapp', 'WhatsAppSettings'),
    );
  }
  if (has(PERMISSIONS.BRANDING_MANAGE)) {
    admin.push(route('branding', 'Branding', 'color-palette-outline', 'BrandingSettings'));
  }
  if (has(PERMISSIONS.CONVERSATION_SETTINGS_MANAGE)) {
    admin.push(
      route(
        'communication',
        'Internal communication',
        'chatbox-ellipses-outline',
        'CommunicationSettings',
      ),
    );
  }
  if (has(PERMISSIONS.AUDIT_LOG_READ)) {
    admin.push(
      route('audit', 'Audit history', 'document-lock-outline', 'AuditLog'),
      route('system', 'System status', 'pulse-outline', 'SystemStatus'),
    );
  }
  return sections({ heading: 'Admin', items: admin });
}

/** A client's portal entries beyond the tabs, in the web portal menu's order. */
export function clientPortalItems(user: SessionUser): {
  beforeTickets: MenuItem[];
  afterUpdates: MenuItem[];
} {
  const has = permitted(user);
  // Keys carry `portal-` so a client's entries never share a key with the internal screens.
  const afterUpdates: MenuItem[] = [
    route(
      'portal-change-requests',
      'Change requests',
      'git-pull-request-outline',
      'PortalChangeRequests',
    ),
    route('portal-progress', 'Progress', 'sparkles-outline', 'PortalProgressSummaries'),
    route('portal-contracts', 'Contracts', 'document-text-outline', 'PortalContracts'),
  ];
  if (has(PERMISSIONS.REPORT_READ_OWN)) {
    afterUpdates.push(route('portal-reports', 'Reports', 'bar-chart-outline', 'PortalReports'));
  }
  return {
    beforeTickets: [route('portal-projects', 'Projects', 'folder-open-outline', 'PortalProjects')],
    afterUpdates,
  };
}
