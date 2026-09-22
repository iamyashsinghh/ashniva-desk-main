import { Injectable } from '@nestjs/common';
import {
  isWorkPlanOverdue,
  nestWorkPlanNotes,
  remainingSeconds,
  extraSeconds,
  isWorkPlanTimerFrozen,
  shouldRestrictWorkPlanToAssignee,
  workPlanPhasesVisibleToDeveloper,
  workPlanPointActions,
  PRIORITY,
  WORK_PLAN_POINT_STATUS,
  effectiveWorkPlanPriority,
  effectiveWorkPlanAssignedAt,
  type AuthenticatedUser,
  type Priority,
  type ProjectWorkPlan,
  type UserRef,
  type WorkPlanEventKind,
  type WorkPlanNote,
  type WorkPlanNoteKind,
  type WorkPlanPhase,
  type WorkPlanPoint,
  type WorkPlanPointEvent,
  type WorkPlanPointStatus,
  type WorkPlanScore,
  type WorkPlanSource,
} from '@ashniva/types';

import type { Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const workPlanInclude = {
  assignedTo: userRef,
  sourceFile: { select: { id: true, name: true, contentType: true, sizeBytes: true } },
  scores: { include: { user: userRef }, orderBy: { percent: 'asc' } },
  phases: {
    orderBy: { sortOrder: 'asc' },
    include: {
      assignedTo: userRef,
      titles: {
        orderBy: { sortOrder: 'asc' },
        include: {
          assignedTo: userRef,
          points: {
            orderBy: { sortOrder: 'asc' },
            include: {
              startedBy: userRef,
              notes: { include: { author: userRef }, orderBy: { createdAt: 'asc' } },
              events: { include: { actor: userRef }, orderBy: { createdAt: 'asc' } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectWorkPlanInclude;

export type WorkPlanRow = Prisma.ProjectWorkPlanGetPayload<{ include: typeof workPlanInclude }>;

export interface WorkPlanActorFlags {
  canManage: boolean;
  canWork: boolean;
  canTest: boolean;
  canLead: boolean;
  canAssign: boolean;
}

@Injectable()
export class WorkPlanMapper {
  toDetail(
    row: WorkPlanRow | null,
    actor: AuthenticatedUser,
    flags: WorkPlanActorFlags,
    projectId: string,
    now: Date,
    developers: UserRef[],
  ): ProjectWorkPlan {
    if (!row) {
      return {
        projectId,
        source: null,
        sourceFile: null,
        assignedTo: null,
        assignedAt: null,
        priority: PRIORITY.MEDIUM,
        developers,
        phases: [],
        scores: [],
        canManage: flags.canManage,
        canWork: flags.canWork,
        canAssign: flags.canAssign,
      };
    }
    const planPriority = (row.priority as Priority | null) ?? PRIORITY.MEDIUM;
    const phases = row.phases.map((phase) =>
      this.phase(phase, actor, flags, now, row.assignedTo, planPriority, {
        assignedToId: row.assignedToId,
        assignedAt: row.assignedAt,
      }),
    );
    const restricted = shouldRestrictWorkPlanToAssignee(flags);
    return {
      projectId,
      source: row.source as WorkPlanSource,
      sourceFile: row.sourceFile,
      assignedTo: restricted && row.assignedTo?.id !== actor.userId ? null : row.assignedTo,
      assignedAt: flags.canAssign ? (row.assignedAt?.toISOString() ?? null) : null,
      priority: planPriority,
      developers: restricted ? [] : developers,
      phases: restricted ? workPlanPhasesVisibleToDeveloper(phases, actor.userId) : phases,
      scores: restricted ? [] : row.scores.map((score) => this.score(score)),
      canManage: flags.canManage,
      canWork: flags.canWork,
      canAssign: flags.canAssign,
    };
  }

  private phase(
    phase: WorkPlanRow['phases'][number],
    actor: AuthenticatedUser,
    flags: WorkPlanActorFlags,
    now: Date,
    planAssignee: UserRef | null,
    planPriority: Priority,
    planStamp: { assignedToId: string | null; assignedAt: Date | null },
  ): WorkPlanPhase {
    const phaseAssignee = phase.assignedTo ?? planAssignee;
    const phasePriority = (phase.priority as Priority | null) ?? null;
    const effectivePhasePriority = effectiveWorkPlanPriority(null, phasePriority, planPriority);
    return {
      id: phase.id,
      heading: phase.heading,
      sortOrder: phase.sortOrder,
      assignedTo: phase.assignedTo,
      assignedAt: flags.canAssign ? (phase.assignedAt?.toISOString() ?? null) : null,
      priority: phasePriority,
      effectivePriority: effectivePhasePriority,
      titles: phase.titles.map((title) => {
        const titlePriority = (title.priority as Priority | null) ?? null;
        const openErrorParents = new Set(
          title.points
            .filter(
              (point) =>
                point.isError &&
                point.parentPointId &&
                (point.status as WorkPlanPointStatus) === WORK_PLAN_POINT_STATUS.PENDING,
            )
            .map((point) => point.parentPointId as string),
        );
        const assignedAt = flags.canAssign
          ? iso(
              effectiveWorkPlanAssignedAt(
                { assignedToId: title.assignedToId, assignedAt: title.assignedAt },
                { assignedToId: phase.assignedToId, assignedAt: phase.assignedAt },
                planStamp,
              ),
            )
          : null;
        return {
          id: title.id,
          title: title.title,
          sortOrder: title.sortOrder,
          assignedTo: title.assignedTo,
          effectiveAssignedTo: title.assignedTo ?? phaseAssignee,
          assignedAt: flags.canAssign ? (title.assignedAt?.toISOString() ?? null) : null,
          priority: titlePriority,
          effectivePriority: effectiveWorkPlanPriority(titlePriority, phasePriority, planPriority),
          points: title.points.map((point) =>
            this.point(point, actor, flags, now, title.assignedTo ?? phaseAssignee, {
              assignedAt,
              hasOpenErrorChild: openErrorParents.has(point.id),
            }),
          ),
        };
      }),
    };
  }

  private point(
    point: WorkPlanRow['phases'][number]['titles'][number]['points'][number],
    actor: AuthenticatedUser,
    flags: WorkPlanActorFlags,
    now: Date,
    assignee: UserRef | null,
    extras: { assignedAt: string | null; hasOpenErrorChild: boolean },
  ): WorkPlanPoint {
    const status = point.status as WorkPlanPointStatus;
    const actions = workPlanPointActions({
      status,
      startedById: point.startedById,
      actorId: actor.userId,
      canWork: flags.canWork,
      canTest: flags.canTest,
      canLead: flags.canLead,
      assignedToId: assignee?.id ?? null,
      isError: point.isError,
      hasOpenErrorChild: extras.hasOpenErrorChild,
    });
    return {
      id: point.id,
      body: point.body,
      estimateMinutes: point.estimateMinutes,
      sortOrder: point.sortOrder,
      status,
      isError: point.isError,
      parentPointId: point.parentPointId,
      startedAt: point.startedAt?.toISOString() ?? null,
      assignedAt: extras.assignedAt,
      dueAt: point.dueAt?.toISOString() ?? null,
      completedAt: point.completedAt?.toISOString() ?? null,
      remainingSeconds: remainingSeconds(
        point.dueAt,
        now,
        point.completedAt,
        point.pausedRemainingSeconds,
      ),
      overdue: isWorkPlanOverdue(point.dueAt, now, point.completedAt, point.pausedRemainingSeconds),
      pausedRemainingSeconds: point.pausedRemainingSeconds,
      timerPaused: isWorkPlanTimerFrozen(status, point.pausedRemainingSeconds, point.completedAt),
      extraSeconds: flags.canAssign
        ? extraSeconds(
            point.overrunSeconds,
            point.dueAt,
            now,
            point.completedAt,
            isWorkPlanTimerFrozen(status, point.pausedRemainingSeconds, point.completedAt)
              ? (point.pausedRemainingSeconds ?? 0)
              : null,
            point.submittedAt,
          )
        : 0,
      overrunSeconds: flags.canAssign ? point.overrunSeconds : 0,
      events: flags.canAssign ? point.events.map((event) => this.event(event)) : [],
      startedBy: point.startedBy,
      notes: nestWorkPlanNotes(
        point.notes.map((note) => ({ ...this.note(note), parentId: note.parentId })),
      ).map(({ parentId: _parentId, replies, ...note }) => ({
        ...note,
        replies: replies.map(({ parentId: _replyParent, ...reply }) => ({ ...reply, replies: [] })),
      })),
      ...actions,
    };
  }

  private event(
    event: WorkPlanRow['phases'][number]['titles'][number]['points'][number]['events'][number],
  ): WorkPlanPointEvent {
    return {
      id: event.id,
      kind: event.kind as WorkPlanEventKind,
      body: event.body,
      elapsedSeconds: event.elapsedSeconds,
      sinceSubmitSeconds: event.sinceSubmitSeconds,
      extraSeconds: event.extraSeconds,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor,
    };
  }

  private note(
    note: WorkPlanRow['phases'][number]['titles'][number]['points'][number]['notes'][number],
  ): Omit<WorkPlanNote, 'replies'> {
    return {
      id: note.id,
      kind: note.kind as WorkPlanNoteKind,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      author: note.author,
    };
  }

  private score(score: WorkPlanRow['scores'][number]): WorkPlanScore {
    return { user: score.user, percent: score.percent };
  }
}

function iso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
