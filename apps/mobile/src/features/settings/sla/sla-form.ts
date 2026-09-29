import {
  PRIORITY,
  PRIORITY_LABELS,
  TICKET_STATUS,
  TICKET_STATUS_LABELS,
  type Priority,
  type SlaPolicySummary,
  type TicketStatus,
} from '@ashniva/types';

/**
 * The SLA policy form, as plain functions: what an existing policy looks like as a draft, what is
 * wrong with a draft, and what a draft sends.
 *
 * The API stores minutes; people think in hours, so the targets are edited as hours and rounded
 * to whole minutes on the way out, exactly as the web form does.
 */

export type Scope = 'default' | 'client' | 'project';

export const SCOPE_LABELS: Record<Scope, string> = {
  default: 'Everything (default)',
  client: 'One client',
  project: 'One project',
};

export const PRIORITIES = Object.values(PRIORITY);

/** The statuses a clock may pause in — the same three the web offers. */
export const PAUSABLE: TicketStatus[] = [
  TICKET_STATUS.WAITING_CLIENT,
  TICKET_STATUS.REVIEW,
  TICKET_STATUS.ESCALATED,
];

/** ISO weekdays, 1 = Monday. */
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export interface RuleDraft {
  firstResponseHours: string;
  resolutionHours: string;
}

export interface SlaDraft {
  name: string;
  description: string;
  scope: Scope;
  clientOrganizationId: string | null;
  projectId: string | null;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  warningPercent: string;
  businessDays: number[];
  pauseStatuses: TicketStatus[];
  rules: Record<Priority, RuleDraft>;
}

export interface SlaPolicyInput {
  name: string;
  description: string | null;
  isDefault: boolean;
  clientOrganizationId: string | null;
  projectId: string | null;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  pauseStatuses: TicketStatus[];
  warningPercent: number;
  rules: Array<{ priority: Priority; firstResponseMinutes: number; resolutionMinutes: number }>;
}

export type SlaProblems = Partial<
  Record<'name' | 'scope' | 'days' | 'start' | 'end' | 'warning' | 'timezone', string>
> & { rules?: Partial<Record<Priority, string>> };

export function scopeOf(policy?: SlaPolicySummary): Scope {
  if (policy?.project) {
    return 'project';
  }
  return policy?.clientOrganization ? 'client' : 'default';
}

function trimHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

export function draftFrom(policy: SlaPolicySummary | undefined, deviceTimezone: string): SlaDraft {
  const rules: Record<Priority, RuleDraft> = {
    CRITICAL: { firstResponseHours: '1', resolutionHours: '4' },
    HIGH: { firstResponseHours: '2', resolutionHours: '8' },
    MEDIUM: { firstResponseHours: '4', resolutionHours: '24' },
    LOW: { firstResponseHours: '8', resolutionHours: '40' },
  };
  for (const rule of policy?.rules ?? []) {
    rules[rule.priority] = {
      firstResponseHours: trimHours(rule.firstResponseMinutes),
      resolutionHours: trimHours(rule.resolutionMinutes),
    };
  }
  return {
    name: policy?.name ?? '',
    description: policy?.description ?? '',
    scope: scopeOf(policy),
    clientOrganizationId: policy?.clientOrganization?.id ?? null,
    projectId: policy?.project?.id ?? null,
    timezone: policy?.timezone ?? deviceTimezone,
    businessHoursStart: policy?.businessHoursStart ?? '09:00',
    businessHoursEnd: policy?.businessHoursEnd ?? '18:00',
    warningPercent: String(policy?.warningPercent ?? 80),
    businessDays: policy?.businessDays ?? [1, 2, 3, 4, 5],
    pauseStatuses: policy?.pauseStatuses ?? [TICKET_STATUS.WAITING_CLIENT],
    rules,
  };
}

function toMinutes(hours: string): number {
  return Math.round(Number(hours.trim()) * 60);
}

export function draftProblems(draft: SlaDraft): SlaProblems {
  const problems: SlaProblems = {};
  if (draft.name.trim().length < 2) {
    problems.name = 'At least two characters.';
  }
  if (draft.scope === 'client' && !draft.clientOrganizationId) {
    problems.scope = 'Choose the client this policy is for.';
  }
  if (draft.scope === 'project' && !draft.projectId) {
    problems.scope = 'Choose the project this policy is for.';
  }
  if (draft.businessDays.length === 0) {
    problems.days = 'Pick at least one business day.';
  }
  if (!CLOCK.test(draft.businessHoursStart)) {
    problems.start = 'HH:MM, e.g. 09:00';
  }
  if (!CLOCK.test(draft.businessHoursEnd)) {
    problems.end = 'HH:MM, e.g. 18:00';
  }
  if (!draft.timezone.trim()) {
    problems.timezone = 'An IANA name, e.g. Asia/Kolkata';
  }
  const warning = Number(draft.warningPercent);
  if (!Number.isInteger(warning) || warning < 1 || warning > 99) {
    problems.warning = 'A whole number from 1 to 99.';
  }
  const rules: Partial<Record<Priority, string>> = {};
  for (const priority of PRIORITIES) {
    const rule = draft.rules[priority];
    if (!(toMinutes(rule.firstResponseHours) >= 1) || !(toMinutes(rule.resolutionHours) >= 1)) {
      rules[priority] = 'Both targets need a number of hours above zero.';
    }
  }
  if (Object.keys(rules).length > 0) {
    problems.rules = rules;
  }
  return problems;
}

export function hasProblems(problems: SlaProblems): boolean {
  return Object.keys(problems).length > 0;
}

export function toInput(draft: SlaDraft): SlaPolicyInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    isDefault: draft.scope === 'default',
    clientOrganizationId: draft.scope === 'client' ? draft.clientOrganizationId : null,
    projectId: draft.scope === 'project' ? draft.projectId : null,
    timezone: draft.timezone.trim(),
    businessHoursStart: draft.businessHoursStart,
    businessHoursEnd: draft.businessHoursEnd,
    businessDays: [...draft.businessDays].sort((a, b) => a - b),
    pauseStatuses: draft.pauseStatuses,
    warningPercent: Number(draft.warningPercent),
    rules: PRIORITIES.map((priority) => ({
      priority,
      firstResponseMinutes: toMinutes(draft.rules[priority].firstResponseHours),
      resolutionMinutes: toMinutes(draft.rules[priority].resolutionHours),
    })),
  };
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/** "4h", "1.5h" — the web's card shorthand. */
export function hoursLabel(minutes: number): string {
  return Number.isInteger(minutes / 60) ? `${minutes / 60}h` : `${(minutes / 60).toFixed(1)}h`;
}

export function businessHoursLabel(policy: SlaPolicySummary): string {
  const days = policy.businessDays.map((day) => DAY_LABELS[day - 1]).join(', ');
  return `${policy.businessHoursStart}–${policy.businessHoursEnd} ${policy.timezone} · ${days}`;
}

export function pausesLabel(policy: SlaPolicySummary): string {
  return policy.pauseStatuses.length > 0
    ? policy.pauseStatuses.map((status) => TICKET_STATUS_LABELS[status]).join(', ')
    : 'Never';
}

export function ruleLabel(rule: SlaPolicySummary['rules'][number]): string {
  return `${PRIORITY_LABELS[rule.priority]}: respond in ${hoursLabel(
    rule.firstResponseMinutes,
  )} · resolve in ${hoursLabel(rule.resolutionMinutes)}`;
}

export function scopeName(policy: SlaPolicySummary): string {
  if (policy.project) {
    return `Project · ${policy.project.code}`;
  }
  if (policy.clientOrganization) {
    return `Client · ${policy.clientOrganization.name}`;
  }
  return 'Default';
}

/** What saving did to the open tickets, in words — the API reports it only on a write. */
export function reapplyMessage(saved: SlaPolicySummary): string {
  const result = saved.reapply;
  if (!result) {
    return `“${saved.name}” saved.`;
  }
  const tickets = result.changed === 1 ? '1 open ticket' : `${result.changed} open tickets`;
  return result.truncated
    ? `“${saved.name}” saved. ${tickets} re-timed, but the sweep stopped at its limit — some open tickets still carry their previous targets.`
    : `“${saved.name}” saved. ${tickets} re-timed.`;
}
