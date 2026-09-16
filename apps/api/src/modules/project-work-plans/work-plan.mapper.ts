import { Injectable } from '@nestjs/common';
import {
  isWorkPlanOverdue,
  nestWorkPlanNotes,
  remainingSeconds,
  shouldRestrictWorkPlanToAssignee,
  workPlanPhasesVisibleToDeveloper,
  workPlanPointActions,
  PRIORITY,
  effectiveWorkPlanPriority,
  type AuthenticatedUser,
  type Priority,
  type ProjectWorkPlan,
  type UserRef,
  type WorkPlanNote,
  type WorkPlanNoteKind,
  type WorkPlanPhase,
  type WorkPlanPoint,
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
      this.phase(phase, actor, flags, now, row.assignedTo, planPriority),
    );
    const restricted = shouldRestrictWorkPlanToAssignee(flags);
    return {
      projectId,
      source: row.source as WorkPlanSource,
      sourceFile: row.sourceFile,
      assignedTo: restricted && row.assignedTo?.id !== actor.userId ? null : row.assignedTo,
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
  ): WorkPlanPhase {
    const phaseAssignee = phase.assignedTo ?? planAssignee;
    const phasePriority = (phase.priority as Priority | null) ?? null;
    const effectivePhasePriority = effectiveWorkPlanPriority(null, phasePriority, planPriority);
    return {
      id: phase.id,
      heading: phase.heading,
      sortOrder: phase.sortOrder,
      assignedTo: phase.assignedTo,
      priority: phasePriority,
      effectivePriority: effectivePhasePriority,
      titles: phase.titles.map((title) => {
        const titlePriority = (title.priority as Priority | null) ?? null;
        return {
          id: title.id,
          title: title.title,
          sortOrder: title.sortOrder,
          assignedTo: title.assignedTo,
          effectiveAssignedTo: title.assignedTo ?? phaseAssignee,
          priority: titlePriority,
          effectivePriority: effectiveWorkPlanPriority(titlePriority, phasePriority, planPriority),
          points: title.points.map((point) =>
            this.point(point, actor, flags, now, title.assignedTo ?? phaseAssignee),
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
    });
    return {
      id: point.id,
      body: point.body,
      estimateMinutes: point.estimateMinutes,
      sortOrder: point.sortOrder,
      status,
      startedAt: point.startedAt?.toISOString() ?? null,
      dueAt: point.dueAt?.toISOString() ?? null,
      completedAt: point.completedAt?.toISOString() ?? null,
      remainingSeconds: remainingSeconds(point.dueAt, now, point.completedAt),
      overdue: isWorkPlanOverdue(point.dueAt, now, point.completedAt),
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
