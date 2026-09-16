/**
 * Audit-log action keys recorded by the API. Grouped by entity so the Audit History screen can
 * offer type filters ("Tasks", "Tickets", "Users", "Security", …) without parsing strings.
 */
export const AUDIT_ACTION = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_DELETED: 'user.deleted',
  TEAM_CREATED: 'team.created',
  TEAM_UPDATED: 'team.updated',
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  WORK_PLAN_PARSED: 'project.work_plan_parsed',
  WORK_PLAN_UPDATED: 'project.work_plan_updated',
  WORK_PLAN_POINT_STARTED: 'project.work_plan_point_started',
  WORK_PLAN_POINT_SUBMITTED: 'project.work_plan_point_submitted',
  WORK_PLAN_POINT_RETURNED: 'project.work_plan_point_returned',
  WORK_PLAN_POINT_COMPLETED: 'project.work_plan_point_completed',
  WORK_PLAN_DOUBT: 'project.work_plan_doubt',
  WORK_PLAN_ASSIGNED: 'project.work_plan_assigned',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_STATUS_CHANGED: 'task.status_changed',
  TASK_REVIEWED: 'task.reviewed',
  WORK_LOGGED: 'work.logged',
  CLIENT_UPDATE_PUBLISHED: 'client_update.published',
  CLIENT_UPDATE_WITHDRAWN: 'client_update.withdrawn',
  TICKET_CREATED: 'ticket.created',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_STATUS_CHANGED: 'ticket.status_changed',
  TICKET_CONVERTED: 'ticket.converted_to_task',
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',
  // Phase 2
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_INVITATION_CREATED: 'auth.invitation_created',
  AUTH_INVITATION_ACCEPTED: 'auth.invitation_accepted',
  AUTH_INVITATION_REVOKED: 'auth.invitation_revoked',
  AUTH_REAUTHENTICATED: 'auth.reauthenticated',
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_PERMISSIONS_CHANGED: 'role.permissions_changed',
  ROLE_DELETED: 'role.deleted',
  USER_ROLE_CHANGED: 'user.role_changed',
  CONTRACT_CREATED: 'contract.created',
  CONTRACT_UPDATED: 'contract.updated',
  CONTRACT_ARCHIVED: 'contract.archived',
  CONTRACT_HOURS_ADJUSTED: 'contract.hours_adjusted',
  CONTRACT_HOURS_CONSUMED: 'contract.hours_consumed',
  CONTRACT_PERIOD_CLOSED: 'contract.period_closed',
  PAYMENT_MILESTONE_CHANGED: 'contract.payment_milestone_changed',
  MILESTONE_CREATED: 'milestone.created',
  MILESTONE_UPDATED: 'milestone.updated',
  MILESTONE_STATUS_CHANGED: 'milestone.status_changed',
  MILESTONE_PROGRESS_ADJUSTED: 'milestone.progress_adjusted',
  SLA_POLICY_CREATED: 'sla.policy_created',
  SLA_POLICY_UPDATED: 'sla.policy_updated',
  SLA_POLICY_DELETED: 'sla.policy_deleted',
  SLA_BREACHED: 'sla.breached',
  CHANGE_REQUEST_CREATED: 'change_request.created',
  CHANGE_REQUEST_UPDATED: 'change_request.updated',
  CHANGE_REQUEST_STATUS_CHANGED: 'change_request.status_changed',
  CHANGE_REQUEST_TASKS_GENERATED: 'change_request.tasks_generated',
  APPROVAL_CREATED: 'approval.created',
  APPROVAL_STATUS_CHANGED: 'approval.status_changed',
  APPROVAL_DECIDED: 'approval.decided',
  REPORT_EXPORTED: 'report.exported',
  NOTIFICATION_PREFERENCES_CHANGED: 'notification.preferences_changed',
  // Phase 3 — integrations
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',
  INTEGRATION_VALIDATED: 'integration.validated',
  INTEGRATION_UPDATED: 'integration.updated',
  INTEGRATION_SYNC_FAILED: 'integration.sync_failed',
  REPOSITORY_LINKED: 'repository.linked',
  REPOSITORY_UNLINKED: 'repository.unlinked',
  // Phase 3 — release notes
  RELEASE_NOTE_CREATED: 'release_note.created',
  RELEASE_NOTE_SUBMITTED: 'release_note.submitted',
  RELEASE_NOTE_APPROVED: 'release_note.approved',
  RELEASE_NOTE_CHANGES_REQUESTED: 'release_note.changes_requested',
  RELEASE_NOTE_PUBLISHED: 'release_note.published',
  RELEASE_NOTE_CANCELLED: 'release_note.cancelled',
  RELEASE_NOTE_RETURNED_TO_DRAFT: 'release_note.returned_to_draft',

  // Testing, credentials and releases (Phase 4)
  QA_ASSIGNED: 'qa.assigned',
  QA_STARTED: 'qa.started',
  QA_RESULT_RECORDED: 'qa.result_recorded',
  QA_CLARIFICATION_REQUESTED: 'qa.clarification_requested',
  QA_LIVE_VERIFIED: 'qa.live_verified',
  QA_ASSIGNMENT_CANCELLED: 'qa.assignment_cancelled',
  TEST_ACCOUNT_CREATED: 'test_account.created',
  TEST_ACCOUNT_UPDATED: 'test_account.updated',
  TEST_ACCOUNT_ROTATED: 'test_account.rotated',
  CREDENTIAL_GRANTED: 'credential.granted',
  CREDENTIAL_REVEALED: 'credential.revealed',
  CREDENTIAL_REVOKED: 'credential.revoked',
  RELEASE_CREATED: 'release.created',
  RELEASE_APPROVAL_REQUESTED: 'release.approval_requested',
  RELEASE_APPROVED: 'release.approved',
  RELEASE_REJECTED: 'release.rejected',
  RELEASE_SCHEDULED: 'release.scheduled',
  RELEASE_PUBLISHED: 'release.published',
  RELEASE_VERIFIED: 'release.verified',
  RELEASE_UPDATED: 'release.updated',
  RELEASE_ROLLED_BACK: 'release.rolled_back',
  /// A publish that reached the provider and came back failed, as distinct from one that shipped.
  RELEASE_PUBLISH_FAILED: 'release.publish_failed',
  /// A failed release returned to draft so it can be tried again.
  RELEASE_REOPENED: 'release.reopened',
  RELEASE_POLICY_UPDATED: 'release.policy_updated',
  UAT_REQUESTED: 'uat.requested',
  UAT_DECIDED: 'uat.decided',
  // Working hours, support ownership and availability (Phase 4, package 8a)
  SUPPORT_OWNERSHIP_UPDATED: 'support_ownership.updated',
  WORK_SCHEDULE_UPDATED: 'work_schedule.updated',
  /// Recorded for every availability change, including the ones Ashniva HR pushes in.
  AVAILABILITY_UPDATED: 'availability.updated',
  ON_CALL_UPDATED: 'on_call.updated',
  // Support routing (Phase 4, package 8b)
  TICKET_ROUTED: 'ticket.routed',
  TICKET_ROUTING_QUEUED: 'ticket.routing_queued',
  TICKET_ACKNOWLEDGED: 'ticket.acknowledged',
  TICKET_REASSIGNED: 'ticket.reassigned',
  TICKET_ESCALATED: 'ticket.escalated',
  // Product registry and external support ingress (Phase 4, package 8c)
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_SUPPORT_TOGGLED: 'product.support_toggled',
  PRODUCT_PROJECT_LINKED: 'product.project_linked',
  PRODUCT_CREDENTIAL_CREATED: 'product.credential_created',
  PRODUCT_CREDENTIAL_ROTATED: 'product.credential_rotated',
  PRODUCT_CREDENTIAL_REVOKED: 'product.credential_revoked',
  /**
   * A tier change, on its own action rather than inside a generic update.
   *
   * Once a tier drives SLA selection and escalation timing, "when did this become PRIORITY" is a
   * question somebody will need answered, and diffing two JSON blobs six months later is not an
   * answer.
   */
  PRODUCT_TIER_CHANGED: 'product.tier_changed',
  PRODUCT_ORIGINS_CHANGED: 'product.origins_changed',
  PRODUCT_WIDGET_SESSION_ISSUED: 'product.widget_session_issued',
  PRODUCT_CALLBACK_CONFIGURED: 'product.callback_configured',
  PRODUCT_CALLBACK_SECRET_ROTATED: 'product.callback_secret_rotated',
  PRODUCT_CALLBACK_REDELIVERED: 'product.callback_redelivered',
  SUPPORT_TIER_POLICY_UPDATED: 'support_tier_policy.updated',
  /// One accepted external request. Records the product and the credential's public id — never
  /// the secret, and never the raw payload.
  SUPPORT_INGRESS_ACCEPTED: 'support.ingress_accepted',
  SUPPORT_INGRESS_REJECTED: 'support.ingress_rejected',
  // IVR support calls (Phase 4, package 9)
  CALL_INITIATED: 'call.initiated',
  /// Which destination the routing decision produced, and from which rung of the ladder.
  CALL_TARGET_CHOSEN: 'call.target_chosen',
  /// One destination did not answer and the next was tried. Carries the stated cause.
  CALL_FALLBACK_ATTEMPTED: 'call.fallback_attempted',
  CALL_CONNECTED: 'call.connected',
  CALL_COMPLETED: 'call.completed',
  CALL_CANCELLED: 'call.cancelled',
  CALL_RECORDING_AVAILABLE: 'call.recording_available',
  /// Every playback by every privileged user. The recording itself is never in the payload.
  CALL_RECORDING_ACCESSED: 'call.recording_accessed',
  CALL_RECORDING_ACCESS_DENIED: 'call.recording_access_denied',
  IVR_POLICY_UPDATED: 'ivr.policy_updated',
  // Internal project communication (Phase 4, package 9b)
  CONVERSATION_CREATED: 'conversation.created',
  /// A pairing was established: who, with whom, on which project, under which role pair.
  CONVERSATION_PARTICIPANT_ADDED: 'conversation.participant_added',
  /// Somebody was taken out of a group, by an administrator of it or by themselves. The row says
  /// which, because "an admin removed a colleague" and "a colleague left" are different events.
  CONVERSATION_PARTICIPANT_REMOVED: 'conversation.participant_removed',
  /// A group was renamed or given a new picture. Titles are not message bodies and a group's name
  /// is part of who can be found in a directory, so the change is worth a row.
  CONVERSATION_UPDATED: 'conversation.updated',
  /// The attachment, never the message body — the message already lives in the messages table.
  CONVERSATION_ATTACHMENT_SHARED: 'conversation.attachment_shared',
  /// A sender rewrote their own message inside the edit window. The previous body is kept as a
  /// revision; neither body appears here, for the same reason no message body ever does.
  CONVERSATION_MESSAGE_EDITED: 'conversation.message_edited',
  /// A message was withdrawn — by its sender, or by somebody holding oversight. Which of the two
  /// is in the payload, because a moderator removing a colleague's words is the interesting case.
  CONVERSATION_MESSAGE_DELETED: 'conversation.message_deleted',
  CONVERSATION_ACCESS_DENIED: 'conversation.access_denied',
  /// Oversight that leaves no trace is indistinguishable from a breach.
  CONVERSATION_INSPECTED: 'conversation.inspected',
  CONVERSATION_SETTINGS_UPDATED: 'conversation.settings_updated',
  // Phase 3 — communication
  EMAIL_SETTINGS_UPDATED: 'email.settings_updated',
  EMAIL_TEST_SENT: 'email.test_sent',
  WHATSAPP_SETTINGS_UPDATED: 'whatsapp.settings_updated',
  WHATSAPP_TEST_SENT: 'whatsapp.test_sent',
  // Phase 3 — billing
  BILLING_PROFILE_UPDATED: 'billing.profile_updated',
  /** The provider's record of how one client is invoiced — the "Bill to" block. */
  CLIENT_BILLING_PROFILE_UPDATED: 'billing.client_profile_updated',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_ISSUED: 'invoice.issued',
  INVOICE_CANCELLED: 'invoice.cancelled',
  INVOICE_VOIDED: 'invoice.voided',
  PAYMENT_RECORDED: 'payment.recorded',
  /** Money moved against invoices after the payment was already on the ledger. */
  PAYMENT_ALLOCATED: 'payment.allocated',
  /** An operator sent a failed outbound message again. Never automatic. */
  MESSAGE_RESENT: 'message.resent',
  // Phase 3 — AI
  AI_SUMMARY_GENERATED: 'ai_summary.generated',
  AI_SUMMARY_APPROVED: 'ai_summary.approved',
  AI_SUMMARY_FAILED: 'ai_summary.failed',
  AI_SUMMARY_PUBLISHED: 'ai_summary.published',
  AI_SUMMARY_CANCELLED: 'ai_summary.cancelled',
  /**
   * Branding changed.
   *
   * Audited because it is a change to what every person who signs in sees, including the client
   * portal — the cheapest thing in the product to make convincingly wrong, and until now the only
   * way to change it was to edit the database by hand.
   */
  BRANDING_UPDATED: 'branding.updated',
  // Package 11 — recurring issues, problems, RCA and incidents
  /** A person confirmed or dismissed a suggested duplicate. The suggestion itself is not audited. */
  SIMILARITY_DECIDED: 'similarity.decided',
  PROBLEM_CREATED: 'problem.created',
  PROBLEM_UPDATED: 'problem.updated',
  PROBLEM_TICKET_LINKED: 'problem.ticket_linked',
  PROBLEM_RCA_REQUESTED: 'problem.rca_requested',
  PROBLEM_DEVELOPER_ASKED: 'problem.developer_asked',
  PROBLEM_FIX_ASSIGNED: 'problem.fix_assigned',
  PROBLEM_PREVENTIVE_TEST_ADDED: 'problem.preventive_test_added',
  PROBLEM_CLOSED: 'problem.closed',
  RCA_SUBMITTED: 'rca.submitted',
  RCA_APPROVED: 'rca.approved',
  RCA_CHANGES_REQUESTED: 'rca.changes_requested',
  RCA_ACTION_VERIFIED: 'rca.action_verified',
  INCIDENT_OPENED: 'incident.opened',
  INCIDENT_UPDATED: 'incident.updated',
  INCIDENT_EMERGENCY_FIX_REQUESTED: 'incident.emergency_fix_requested',
  INCIDENT_EMERGENCY_FIX_DECIDED: 'incident.emergency_fix_decided',
  /** Somebody chose to tell the client about an incident. Never automatic. */
  INCIDENT_CLIENT_SUMMARY_PUBLISHED: 'incident.client_summary_published',
  INCIDENT_RESOLVED: 'incident.resolved',
  INCIDENT_CLOSED: 'incident.closed',
  // Duplicate and related work items
  /**
   * Two items were linked, or a link was removed.
   *
   * Audited because a link is a disclosure as well as a decision: it says one client's report and
   * another's are the same thing, and — when the link is a duplicate — it closes one of them. The
   * payload names both ends and the type, never a title.
   */
  TICKET_LINKED: 'ticket.linked',
  TICKET_UNLINKED: 'ticket.unlinked',
  TASK_LINKED: 'task.linked',
  TASK_UNLINKED: 'task.unlinked',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_ENTITY_TYPE = {
  AUTH: 'auth',
  ORGANIZATION: 'organization',
  USER: 'user',
  TEAM: 'team',
  PROJECT: 'project',
  TASK: 'task',
  WORK_LOG: 'work_log',
  CLIENT_UPDATE: 'client_update',
  TICKET: 'ticket',
  FILE: 'file',
  ROLE: 'role',
  CONTRACT: 'contract',
  MILESTONE: 'milestone',
  SLA_POLICY: 'sla_policy',
  CHANGE_REQUEST: 'change_request',
  APPROVAL: 'approval',
  REPORT: 'report',
  NOTIFICATION: 'notification',
  // Phase 3
  INTEGRATION: 'integration',
  REPOSITORY: 'repository',
  RELEASE_NOTE: 'release_note',
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  AI_SUMMARY: 'ai_summary',
  MESSAGE: 'message',
  TESTING_ASSIGNMENT: 'testing_assignment',
  TEST_ACCOUNT: 'test_account',
  CREDENTIAL_GRANT: 'credential_grant',
  RELEASE: 'release',
  UAT_REQUEST: 'uat_request',
  PRODUCT: 'product',
  SUPPORT_TIER: 'support_tier',
  CALL: 'call',
  CONVERSATION: 'conversation',
  BRANDING: 'branding',
  PROBLEM: 'problem',
  RCA_REPORT: 'rca_report',
  INCIDENT: 'incident',
} as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPE)[keyof typeof AUDIT_ENTITY_TYPE];

export const AUDIT_ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  auth: 'Security',
  organization: 'Companies',
  user: 'Users',
  team: 'Teams',
  project: 'Projects',
  task: 'Tasks',
  work_log: 'Work logs',
  client_update: 'Client updates',
  ticket: 'Tickets',
  file: 'Files',
  role: 'Roles and permissions',
  contract: 'Contracts',
  milestone: 'Milestones',
  sla_policy: 'SLA policies',
  change_request: 'Change requests',
  approval: 'Approvals',
  report: 'Reports',
  notification: 'Notifications',
  integration: 'Integrations',
  repository: 'Repositories',
  release_note: 'Release notes',
  invoice: 'Invoices',
  payment: 'Payments',
  ai_summary: 'AI summaries',
  message: 'Messages',
  testing_assignment: 'Testing assignments',
  test_account: 'Test accounts',
  credential_grant: 'Credential grants',
  release: 'Releases',
  uat_request: 'Client UAT',
  product: 'Products and support ingress',
  support_tier: 'Products and support ingress',
  call: 'Support calls and recordings',
  conversation: 'Internal communication',
  branding: 'Branding and theme',
  problem: 'Problems and recurring issues',
  rca_report: 'Root-cause analyses',
  incident: 'Incidents',
};
