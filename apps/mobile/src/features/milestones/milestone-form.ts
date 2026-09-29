import type { MilestoneDetail } from '@ashniva/types';

/**
 * The milestone form, as on the web: name, owner, contract, dates, what it depends on, its
 * deliverables and who sees it.
 *
 * Deliverables that already exist carry their id, which the API keeps rather than recreating, so
 * editing a milestone does not wipe who ticked what and when.
 */

export interface DeliverableDraft {
  /** Set for one that already exists. */
  id?: string;
  title: string;
  isDone: boolean;
}

export interface MilestoneFormState {
  name: string;
  description: string;
  ownerUserId: string | null;
  contractId: string | null;
  startDate: string | null;
  dueDate: string | null;
  dependsOnIds: string[];
  deliverables: DeliverableDraft[];
  clientVisible: boolean;
  requiresApproval: boolean;
}

export const MAX_DELIVERABLES = 50;

export function initialMilestoneForm(
  milestone: MilestoneDetail | null,
  defaultContractId: string | null,
): MilestoneFormState {
  return {
    name: milestone?.name ?? '',
    description: milestone?.description ?? '',
    ownerUserId: milestone?.owner?.id ?? null,
    contractId: milestone ? (milestone.contract?.id ?? null) : defaultContractId,
    startDate: milestone?.startDate ?? null,
    dueDate: milestone?.dueDate ?? null,
    dependsOnIds: milestone?.dependsOn.map((entry) => entry.id) ?? [],
    deliverables:
      milestone?.deliverables.map((item) => ({
        id: item.id,
        title: item.title,
        isDone: item.isDone,
      })) ?? [],
    clientVisible: milestone?.clientVisible ?? true,
    requiresApproval: milestone?.requiresApproval ?? false,
  };
}

/** Why the form cannot be saved yet, or null. */
export function milestoneFormProblem(form: MilestoneFormState): string | null {
  if (form.name.trim().length < 2) {
    return 'The name needs at least 2 characters.';
  }
  if (form.deliverables.some((item) => item.title.trim().length === 0)) {
    return 'Every deliverable needs a title, or remove the empty one.';
  }
  if (form.startDate && form.dueDate && form.dueDate < form.startDate) {
    return 'The due date cannot be before the start date.';
  }
  return null;
}

export function milestonePayload(form: MilestoneFormState): Record<string, unknown> {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    contractId: form.contractId,
    ownerUserId: form.ownerUserId,
    startDate: form.startDate,
    dueDate: form.dueDate,
    clientVisible: form.clientVisible,
    requiresApproval: form.requiresApproval,
    deliverables: form.deliverables.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      title: item.title.trim(),
      isDone: item.isDone,
    })),
    dependsOnIds: form.dependsOnIds,
  };
}

/** The create DTO does not take nulls for its optional fields, so they are left out. */
export function createMilestonePayload(
  form: MilestoneFormState,
  projectId: string,
): Record<string, unknown> {
  const body = Object.entries(milestonePayload(form)).filter(([, value]) => value !== null);
  return { projectId, ...Object.fromEntries(body) };
}
