import { WORK_PLAN_DEFAULT_ESTIMATE_MINUTES, type WorkPlanPhaseInput } from '@ashniva/types';

export type WorkPlanDragItem =
  | { kind: 'phase'; phaseId: string }
  | { kind: 'title'; phaseId: string; titleId: string }
  | { kind: 'point'; phaseId: string; titleId: string; pointId: string };

export type WorkPlanDropTarget = WorkPlanDragItem & { at: 'before' | 'after' | 'inside' };

export type AddedWorkPlacement = {
  phaseIds: string[];
  titleIds: string[];
  pointIds: string[];
  firstId: string | null;
  lines: string[];
};

type PhaseRow = {
  id: string;
  heading: string;
  titles: Array<{ id: string; title: string; points: Array<{ id: string }> }>;
};

const EMPTY_PLAN = 'Keep at least one phase, topic and step on the plan.';

export function emptyDraft(): WorkPlanPhaseInput[] {
  return [
    {
      heading: 'Phase 1',
      titles: [
        {
          title: 'Title 1',
          points: [{ body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES }],
        },
      ],
    },
  ];
}

export function isDraftValid(draft: WorkPlanPhaseInput[]): boolean {
  return (
    draft.length > 0 &&
    draft.every(
      (phase) =>
        phase.heading.trim().length > 0 &&
        phase.titles.length > 0 &&
        phase.titles.every(
          (title) =>
            title.title.trim().length > 0 &&
            title.points.length > 0 &&
            title.points.every(
              (point) =>
                point.body.trim().length > 0 && (point.isError || point.estimateMinutes >= 1),
            ),
        ),
    )
  );
}

export function toDraft(
  phases: Array<{
    id: string;
    heading: string;
    titles: Array<{
      id: string;
      title: string;
      points: Array<{
        id: string;
        body: string | null;
        estimateMinutes: number;
        isError?: boolean;
      }>;
    }>;
  }>,
): WorkPlanPhaseInput[] {
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
        isError: point.isError,
      })),
    })),
  }));
}

/** Payload for PUT /work-plan — keeps existing ids so save is additive, not a wipe. */
export function toSavePhases(draft: WorkPlanPhaseInput[]): WorkPlanPhaseInput[] {
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

export function describeAddedWork(before: PhaseRow[], after: PhaseRow[]): AddedWorkPlacement {
  const previousPhases = new Set(before.map((phase) => phase.id));
  const previousTitles = new Set(before.flatMap((phase) => phase.titles.map((title) => title.id)));
  const previousPoints = new Set(
    before.flatMap((phase) =>
      phase.titles.flatMap((title) => title.points.map((point) => point.id)),
    ),
  );
  const phaseIds = after.filter((phase) => !previousPhases.has(phase.id)).map((phase) => phase.id);
  const titleIds = after.flatMap((phase) =>
    phase.titles.filter((title) => !previousTitles.has(title.id)).map((title) => title.id),
  );
  const pointIds = after.flatMap((phase) =>
    phase.titles.flatMap((title) =>
      title.points.filter((point) => !previousPoints.has(point.id)).map((point) => point.id),
    ),
  );
  const lines: string[] = [];
  for (const phase of after) {
    const newTitles = phase.titles.filter((title) => !previousTitles.has(title.id));
    if (!previousPhases.has(phase.id)) {
      lines.push(
        newTitles.length > 0
          ? `New phase ${phase.heading}: ${newTitles.map((title) => title.title).join(', ')}`
          : `New phase ${phase.heading}`,
      );
      continue;
    }
    if (newTitles.length > 0) {
      lines.push(`Added to ${phase.heading}: ${newTitles.map((title) => title.title).join(', ')}`);
    }
    for (const title of phase.titles) {
      if (!previousTitles.has(title.id)) {
        continue;
      }
      const extra = title.points.filter((point) => !previousPoints.has(point.id)).length;
      if (extra > 0) {
        lines.push(`Added to ${phase.heading} · ${title.title}`);
      }
    }
  }
  return {
    phaseIds,
    titleIds,
    pointIds,
    firstId: phaseIds[0] ?? titleIds[0] ?? pointIds[0] ?? null,
    lines,
  };
}

/**
 * Moves a phase, topic or step. Empty topics/phases left behind are dropped so a last step can
 * leave its old topic. Refuses a move that would wipe the plan.
 */
export function moveWorkPlanDraft(
  phases: WorkPlanPhaseInput[],
  from: WorkPlanDragItem,
  to: WorkPlanDropTarget,
): { ok: true; phases: WorkPlanPhaseInput[] } | { ok: false; reason: string } {
  if (!canAcceptDrop(from, to)) {
    return { ok: false, reason: dropReason(from, to) };
  }
  const next = cloneDraft(phases);
  if (from.kind === 'phase') {
    return movePhase(next, from.phaseId, to);
  }
  if (from.kind === 'title') {
    return moveTitle(next, from, to);
  }
  return movePoint(next, from, to);
}

export function canAcceptDrop(from: WorkPlanDragItem, to: WorkPlanDropTarget): boolean {
  if (from.kind === 'phase') {
    return to.kind === 'phase' && to.at !== 'inside' && from.phaseId !== to.phaseId;
  }
  if (from.kind === 'title') {
    if (to.kind === 'phase') {
      return to.at === 'inside' && from.phaseId !== to.phaseId;
    }
    return to.kind === 'title' && from.titleId !== to.titleId;
  }
  if (to.kind === 'title') {
    return to.at === 'inside' && from.titleId !== to.titleId;
  }
  return to.kind === 'point' && from.pointId !== to.pointId;
}

function dropReason(from: WorkPlanDragItem, to: WorkPlanDropTarget): string {
  if (from.kind === 'phase') {
    return 'Drop a phase above or below another phase.';
  }
  if (from.kind === 'title') {
    return 'Drop a topic onto a phase, or above or below another topic.';
  }
  if (to.kind === 'phase') {
    return 'Drop a step onto a topic, or above or below another step.';
  }
  return 'That drop does not change the plan.';
}

function movePhase(
  phases: WorkPlanPhaseInput[],
  phaseId: string,
  to: WorkPlanDropTarget,
): { ok: true; phases: WorkPlanPhaseInput[] } | { ok: false; reason: string } {
  if (to.kind !== 'phase' || to.at === 'inside') {
    return { ok: false, reason: dropReason({ kind: 'phase', phaseId }, to) };
  }
  const fromIndex = phases.findIndex((phase) => phase.id === phaseId);
  const toIndex = phases.findIndex((phase) => phase.id === to.phaseId);
  if (fromIndex < 0 || toIndex < 0) {
    return { ok: false, reason: 'That phase is no longer on the plan.' };
  }
  const [phase] = phases.splice(fromIndex, 1);
  if (!phase) {
    return { ok: false, reason: 'That phase is no longer on the plan.' };
  }
  let insertAt = to.at === 'before' ? toIndex : toIndex + 1;
  if (fromIndex < insertAt) {
    insertAt -= 1;
  }
  phases.splice(insertAt, 0, phase);
  return finish(phases);
}

function moveTitle(
  phases: WorkPlanPhaseInput[],
  from: Extract<WorkPlanDragItem, { kind: 'title' }>,
  to: WorkPlanDropTarget,
): { ok: true; phases: WorkPlanPhaseInput[] } | { ok: false; reason: string } {
  const source = takeTitle(phases, from.phaseId, from.titleId);
  if (!source) {
    return { ok: false, reason: 'That topic is no longer on the plan.' };
  }
  if (to.kind === 'phase' && to.at === 'inside') {
    const dest = phases.find((phase) => phase.id === to.phaseId);
    if (!dest) {
      return { ok: false, reason: 'That phase is no longer on the plan.' };
    }
    dest.titles.push(source.title);
    return finish(phases);
  }
  if (to.kind !== 'title') {
    return { ok: false, reason: dropReason(from, to) };
  }
  const dest = phases.find((phase) => phase.id === to.phaseId);
  if (!dest) {
    return { ok: false, reason: 'That phase is no longer on the plan.' };
  }
  const destIndex = dest.titles.findIndex((title) => title.id === to.titleId);
  if (destIndex < 0) {
    return { ok: false, reason: 'That topic is no longer on the plan.' };
  }
  dest.titles.splice(to.at === 'before' ? destIndex : destIndex + 1, 0, source.title);
  return finish(phases);
}

function movePoint(
  phases: WorkPlanPhaseInput[],
  from: Extract<WorkPlanDragItem, { kind: 'point' }>,
  to: WorkPlanDropTarget,
): { ok: true; phases: WorkPlanPhaseInput[] } | { ok: false; reason: string } {
  const source = takePoint(phases, from.phaseId, from.titleId, from.pointId);
  if (!source) {
    return { ok: false, reason: 'That step is no longer on the plan.' };
  }
  if (to.kind === 'title' && to.at === 'inside') {
    const dest = findTitle(phases, to.phaseId, to.titleId);
    if (!dest) {
      return { ok: false, reason: 'That topic is no longer on the plan.' };
    }
    dest.points.push(source.point);
    return finish(phases);
  }
  if (to.kind !== 'point') {
    return { ok: false, reason: dropReason(from, to) };
  }
  const dest = findTitle(phases, to.phaseId, to.titleId);
  if (!dest) {
    return { ok: false, reason: 'That topic is no longer on the plan.' };
  }
  const destIndex = dest.points.findIndex((point) => point.id === to.pointId);
  if (destIndex < 0) {
    return { ok: false, reason: 'That step is no longer on the plan.' };
  }
  dest.points.splice(to.at === 'before' ? destIndex : destIndex + 1, 0, source.point);
  return finish(phases);
}

function finish(
  phases: WorkPlanPhaseInput[],
): { ok: true; phases: WorkPlanPhaseInput[] } | { ok: false; reason: string } {
  const pruned = phases
    .map((phase) => ({
      ...phase,
      titles: phase.titles.filter((title) => title.points.length > 0),
    }))
    .filter((phase) => phase.titles.length > 0);
  if (pruned.length === 0 || !isDraftValid(pruned)) {
    return { ok: false, reason: EMPTY_PLAN };
  }
  return { ok: true, phases: pruned };
}

function takeTitle(
  phases: WorkPlanPhaseInput[],
  phaseId: string,
  titleId: string,
): { title: WorkPlanPhaseInput['titles'][number] } | undefined {
  const phase = phases.find((row) => row.id === phaseId);
  if (!phase) {
    return undefined;
  }
  const index = phase.titles.findIndex((title) => title.id === titleId);
  if (index < 0) {
    return undefined;
  }
  const [title] = phase.titles.splice(index, 1);
  return title ? { title } : undefined;
}

function takePoint(
  phases: WorkPlanPhaseInput[],
  phaseId: string,
  titleId: string,
  pointId: string,
): { point: WorkPlanPhaseInput['titles'][number]['points'][number] } | undefined {
  const title = findTitle(phases, phaseId, titleId);
  if (!title) {
    return undefined;
  }
  const index = title.points.findIndex((point) => point.id === pointId);
  if (index < 0) {
    return undefined;
  }
  const [point] = title.points.splice(index, 1);
  return point ? { point } : undefined;
}

function findTitle(phases: WorkPlanPhaseInput[], phaseId: string, titleId: string) {
  return phases.find((phase) => phase.id === phaseId)?.titles.find((title) => title.id === titleId);
}

function cloneDraft(phases: WorkPlanPhaseInput[]): WorkPlanPhaseInput[] {
  return phases.map((phase) => ({
    ...phase,
    titles: phase.titles.map((title) => ({
      ...title,
      points: title.points.map((point) => ({ ...point })),
    })),
  }));
}
