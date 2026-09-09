import { PERMISSIONS } from '@ashniva/types';
import { Navigate, type RouteObject } from 'react-router';

import { RequirePermission } from '../features/auth/RequirePermission';
import { SearchResultsPage } from '../features/search/pages/SearchResultsPage';
import { AdvancedReportsPage } from '../features/reports/pages/AdvancedReportsPage';
import { AppShell, type RouteHandle } from './layout/AppShell';
import { NotFoundPage } from '../features/errors/NotFoundPage';
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage';
import { PortalAiSummariesPage } from '../features/ai-summaries/pages/PortalAiSummariesPage';
import { PortalApprovalDetailPage } from '../features/portal/pages/PortalApprovalDetailPage';
import { PortalApprovalsPage } from '../features/portal/pages/PortalApprovalsPage';
import { PortalChangeRequestDetailPage } from '../features/portal/pages/PortalChangeRequestDetailPage';
import { PortalChangeRequestsPage } from '../features/portal/pages/PortalChangeRequestsPage';
import { PortalContractDetailPage } from '../features/portal/pages/PortalContractDetailPage';
import { PortalContractsPage } from '../features/portal/pages/PortalContractsPage';
import { PortalUatDetailPage } from '../features/uat/pages/PortalUatDetailPage';
import { PortalUatPage } from '../features/uat/pages/PortalUatPage';
import { PortalHomePage } from '../features/portal/pages/PortalHomePage';
import { PortalInvoiceDetailPage } from '../features/billing/pages/PortalInvoiceDetailPage';
import { PortalInvoicesPage } from '../features/billing/pages/PortalInvoicesPage';
import { PortalProjectDetailPage } from '../features/portal/pages/PortalProjectDetailPage';
import { PortalProjectsPage } from '../features/portal/pages/PortalProjectsPage';
import { PortalRaiseTicketPage } from '../features/portal/pages/PortalRaiseTicketPage';
import { PortalReleaseNotesPage } from '../features/release-notes/pages/PortalReleaseNotesPage';
import { PortalTicketDetailPage } from '../features/portal/pages/PortalTicketDetailPage';
import { PortalTicketsPage } from '../features/portal/pages/PortalTicketsPage';
import { ProfilePage } from '../features/profile/pages/ProfilePage';

const handle = (title: string): RouteHandle => ({ title });

/**
 * The client portal's routes.
 *
 * Kept in their own file rather than inline in the route table: the portal is the half of the
 * app a client sees, and a screen appearing in the wrong branch is the kind of mistake worth
 * making structurally hard.
 */
export const portalRoutes: RouteObject[] = [
  {
    path: '/portal',
    element: <AppShell homePath="/portal" />,
    children: [
      { index: true, element: <PortalHomePage />, handle: handle('Overview') },
      { path: 'search', element: <SearchResultsPage />, handle: handle('Search') },
      { path: 'projects', element: <PortalProjectsPage />, handle: handle('Projects') },
      { path: 'projects/:id', element: <PortalProjectDetailPage />, handle: handle('Project') },
      { path: 'tickets', element: <PortalTicketsPage />, handle: handle('Tickets') },
      {
        path: 'tickets/new',
        element: <PortalRaiseTicketPage />,
        handle: handle('Raise a ticket'),
      },
      { path: 'tickets/:id', element: <PortalTicketDetailPage />, handle: handle('Ticket') },
      /*
        The three permission-gated branches.

        `CLIENT_EMPLOYEE` holds none of `uat:decide`, `approval:decide` or `report:read-own` — a
        client administrator does. Registered unconditionally, these screens loaded for an employee
        and then 403'd on every request, which reads as a broken product rather than as a
        permission they do not have. The guard is presentation; the API refuses the calls either
        way.
      */
      {
        element: (
          <RequirePermission
            permission={PERMISSIONS.UAT_DECIDE}
            title="Sign-off is your administrator’s"
            description="Only a client administrator can approve what we hand over. Ask yours to look at it."
          />
        ),
        children: [
          { path: 'uat', element: <PortalUatPage />, handle: handle('Sign-off') },
          { path: 'uat/:id', element: <PortalUatDetailPage />, handle: handle('Sign-off') },
        ],
      },
      { path: 'contracts', element: <PortalContractsPage />, handle: handle('Contracts') },
      {
        path: 'contracts/:id',
        element: <PortalContractDetailPage />,
        handle: handle('Contract'),
      },
      {
        path: 'change-requests',
        element: <PortalChangeRequestsPage />,
        handle: handle('Change requests'),
      },
      {
        path: 'change-requests/:id',
        element: <PortalChangeRequestDetailPage />,
        handle: handle('Change request'),
      },
      {
        path: 'release-notes',
        element: <PortalReleaseNotesPage />,
        handle: handle('Releases'),
      },
      {
        path: 'progress-summaries',
        element: <PortalAiSummariesPage />,
        handle: handle('Progress summaries'),
      },
      { path: 'invoices', element: <PortalInvoicesPage />, handle: handle('Invoices') },
      {
        path: 'invoices/:id',
        element: <PortalInvoiceDetailPage />,
        handle: handle('Invoice'),
      },
      {
        element: (
          <RequirePermission
            permission={PERMISSIONS.APPROVAL_DECIDE}
            title="Approvals are your administrator’s"
            description="Only a client administrator can approve a quote, a design or a change. Ask yours to take a look."
          />
        ),
        children: [
          { path: 'approvals', element: <PortalApprovalsPage />, handle: handle('Approvals') },
          {
            path: 'approvals/:id',
            element: <PortalApprovalDetailPage />,
            handle: handle('Approval'),
          },
        ],
      },
      {
        element: (
          <RequirePermission
            permission={PERMISSIONS.REPORT_READ_OWN}
            title="Reports are your administrator’s"
            description="Your administrator can see progress reports for your organization and share them with you."
          />
        ),
        children: [
          {
            path: 'reports',
            element: <AdvancedReportsPage portal />,
            handle: handle('Reports'),
          },
        ],
      },
      {
        path: 'notifications',
        element: <NotificationsPage />,
        handle: handle('Notifications'),
      },
      { path: 'contract', element: <Navigate to="/portal/contracts" replace /> },
      { path: 'profile', element: <ProfilePage />, handle: handle('Profile') },
      { path: '*', element: <NotFoundPage />, handle: handle('Not found') },
    ],
  },
];
