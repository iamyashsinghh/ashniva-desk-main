import { createBrowserRouter, Navigate } from 'react-router';

import { AuditPage } from '../features/audit/pages/AuditPage';
import { CompaniesPage } from '../features/admin/pages/CompaniesPage';
import { RolesPage } from '../features/admin/pages/RolesPage';
import { UsersPage } from '../features/admin/pages/UsersPage';
import { BrandingSettingsPage } from '../features/branding/pages/BrandingSettingsPage';
import {
  AcceptInvitationPage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from '../features/auth/pages/AccountRecoveryPages';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { CompletedTodayPage } from '../features/client-updates/pages/CompletedTodayPage';
import { ApprovalDetailPage } from '../features/approvals/pages/ApprovalDetailPage';
import { ApprovalsPage } from '../features/approvals/pages/ApprovalsPage';
import { ChangeRequestDetailPage } from '../features/change-requests/pages/ChangeRequestDetailPage';
import { ChangeRequestsPage } from '../features/change-requests/pages/ChangeRequestsPage';
import { BillingSettingsPage } from '../features/billing/pages/BillingSettingsPage';
import { InvoiceDetailPage } from '../features/billing/pages/InvoiceDetailPage';
import { InvoiceEditorPage } from '../features/billing/pages/InvoiceEditorPage';
import { InvoicesPage } from '../features/billing/pages/InvoicesPage';
import { PaymentsPage } from '../features/billing/pages/PaymentsPage';
import { EmailSettingsPage } from '../features/messaging/pages/EmailSettingsPage';
import { WhatsAppSettingsPage } from '../features/messaging/pages/WhatsAppSettingsPage';
import { AiSummariesPage } from '../features/ai-summaries/pages/AiSummariesPage';
import { AiSummaryDetailPage } from '../features/ai-summaries/pages/AiSummaryDetailPage';
import { AiUsagePage } from '../features/ai-summaries/pages/AiUsagePage';
import { AssignmentDetailPage } from '../features/qa/pages/AssignmentDetailPage';
import { TestAccountsPage } from '../features/qa/pages/TestAccountsPage';
import { TestEnvironmentsPage } from '../features/qa/pages/TestEnvironmentsPage';
import { TesterQueuePage } from '../features/qa/pages/TesterQueuePage';
import { ReleaseDetailPage } from '../features/releases/pages/ReleaseDetailPage';
import { ReleasesPage } from '../features/releases/pages/ReleasesPage';
import { ReleaseNoteDetailPage } from '../features/release-notes/pages/ReleaseNoteDetailPage';
import { ReleaseNotesPage } from '../features/release-notes/pages/ReleaseNotesPage';
import { ContractDetailPage } from '../features/contracts/pages/ContractDetailPage';
import { ContractsPage } from '../features/contracts/pages/ContractsPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { NotFoundPage } from '../features/errors/NotFoundPage';
import { MilestoneDetailPage } from '../features/milestones/pages/MilestoneDetailPage';
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage';
import { IncidentDetailPage } from '../features/problems/pages/IncidentDetailPage';
import { IncidentListPage } from '../features/problems/pages/IncidentListPage';
import { ProblemDetailPage } from '../features/problems/pages/ProblemDetailPage';
import { ProblemListPage } from '../features/problems/pages/ProblemListPage';
import { RecurringIssuesPage } from '../features/problems/pages/RecurringIssuesPage';
import { ProfilePage } from '../features/profile/pages/ProfilePage';
import { ProjectDetailPage } from '../features/projects/pages/ProjectDetailPage';
import { ProjectsPage } from '../features/projects/pages/ProjectsPage';
import { AdvancedReportsPage } from '../features/reports/pages/AdvancedReportsPage';
import { ReportsPage } from '../features/reports/pages/ReportsPage';
import { SlaPoliciesPage } from '../features/sla/pages/SlaPoliciesPage';
import { SupportConfigPage } from '../features/support-routing/pages/SupportConfigPage';
import { SupportQueuePage } from '../features/support-routing/pages/SupportQueuePage';
import { ProductDetailPage } from '../features/products/pages/ProductDetailPage';
import { ProductsPage } from '../features/products/pages/ProductsPage';
import { SystemStatusPage } from '../features/system/pages/SystemStatusPage';
import { CreateTaskPage } from '../features/tasks/pages/CreateTaskPage';
import { TaskDetailPage } from '../features/tasks/pages/TaskDetailPage';
import { TasksPage } from '../features/tasks/pages/TasksPage';
import { CommunicationSettingsPage } from '../features/communication/pages/CommunicationSettingsPage';
import { MessagesPage } from '../features/communication/pages/MessagesPage';
import { CreateTicketPage } from '../features/tickets/pages/CreateTicketPage';
import { TicketDetailPage } from '../features/tickets/pages/TicketDetailPage';
import { TicketsPage } from '../features/tickets/pages/TicketsPage';
import { SearchResultsPage } from '../features/search/pages/SearchResultsPage';
import { AppShell, type RouteHandle } from './layout/AppShell';
import { portalRoutes } from './portal-routes';

const handle = (title: string): RouteHandle => ({ title });

/**
 * Route table. Two shells: the internal app under "/" and the client portal under "/portal",
 * each behind RequireAuth so a client never sees internal screens (and vice versa). The API
 * enforces the same boundaries on every request.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },
  { path: '/invite/:token', element: <AcceptInvitationPage /> },
  { element: <RequireAuth audience="client" />, children: portalRoutes },
  {
    element: <RequireAuth audience="internal" />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage />, handle: handle('Dashboard') },
          { path: 'search', element: <SearchResultsPage />, handle: handle('Search') },
          { path: 'tasks', element: <TasksPage />, handle: handle('Tasks') },
          { path: 'tasks/new', element: <CreateTaskPage />, handle: handle('New task') },
          { path: 'tasks/:id', element: <TaskDetailPage />, handle: handle('Task') },
          { path: 'messages', element: <MessagesPage />, handle: handle('Messages') },
          // The id in the path is what `conversationLink` has always built for a direct message
          // and a group. Without this route those notification links landed on a screen that
          // dropped the id and opened nothing.
          {
            path: 'messages/:conversationId',
            element: <MessagesPage />,
            handle: handle('Messages'),
          },
          { path: 'tickets', element: <TicketsPage />, handle: handle('Tickets') },
          { path: 'tickets/new', element: <CreateTicketPage />, handle: handle('New ticket') },
          { path: 'tickets/:id', element: <TicketDetailPage />, handle: handle('Ticket') },
          {
            path: 'support-queue',
            element: <SupportQueuePage />,
            handle: handle('Support queue'),
          },
          {
            path: 'support/recurring',
            element: <RecurringIssuesPage />,
            handle: handle('Recurring issues'),
          },
          { path: 'problems', element: <ProblemListPage />, handle: handle('Problems') },
          { path: 'problems/:id', element: <ProblemDetailPage />, handle: handle('Problem') },
          { path: 'incidents', element: <IncidentListPage />, handle: handle('Incidents') },
          { path: 'incidents/:id', element: <IncidentDetailPage />, handle: handle('Incident') },
          { path: 'projects', element: <ProjectsPage />, handle: handle('Projects') },
          { path: 'projects/:id', element: <ProjectDetailPage />, handle: handle('Project') },
          {
            path: 'projects/:id/environments',
            element: <TestEnvironmentsPage />,
            handle: handle('Test environments'),
          },
          {
            path: 'projects/:id/test-accounts',
            element: <TestAccountsPage />,
            handle: handle('Test accounts'),
          },
          {
            path: 'completed-today',
            element: <CompletedTodayPage />,
            handle: handle('Completed today'),
          },
          { path: 'reports', element: <ReportsPage />, handle: handle('Daily reports') },
          { path: 'contracts', element: <ContractsPage />, handle: handle('Contracts') },
          { path: 'contracts/:id', element: <ContractDetailPage />, handle: handle('Contract') },
          { path: 'milestones/:id', element: <MilestoneDetailPage />, handle: handle('Milestone') },
          { path: 'approvals', element: <ApprovalsPage />, handle: handle('Approvals') },
          { path: 'approvals/:id', element: <ApprovalDetailPage />, handle: handle('Approval') },
          {
            path: 'change-requests',
            element: <ChangeRequestsPage />,
            handle: handle('Change requests'),
          },
          {
            path: 'change-requests/:id',
            element: <ChangeRequestDetailPage />,
            handle: handle('Change request'),
          },
          {
            path: 'qa',
            element: <TesterQueuePage />,
            handle: handle('Testing'),
          },
          { path: 'qa/:id', element: <AssignmentDetailPage />, handle: handle('Test assignment') },
          {
            path: 'releases',
            element: <ReleasesPage />,
            handle: handle('Releases'),
          },
          { path: 'releases/:id', element: <ReleaseDetailPage />, handle: handle('Release') },
          {
            path: 'release-notes',
            element: <ReleaseNotesPage />,
            handle: handle('Release notes'),
          },
          {
            path: 'release-notes/:id',
            element: <ReleaseNoteDetailPage />,
            handle: handle('Release note'),
          },
          {
            path: 'ai-summaries',
            element: <AiSummariesPage />,
            handle: handle('Progress summaries'),
          },
          {
            path: 'ai-summaries/usage',
            element: <AiUsagePage />,
            handle: handle('AI usage'),
          },
          {
            path: 'ai-summaries/:id',
            element: <AiSummaryDetailPage />,
            handle: handle('Progress summary'),
          },
          { path: 'invoices', element: <InvoicesPage />, handle: handle('Invoices') },
          { path: 'invoices/new', element: <InvoiceEditorPage />, handle: handle('New invoice') },
          { path: 'invoices/:id', element: <InvoiceDetailPage />, handle: handle('Invoice') },
          { path: 'payments', element: <PaymentsPage />, handle: handle('Payments') },
          {
            path: 'settings/billing',
            element: <BillingSettingsPage />,
            handle: handle('Billing settings'),
          },
          {
            path: 'settings/email',
            element: <EmailSettingsPage />,
            handle: handle('Email settings'),
          },
          {
            path: 'settings/whatsapp',
            element: <WhatsAppSettingsPage />,
            handle: handle('WhatsApp settings'),
          },
          {
            path: 'settings/communication',
            element: <CommunicationSettingsPage />,
            handle: handle('Internal communication'),
          },
          {
            path: 'notifications',
            element: <NotificationsPage />,
            handle: handle('Notifications'),
          },
          {
            path: 'reports/advanced',
            element: <AdvancedReportsPage />,
            handle: handle('Reports'),
          },
          { path: 'admin', element: <Navigate to="/admin/users" replace /> },
          {
            path: 'admin/companies',
            element: <CompaniesPage />,
            handle: handle('Companies & clients'),
          },
          { path: 'admin/users', element: <UsersPage />, handle: handle('Users & teams') },
          { path: 'admin/roles', element: <RolesPage />, handle: handle('Roles & permissions') },
          { path: 'admin/sla', element: <SlaPoliciesPage />, handle: handle('SLA policies') },
          { path: 'admin/products', element: <ProductsPage />, handle: handle('Products') },
          {
            path: 'admin/products/:id',
            element: <ProductDetailPage />,
            handle: handle('Product'),
          },
          {
            path: 'admin/support-routing',
            element: <SupportConfigPage />,
            handle: handle('Support routing'),
          },
          {
            path: 'admin/branding',
            element: <BrandingSettingsPage />,
            handle: handle('Branding'),
          },
          { path: 'admin/audit', element: <AuditPage />, handle: handle('Audit history') },
          { path: 'profile', element: <ProfilePage />, handle: handle('Profile') },
          { path: 'system/status', element: <SystemStatusPage />, handle: handle('System status') },
          { path: '*', element: <NotFoundPage />, handle: handle('Not found') },
        ],
      },
    ],
  },
]);
