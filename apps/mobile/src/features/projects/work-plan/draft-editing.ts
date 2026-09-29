import {
  WORK_PLAN_DEFAULT_ESTIMATE_MINUTES,
  type WorkPlanPhase,
  type WorkPlanPhaseInput,
  type WorkPlanPointInput,
  type WorkPlanTitleInput,
} from '@ashniva/types';

/**
 * The editor's draft: phases → topics → steps, edited locally and saved with one PUT.
 *
 * Existing ids are kept on save so the server updates rows rather than recreating them — a step
 * that keeps its id keeps its timer, notes and linked task.
 */

export function newPoint(): WorkPlanPointInput {
  return { body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES };
}

export function newTitle(position: number): WorkPlanTitleInput {
  return { title: `Title ${position}`, points: [newPoint()] };
}

export function newPhase(position: number): WorkPlanPhaseInput {
  return { heading: `Phase ${position}`, titles: [newTitle(1)] };
}

export function emptyDraft(): WorkPlanPhaseInput[] {
  return [newPhase(1)];
}

type PhaseSource = Pick<WorkPlanPhase, 'id' | 'heading'> & {
  titles: Array<{
    id: string;
    title: string;
    points: Array<{ id: string; body: string | null; estimateMinutes: number; isError: boolean }>;
  }>;
};

export function toDraft(phases: readonly PhaseSource[]): WorkPlanPhaseInput[] {
  if (phases.length === 0) {
    return emptyDraft();
  }
  return phases.map((phase) => ({
    id: phase.id,
    heading: phase.heading,
    titles: phase.titles.map((title) => ({
      id: title.id,
      title: title.title,
      points: title.points.map((point) => ({
        id: point.id,
        body: point.body ?? '',
        estimateMinutes: point.estimateMinutes,
        ...(point.isError ? { isError: true } : {}),
      })),
    })),
  }));
}

export function toSavePhases(draft: readonly WorkPlanPhaseInput[]): WorkPlanPhaseInput[] {
  return draft.map((phase) => ({
    ...(phase.id ? { id: phase.id } : {}),
    heading: phase.heading.trim(),
    titles: phase.titles.map((title) => ({
      ...(title.id ? { id: title.id } : {}),
      title: title.title.trim(),
      points: title.points.map((point) => ({
        ...(point.id ? { id: point.id } : {}),
        body: point.body.trim(),
        estimateMinutes: point.estimateMinutes,
        ...(point.isError ? { isError: true } : {}),
      })),
    })),
  }));
}

/** Why the draft cannot be saved yet, in words for the save button; null when it can. */
export function draftProblem(draft: readonly WorkPlanPhaseInput[]): string | null {
  if (draft.length === 0) {
    return 'Keep at least one phase on the plan.';
  }
  for (const phase of draft) {
    if (!phase.heading.trim()) {
      return 'Every phase needs a heading.';
    }
    if (phase.titles.length === 0) {
      return `“${phase.heading.trim()}” needs at least one topic.`;
    }
    for (const title of phase.titles) {
      if (!title.title.trim()) {
        return `A topic in “${phase.heading.trim()}” has no name.`;
      }
      if (title.points.length === 0) {
        return `“${title.title.trim()}” needs at least one step.`;
      }
      const bad = title.points.find(
        (point) => !point.body.trim() || (!point.isError && point.estimateMinutes < 1),
      );
      if (bad) {
        return `Every step in “${title.title.trim()}” needs text and at least one minute.`;
      }
    }
  }
  return null;
}

export function isDraftValid(draft: readonly WorkPlanPhaseInput[]): boolean {
  return draftProblem(draft) === null;
}

/** Moves one entry up (-1) or down (+1). Out of range is a no-op copy, not an error. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  const next = [...list];
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return next;
  }
  const [item] = next.splice(index, 1);
  if (item !== undefined) {
    next.splice(target, 0, item);
  }
  return next;
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

/** Minutes typed into a field: whole, at least one, and a blank or junk entry reads as one. */
export function parseMinutes(text: string): number {
  return Math.max(1, Math.floor(Number(text.replace(/[^\d]/g, ''))) || 1);
}
