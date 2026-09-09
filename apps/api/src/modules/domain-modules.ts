import { ApprovalsModule } from './approvals/approvals.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { BrandingModule } from './branding/branding.module';
import { CallLogsModule } from './call-logs/call-logs.module';
import { CommunicationModule } from './communication/communication.module';
import { ChangeRequestsModule } from './change-requests/change-requests.module';
import { ClientUpdatesModule } from './client-updates/client-updates.module';
import { ContractsModule } from './contracts/contracts.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { FilesModule } from './files/files.module';
import { GitIntegrationModule } from './git-integration/git.module';
import { GithubModule } from './github/github.module';
import { HealthModule } from './health/health.module';
import { IncidentsModule } from './incidents/incidents.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { IvrModule } from './ivr/ivr.module';
import { MetricsModule } from './metrics/metrics.module';
import { MilestonesModule } from './milestones/milestones.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnCallModule } from './on-call/on-call.module';
import { OrganizationMembershipsModule } from './organization-memberships/organization-memberships.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PortalModule } from './portal/portal.module';
import { ProblemsModule } from './problems/problems.module';
import { ProductsModule } from './products/products.module';
import { ProjectsModule } from './projects/projects.module';
import { QaModule } from './qa/qa.module';
import { RcaModule } from './rca/rca.module';
import { RecurringIssuesModule } from './recurring-issues/recurring-issues.module';
import { RelationsModule } from './relations/relations.module';
import { AiSummariesModule } from './ai-summaries/ai-summaries.module';
import { BillingModule } from './billing/billing.module';
import { MessagingModule } from './messaging/messaging.module';
import { ReleaseNotesModule } from './release-notes/release-notes.module';
import { ReleasesModule } from './releases/releases.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { RolesPermissionsModule } from './roles-permissions/roles-permissions.module';
import { SlaEscalationsModule } from './sla-escalations/sla-escalations.module';
import { SupportCallbacksModule } from './support-callbacks/support-callbacks.module';
import { SupportTierPolicyModule } from './support-tiers/support-tier-policy.module';
import { SupportTiersModule } from './support-tiers/support-tiers.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamsModule } from './teams/teams.module';
import { TicketRoutingModule } from './ticket-routing/ticket-routing.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';
import { WorkLogsModule } from './work-logs/work-logs.module';

/**
 * Every business module, in one list, imported by AppModule.
 * Adding a feature = create its folder under src/modules and add it here.
 */
export const DomainModules = [
  // Foundation (Phase 0)
  HealthModule,
  MetricsModule,
  BrandingModule,
  AuthModule,
  AuditLogsModule,
  OrganizationsModule,
  OrganizationMembershipsModule,
  // Identity and structure
  UsersModule,
  TeamsModule,
  RolesPermissionsModule,
  SupportTierPolicyModule,
  ProductsModule,
  ProjectsModule,
  MilestonesModule,
  // Work
  TasksModule,
  WorkLogsModule,
  TicketsModule,
  ContractsModule,
  ClientUpdatesModule,
  ApprovalsModule,
  ChangeRequestsModule,
  FilesModule,
  // Quality and delivery
  QaModule,
  ReleasesModule,
  GithubModule,
  // Smart support
  TicketRoutingModule,
  OnCallModule,
  SlaEscalationsModule,
  IvrModule,
  CallLogsModule,
  SupportTiersModule,
  SupportCallbacksModule,
  CommunicationModule,
  RecurringIssuesModule,
  RelationsModule,
  ProblemsModule,
  RcaModule,
  IncidentsModule,
  // Integrations (Phase 3)
  IntegrationsModule,
  GitIntegrationModule,
  ReleaseNotesModule,
  MessagingModule,
  BillingModule,
  AiSummariesModule,
  // Cross-cutting outputs
  NotificationsModule,
  ReportsModule,
  DashboardsModule,
  PortalModule,
  // Reads across the modules above, so it is imported after all of them.
  SearchModule,
];
