/**
 * Permission keys in `resource:action` form.
 * Stored in the `permissions` table and attached to roles.
 * The API checks these with `@RequirePermissions(...)`; the web app only uses them to hide UI.
 */
export const PERMISSIONS = {
  // Administration
  ORGANIZATION_MANAGE: 'organization:manage',
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  BRANDING_MANAGE: 'branding:manage',
  AUDIT_LOG_READ: 'audit-log:read',
  ADMIN_PREVIEW_AS: 'admin:preview-as',

  // Projects and contracts
  PROJECT_READ: 'project:read',
  PROJECT_MANAGE: 'project:manage',
  CONTRACT_READ: 'contract:read',
  CONTRACT_MANAGE: 'contract:manage',
  CONTRACT_ADJUST_HOURS: 'contract:adjust-hours',
  MILESTONE_MANAGE: 'milestone:manage',
  CHANGE_REQUEST_READ: 'change-request:read',
  CHANGE_REQUEST_RAISE: 'change-request:raise',
  CHANGE_REQUEST_MANAGE: 'change-request:manage',

  // Tasks
  TASK_READ: 'task:read',
  /**
   * Reads every task in the organization rather than only the ones the reader is connected to.
   *
   * `task:read` says a person works with tasks at all; it never said *whose*, and the API answered
   * "everybody's" — one developer could open another's internal comments, work-log text and proof
   * URLs. The width is a separate decision from the ability, so it is a separate key: without this
   * one a reader sees their own work, their projects' and the teams they lead, and with it they see
   * the organization.
   */
  TASK_READ_ALL: 'task:read-all',
  TASK_CREATE: 'task:create',
  TASK_ASSIGN: 'task:assign',
  TASK_WORK: 'task:work',
  TASK_REVIEW: 'task:review',
  TASK_OVERRIDE_CHECKS: 'task:override-checks',
  TASK_CANCEL: 'task:cancel',
  COMMENT_INTERNAL: 'comment:internal',

  // Client-visible updates and approvals
  CLIENT_UPDATE_PUBLISH: 'client-update:publish',
  APPROVAL_MANAGE: 'approval:manage',
  APPROVAL_DECIDE: 'approval:decide',

  // Tickets and support
  TICKET_RAISE: 'ticket:raise',
  TICKET_READ: 'ticket:read',
  TICKET_TRIAGE: 'ticket:triage',
  TICKET_ACCEPT: 'ticket:accept',
  TICKET_ESCALATE: 'ticket:escalate',
  TICKET_REASSIGN: 'ticket:reassign',
  TICKET_RESOLVE: 'ticket:resolve',
  TICKET_REPLY_PUBLIC: 'ticket:reply-public',
  SUPPORT_ROUTING_MANAGE: 'support-routing:manage',
  PRODUCT_READ: 'product:read',
  PRODUCT_MANAGE: 'product:manage',
  SUPPORT_TIER_MANAGE: 'support-tier:manage',
  SLA_MANAGE: 'sla:manage',

  // QA, environments and credentials
  QA_ASSIGN: 'qa:assign',
  QA_RECORD_RESULT: 'qa:record-result',
  QA_VERIFY_LIVE: 'qa:verify-live',
  TEST_ACCOUNT_MANAGE: 'test-account:manage',
  TEST_CREDENTIAL_REVEAL: 'test-credential:reveal',

  // Releases
  RELEASE_MANAGE: 'release:manage',
  RELEASE_APPROVE: 'release:approve',
  RELEASE_PUBLISH: 'release:publish',
  UAT_DECIDE: 'uat:decide',

  // GitHub
  GITHUB_MANAGE: 'github:manage',

  // Integrations (Phase 3)
  INTEGRATION_READ: 'integration:read',
  INTEGRATION_MANAGE: 'integration:manage',
  REPOSITORY_READ: 'repository:read',
  REPOSITORY_MANAGE: 'repository:manage',
  RELEASE_NOTE_READ: 'release-note:read',
  RELEASE_NOTE_WRITE: 'release-note:write',
  RELEASE_NOTE_APPROVE: 'release-note:approve',
  RELEASE_NOTE_PUBLISH: 'release-note:publish',
  COMMUNICATION_MANAGE: 'communication:manage',
  COMMUNICATION_RESEND: 'communication:resend',

  // Billing (Phase 3)
  INVOICE_READ: 'invoice:read',
  INVOICE_WRITE: 'invoice:write',
  INVOICE_ISSUE: 'invoice:issue',
  INVOICE_VOID: 'invoice:void',
  INVOICE_CANCEL: 'invoice:cancel',
  PAYMENT_READ: 'payment:read',
  PAYMENT_RECORD: 'payment:record',
  BILLING_PROFILE_MANAGE: 'billing-profile:manage',

  // AI summaries (Phase 3)
  AI_SUMMARY_READ: 'ai-summary:read',
  AI_SUMMARY_GENERATE: 'ai-summary:generate',
  AI_SUMMARY_APPROVE: 'ai-summary:approve',

  // Problems, RCA and incidents
  /**
   * Read problems, root-cause analyses and the recurring-issues dashboard.
   *
   * Separate from `ticket:read`, which every client role holds. A problem names the other clients
   * who reported the same fault, so reusing the ticket permission would have handed one client the
   * list of the others the first time somebody linked two tickets together.
   */
  PROBLEM_READ: 'problem:read',
  PROBLEM_MANAGE: 'problem:manage',
  PROBLEM_SUGGEST_DUPLICATE: 'problem:suggest-duplicate',
  /** Record the test that stops this coming back. The approved matrix gives QA this and no more. */
  PROBLEM_ADD_PREVENTIVE_TEST: 'problem:add-preventive-test',
  RCA_SUBMIT: 'rca:submit',
  /** Read incidents. Separate from `problem:read` for the same reason problems are separate. */
  INCIDENT_READ: 'incident:read',
  /** Open, update and resolve incidents. Approving an emergency fix is a different key. */
  INCIDENT_MANAGE: 'incident:manage',
  INCIDENT_APPROVE_EMERGENCY_FIX: 'incident:approve-emergency-fix',

  // IVR and calls
  CALL_INITIATE: 'call:initiate',
  CALL_READ_INTERNAL: 'call:read-internal',
  /**
   * Playing a recording, which is a separate decision from reading the call it belongs to.
   *
   * A recording is a client's voice describing their problem. Being allowed to see that a call
   * happened, who took it and how long it lasted is an operational fact; being allowed to listen
   * to it is not, and collapsing the two would hand every developer who can read a ticket the
   * audio of every client who ever rang about one.
   */
  CALL_PLAY_RECORDING: 'call:play-recording',
  IVR_MANAGE: 'ivr:manage',

  /**
   * Internal project communication.
   *
   * The resource is `conversation`, not `communication`: `communication:manage` already exists and
   * governs *outbound* email and WhatsApp settings. Two unrelated things under one resource prefix
   * would share a module heading on the roles screen and read as one permission family, which is
   * exactly the confusion to avoid on a screen where somebody decides who may read whose messages.
   */
  CONVERSATION_PARTICIPATE: 'conversation:participate',
  /**
   * Place a call from a conversation. Separate from posting, because chat without telephony is a
   * real configuration and so is the reverse.
   */
  CONVERSATION_CALL: 'conversation:call',
  /** Super-admin oversight: read across the organization's conversations. Every use is audited. */
  CONVERSATION_INSPECT: 'conversation:inspect',
  /**
   * Start a direct message or a group with anybody in the organization.
   *
   * Everybody else's reach outside a project is *derived* — the people on the projects and teams
   * they manage or lead — and a developer's derived reach is empty, which is how "no new reach"
   * is enforced rather than asserted. This is the one grant that is not derived, and it exists so
   * that "a super admin may message anyone" is a permission a tenant can see on the roles screen
   * and take away, rather than a role name compared in a service.
   *
   * It is a scope grant only. It admits nothing on a project-anchored thread: an administrator
   * who is not on a project still may not write in its conversations.
   */
  CONVERSATION_REACH_ORGANIZATION: 'conversation:reach-organization',
  /** Play an internal call recording. Having been on the call is not enough. */
  CONVERSATION_RECORDING_PLAY: 'conversation:recording-play',
  /** Change the organization's internal chat and calling switches. */
  CONVERSATION_SETTINGS_MANAGE: 'conversation:settings-manage',

  // Reports
  REPORT_READ_OWN: 'report:read-own',
  REPORT_READ_TEAM: 'report:read-team',
  REPORT_READ_ALL: 'report:read-all',
  REPORT_EXPORT: 'report:export',
  COST_READ: 'cost:read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = Object.values(PERMISSIONS);

/** Human-readable descriptions, used by the seed and the Roles & permissions admin screen. */
export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  'organization:manage': 'Create and edit organizations (own group companies and clients)',
  'user:manage': 'Invite, edit and deactivate users; assign roles',
  'role:manage': 'Edit roles and their permissions',
  'branding:manage': 'Change product name, logo and brand colours',
  'audit-log:read': 'Read the audit log',
  'admin:preview-as': 'Preview the system as another role (read-only, audited)',
  'project:read': 'View projects the user is allowed to see',
  'project:manage': 'Create and edit projects, milestones and project settings',
  'contract:read': 'View contracts and support hours',
  'contract:manage': 'Create, edit and archive contracts, documents and payment milestones',
  'contract:adjust-hours': 'Add purchased hours and make audited manual hour adjustments',
  'milestone:manage': 'Create and edit milestones and deliverables; adjust progress with a reason',
  'change-request:read': 'View change requests',
  'change-request:raise': 'Raise change requests',
  'change-request:manage': 'Review, send to the client, schedule and complete change requests',
  'task:read': 'View tasks',
  'task:read-all':
    'View every task in the organization, not only your own work, your projects and the teams you lead',
  'task:create': 'Create tasks',
  'task:assign': 'Assign or reassign tasks to other people',
  'task:work': 'Start, block, complete and submit own tasks',
  'task:review': 'Approve or reject code review',
  'task:override-checks': 'Override failed automated checks with a reason',
  'task:cancel': 'Cancel tasks',
  'comment:internal': 'Read and write internal comments and estimates',
  'client-update:publish': 'Approve and publish client-visible updates',
  'approval:manage': 'Prepare, review and publish approval requests to the client',
  'approval:decide': 'Approve, request changes or reject on behalf of the client',
  'ticket:raise': 'Raise tickets',
  'ticket:read': 'View tickets',
  'ticket:triage': 'Set type, priority and team on tickets; convert tickets to tasks',
  'ticket:accept': 'Accept an auto-assigned ticket and start work on it',
  'ticket:escalate': 'Escalate a ticket to the backup developer or senior',
  'ticket:reassign': 'Reassign a ticket (reason required)',
  'ticket:resolve': 'Resolve and close tickets',
  'ticket:reply-public': 'Post client-visible replies on tickets',
  'support-routing:manage': 'Configure support ownership, on-call schedules and routing rules',
  'product:read': 'View registered products and their support settings',
  'product:manage': 'Register products, link projects, and issue machine credentials',
  'support-tier:manage': 'Configure what each support tier entitles a product to',
  'sla:manage': 'Create and edit SLA policies',
  'qa:assign': 'Create testing assignments and select testers',
  'qa:record-result': 'Record pass/fail results on testing assignments',
  'qa:verify-live': 'Perform live verification after a production release',
  'test-account:manage': 'Create and rotate reusable test accounts',
  'test-credential:reveal': 'Reveal temporary test credentials (audited)',
  'release:manage': 'Create releases, add items, schedule publishing',
  'release:approve': 'Approve or reject a release',
  'release:publish': 'Publish a release to production or roll it back',
  'uat:decide': 'Approve or request changes on client UAT',
  'github:manage': 'Connect GitHub and map repositories to projects',
  'problem:read': 'View problems, root-cause analyses and the recurring-issues dashboard',
  'problem:manage': 'Confirm duplicates, create problems, request RCA, close problems',
  'problem:suggest-duplicate': 'Suggest that a ticket duplicates another (needs confirmation)',
  'problem:add-preventive-test': 'Record the preventive test that stops a problem coming back',
  'rca:submit': 'Submit a root-cause analysis',
  'incident:read': 'View incidents and their timelines',
  'incident:manage': 'Open, update and resolve incidents',
  'incident:approve-emergency-fix': 'Approve an emergency production fix',
  'call:initiate': 'Call a client through the IVR or accept an incoming support call',
  'call:read-internal': 'See the internal call history on a ticket and its internal call notes',
  'call:play-recording': 'Play a call recording (audited every time)',
  'ivr:manage': 'Configure the IVR policy and provider, and view its health',
  'conversation:participate': 'Read and post in the internal conversations of your projects',
  'conversation:call': 'Start an internal call from a conversation',
  'conversation:inspect':
    'Oversight: read internal conversations across the organization (audited)',
  'conversation:reach-organization':
    'Message or group anybody in the organization, not only people on shared projects',
  'conversation:recording-play': 'Play an internal call recording (audited every time)',
  'conversation:settings-manage': 'Change the organization’s internal chat and calling settings',
  'report:read-own': 'View own daily reports',
  'report:read-team': 'View team and project reports',
  'report:read-all': 'View all reports in the organization',
  'report:export': 'Export reports to CSV (audited)',
  'integration:read': 'View integration connections and their status',
  'integration:manage': 'Connect, configure and disconnect integrations',
  'repository:read': 'View repositories linked to a project',
  'repository:manage': 'Link and unlink repositories on a project',
  'release-note:read': 'View release notes',
  'release-note:write': 'Create and edit release-note drafts',
  'release-note:approve': 'Approve a release-note draft',
  'release-note:publish': 'Publish a release note to the client portal',
  'communication:manage': 'Change email and WhatsApp settings and send test messages',
  'communication:resend': 'Send a failed outbound message again',
  'invoice:read': 'View invoices',
  'invoice:write': 'Create and edit draft invoices',
  'invoice:issue': 'Issue an invoice to a client',
  'invoice:void': 'Void an issued invoice, keeping its number spent',
  'invoice:cancel': 'Withdraw a draft invoice that was never sent',
  'payment:read': 'View payments recorded against invoices',
  'payment:record': 'Record a payment against an invoice',
  'billing-profile:manage':
    'Change the billing profile, including the bank account clients pay into',
  'ai-summary:read': 'View AI-generated summaries',
  'ai-summary:generate': 'Generate AI summaries',
  'ai-summary:approve': 'Approve an AI summary for client publication',
  'cost:read': 'View internal costs and profit information',
};

/**
 * Permissions a role used inside a client organization may hold. Everything else is internal
 * staff only; the roles editor and the API refuse to grant it to client-facing roles.
 */
export const CLIENT_SAFE_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.PROJECT_READ,
  PERMISSIONS.CONTRACT_READ,
  PERMISSIONS.CHANGE_REQUEST_READ,
  PERMISSIONS.CHANGE_REQUEST_RAISE,
  PERMISSIONS.TICKET_RAISE,
  PERMISSIONS.TICKET_READ,
  PERMISSIONS.TICKET_REPLY_PUBLIC,
  PERMISSIONS.APPROVAL_DECIDE,
  PERMISSIONS.UAT_DECIDE,
  PERMISSIONS.REPORT_READ_OWN,
  PERMISSIONS.REPORT_EXPORT,
];

/** Module label for a permission key, from its resource part ("task:assign" → "Tasks"). */
export const PERMISSION_MODULE_LABELS: Record<string, string> = {
  organization: 'Administration',
  user: 'Administration',
  role: 'Administration',
  branding: 'Administration',
  'audit-log': 'Administration',
  admin: 'Administration',
  project: 'Projects',
  milestone: 'Projects',
  contract: 'Contracts',
  'change-request': 'Change requests',
  task: 'Tasks',
  comment: 'Tasks',
  'client-update': 'Client updates and approvals',
  approval: 'Client updates and approvals',
  ticket: 'Tickets and support',
  'support-routing': 'Tickets and support',
  product: 'Tickets and support',
  'support-tier': 'Tickets and support',
  sla: 'Tickets and support',
  qa: 'Quality and releases',
  'test-account': 'Quality and releases',
  'test-credential': 'Quality and releases',
  release: 'Quality and releases',
  uat: 'Quality and releases',
  github: 'Integrations',
  integration: 'Integrations',
  repository: 'Integrations',
  'release-note': 'Quality and releases',
  communication: 'Integrations',
  invoice: 'Billing',
  'billing-profile': 'Billing',
  payment: 'Billing',
  'ai-summary': 'AI summaries',
  problem: 'Problems and incidents',
  rca: 'Problems and incidents',
  incident: 'Problems and incidents',
  call: 'IVR and calls',
  ivr: 'IVR and calls',
  conversation: 'Internal communication',
  report: 'Reports',
  cost: 'Reports',
};

export function permissionModule(key: PermissionKey): string {
  const resource = key.split(':')[0] ?? key;
  return PERMISSION_MODULE_LABELS[resource] ?? 'Other';
}
