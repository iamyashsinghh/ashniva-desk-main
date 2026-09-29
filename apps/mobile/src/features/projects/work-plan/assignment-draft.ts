import type { Priority, ProjectWorkPlan, SaveWorkPlanAssignmentsInput } from '@ashniva/types';

/**
 * Who does what, edited on the phone before it is saved.
 *
 * Summary edits assignments locally and saves them together, the way the web does, because the
 * save is where the "assign on my words?" question is asked — once per batch, not once per pick.
 * A null level means "same as above": the topic falls through to its phase, the phase to the plan.
 */

export interface LevelAssignment {
  assignedToId: string | null;
  priority: Priority | null;
}

export interface AssignmentDraft {
  assignedToId: string | null;
  priority: Priority;
  phases: Record<string, LevelAssignment>;
  titles: Record<string, LevelAssignment>;
}

export type AssignmentLevel = 'phases' | 'titles';

const UNSET: LevelAssignment = { assignedToId: null, priority: null };

export function assignmentDraftFrom(plan: ProjectWorkPlan): AssignmentDraft {
  return {
    assignedToId: plan.assignedTo?.id ?? null,
    priority: plan.priority,
    phases: Object.fromEntries(
      plan.phases.map((phase) => [
        phase.id,
        { assignedToId: phase.assignedTo?.id ?? null, priority: phase.priority },
      ]),
    ),
    titles: Object.fromEntries(
      plan.phases.flatMap((phase) =>
        phase.titles.map((title) => [
          title.id,
          { assignedToId: title.assignedTo?.id ?? null, priority: title.priority },
        ]),
      ),
    ),
  };
}

/** Changes on the server — someone else's save, or ours landing — replace the local draft. */
export function assignmentKey(plan: ProjectWorkPlan): string {
  return JSON.stringify(assignmentDraftFrom(plan));
}

export function levelOf(
  draft: AssignmentDraft,
  level: AssignmentLevel,
  id: string,
): LevelAssignment {
  return draft[level][id] ?? UNSET;
}

export function withLevel(
  draft: AssignmentDraft,
  level: AssignmentLevel,
  id: string,
  patch: Partial<LevelAssignment>,
): AssignmentDraft {
  return {
    ...draft,
    [level]: { ...draft[level], [id]: { ...levelOf(draft, level, id), ...patch } },
  };
}

/** How many places differ from what the server has: the whole plan, a phase or a topic each count once. */
export function assignmentChanges(base: AssignmentDraft, draft: AssignmentDraft): number {
  let changes =
    base.assignedToId !== draft.assignedToId || base.priority !== draft.priority ? 1 : 0;
  for (const level of ['phases', 'titles'] as const) {
    const ids = new Set([...Object.keys(base[level]), ...Object.keys(draft[level])]);
    for (const id of ids) {
      const before = levelOf(base, level, id);
      const after = levelOf(draft, level, id);
      if (before.assignedToId !== after.assignedToId || before.priority !== after.priority) {
        changes += 1;
      }
    }
  }
  return changes;
}

/** The full snapshot PUT /work-plan/assignments expects, one row per phase and topic on the plan. */
export function toAssignmentsInput(
  plan: ProjectWorkPlan,
  draft: AssignmentDraft,
): SaveWorkPlanAssignmentsInput {
  return {
    assignedToId: draft.assignedToId,
    priority: draft.priority,
    phases: plan.phases.map((phase) => ({ id: phase.id, ...levelOf(draft, 'phases', phase.id) })),
    titles: plan.phases.flatMap((phase) =>
      phase.titles.map((title) => ({ id: title.id, ...levelOf(draft, 'titles', title.id) })),
    ),
  };
}
