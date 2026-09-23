import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  TASK_STATUS,
  type RoleKey,
  type SessionUser,
  type TaskDetail,
  type TaskSummary,
} from '@ashniva/types';

const ASHNIVA = {
  id: 'org-ashniva',
  name: 'Ashniva Technologies',
  slug: 'ashniva',
  isServiceProvider: true,
};
const ACME = {
  id: 'org-acme',
  name: 'Acme Retail Pvt Ltd',
  slug: 'acme',
  isServiceProvider: false,
};

/** A signed-in user with the default permission set of the given system role. */
export function sessionUserFor(roleKey: RoleKey, isClient = false): SessionUser {
  const organization = isClient ? ACME : ASHNIVA;
  return {
    id: `user-${roleKey.toLowerCase()}`,
    email: `${roleKey.toLowerCase()}@example.com`,
    name: ROLE_LABELS[roleKey],
    title: null,
    roleKey,
    roleId: `role-${roleKey.toLowerCase()}`,
    roleName: ROLE_LABELS[roleKey],
    isCustomRole: false,
    permissions: DEFAULT_ROLE_PERMISSIONS[roleKey],
    showDevelopmentSection: true,
    organization,
    organizations: [organization],
  };
}

const PRIYA = { id: 'user-priya', name: 'Priya S', email: 'developer@example.com' };
const SNEHA = { id: 'user-sneha', name: 'Sneha N', email: 'lead@example.com' };

/** A task detail as the API returns it; `actions` is what the screen must obey. */
export function taskDetailFixture(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 'task-1',
    key: 'ACM-1',
    number: 1,
    title: 'Printer settings screen',
    status: TASK_STATUS.IN_PROGRESS,
    priority: 'MEDIUM',
    project: { id: 'project-acm', code: 'ACM', name: 'Acme Retail POS' },
    clientOrganization: { id: ACME.id, name: ACME.name, slug: ACME.slug },
    category: null,
    module: null,
    isInternTask: false,
    assignedTo: PRIYA,
    createdBy: SNEHA,
    reviewer: SNEHA,
    tester: null,
    dueDate: null,
    scheduledStartAt: null,
    dueAt: null,
    workAreas: [],
    isUpcoming: false,
    timing: {
      status: 'UNSCHEDULED',
      delayMinutes: null,
      minutesUntilDue: null,
      estimateMinutes: null,
      loggedMinutes: 0,
      overrunMinutes: null,
    },
    estimateMinutes: 120,
    loggedMinutes: 30,
    clientVisible: true,
    isOverdue: false,
    ticket: null,
    milestone: null,
    changeRequest: null,
    startedAt: '2026-09-05T08:00:00.000Z',
    submittedAt: null,
    completedAt: null,
    createdAt: '2026-09-04T08:00:00.000Z',
    updatedAt: '2026-09-05T08:00:00.000Z',
    description: null,
    acceptanceCriteria: null,
    blockedReason: null,
    history: [],
    comments: [],
    workLogs: [],
    files: [],
    clientUpdate: null,
    actions: [],
    ...overrides,
  };
}

/**
 * The same task as a list row.
 *
 * `TaskDetail` extends `TaskSummary`, so this narrows rather than restates: one fixture to keep in
 * step with the DTO instead of two that drift.
 */
export function taskSummaryFixture(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return { ...taskDetailFixture(), ...overrides };
}
