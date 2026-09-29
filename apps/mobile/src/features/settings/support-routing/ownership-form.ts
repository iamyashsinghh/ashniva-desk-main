import type { SupportOwnershipSummary } from '@ashniva/types';

/**
 * The support-ownership form as plain functions.
 *
 * The chain is tried in the order of `OWNERSHIP_ROLES`: a ticket naming a module goes to its
 * owner first, and only when nobody owns it does it fall through to the primary developer, then
 * on-call, then the backup — so the module owners are the valuable part of the form.
 */

export const OWNERSHIP_ROLES = [
  { key: 'primaryDeveloperId', label: 'Primary developer', of: 'primaryDeveloper' },
  { key: 'backupDeveloperId', label: 'Backup developer', of: 'backupDeveloper' },
  { key: 'seniorId', label: 'Senior / escalation', of: 'senior' },
  { key: 'testerId', label: 'Tester', of: 'tester' },
  { key: 'supportExecutiveId', label: 'Support executive', of: 'supportExecutive' },
] as const;

export type RoleKey = (typeof OWNERSHIP_ROLES)[number]['key'];

export interface ModuleRow {
  area: string;
  userId: string | null;
}

export interface OwnershipDraft {
  roles: Record<RoleKey, string | null>;
  modules: ModuleRow[];
  ackMinutes: string;
  escalationMinutes: string;
  workloadLimit: string;
  autoRouteEnabled: boolean;
}

export interface SupportOwnershipInput {
  primaryDeveloperId: string | null;
  backupDeveloperId: string | null;
  seniorId: string | null;
  testerId: string | null;
  supportExecutiveId: string | null;
  moduleOwners: Record<string, string>;
  workloadLimit: number | null;
  ackMinutes: number;
  escalationMinutes: number;
  autoRouteEnabled: boolean;
}

export type OwnershipProblems = Partial<Record<'ack' | 'escalation' | 'limit', string>>;

export function ownershipDraft(ownership: SupportOwnershipSummary): OwnershipDraft {
  const roles = Object.fromEntries(
    OWNERSHIP_ROLES.map((role) => [role.key, ownership[role.of]?.id ?? null]),
  ) as Record<RoleKey, string | null>;
  return {
    roles,
    modules: Object.entries(ownership.moduleOwners).map(([area, userId]) => ({ area, userId })),
    ackMinutes: String(ownership.ackMinutes),
    escalationMinutes: String(ownership.escalationMinutes),
    workloadLimit: ownership.workloadLimit === null ? '' : String(ownership.workloadLimit),
    autoRouteEnabled: ownership.autoRouteEnabled,
  };
}

function isWhole(value: string, minimum: number): boolean {
  const number = Number(value);
  return value.trim() !== '' && Number.isInteger(number) && number >= minimum;
}

export function ownershipProblems(draft: OwnershipDraft): OwnershipProblems {
  const problems: OwnershipProblems = {};
  if (!isWhole(draft.ackMinutes, 1)) {
    problems.ack = 'Whole minutes, at least 1.';
  }
  if (!isWhole(draft.escalationMinutes, 1)) {
    problems.escalation = 'Whole minutes, at least 1.';
  }
  if (draft.workloadLimit.trim() !== '' && !isWhole(draft.workloadLimit, 0)) {
    problems.limit = 'A whole number, or blank for no limit.';
  }
  return problems;
}

export function ownershipInput(draft: OwnershipDraft): SupportOwnershipInput {
  return {
    primaryDeveloperId: draft.roles.primaryDeveloperId,
    backupDeveloperId: draft.roles.backupDeveloperId,
    seniorId: draft.roles.seniorId,
    testerId: draft.roles.testerId,
    supportExecutiveId: draft.roles.supportExecutiveId,
    // Rows with no area or nobody named are dropped rather than sent as empty keys.
    moduleOwners: Object.fromEntries(
      draft.modules
        .filter((row) => row.area.trim() !== '' && row.userId)
        .map((row) => [row.area.trim(), row.userId as string]),
    ),
    workloadLimit: draft.workloadLimit.trim() === '' ? null : Number(draft.workloadLimit),
    ackMinutes: Number(draft.ackMinutes),
    escalationMinutes: Number(draft.escalationMinutes),
    autoRouteEnabled: draft.autoRouteEnabled,
  };
}
