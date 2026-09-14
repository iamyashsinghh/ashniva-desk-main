import { Injectable } from '@nestjs/common';
import {
  isWorkPlanOverdue,
  remainingSeconds,
  type AuthenticatedUser,
  type ProjectWorkPlan,
  type WorkPlanPhase,
  type WorkPlanPoint,
  type WorkPlanScore,
  type WorkPlanSource,
} from '@ashniva/types';

import type { Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const workPlanInclude = {
  sourceFile: { select: { id: true, name: true, contentType: true, sizeBytes: true } },
  scores: { include: { user: userRef }, orderBy: { percent: 'asc' } },
  phases: {
    orderBy: { sortOrder: 'asc' },
    include: {
      titles: {
        orderBy: { sortOrder: 'asc' },
        include: {
          points: {
            orderBy: { sortOrder: 'asc' },
            include: { startedBy: userRef },
          },
        },
      },
    },
  },
} satisfies Prisma.ProjectWorkPlanInclude;

export type WorkPlanRow = Prisma.ProjectWorkPlanGetPayload<{ include: typeof workPlanInclude }>;

@Injectable()
export class WorkPlanMapper {
  toDetail(
    row: WorkPlanRow | null,
    actor: AuthenticatedUser,
    flags: { canManage: boolean; canWork: boolean },
    projectId: string,
    now: Date,
  ): ProjectWorkPlan {
    if (!row) {
      return {
        projectId,
        source: null,
        sourceFile: null,
        phases: [],
        scores: [],
        canManage: flags.canManage,
        canWork: flags.canWork,
      };
    }
    return {
      projectId,
      source: row.source as WorkPlanSource,
      sourceFile: row.sourceFile,
      phases: row.phases.map((phase) => this.phase(phase, actor, flags, now)),
      scores: row.scores.map((score) => this.score(score)),
      canManage: flags.canManage,
      canWork: flags.canWork,
    };
  }

  private phase(
    phase: WorkPlanRow['phases'][number],
    actor: AuthenticatedUser,
    flags: { canManage: boolean; canWork: boolean },
    now: Date,
  ): WorkPlanPhase {
    return {
      id: phase.id,
      heading: phase.heading,
      sortOrder: phase.sortOrder,
      titles: phase.titles.map((title) => ({
        id: title.id,
        title: title.title,
        sortOrder: title.sortOrder,
        points: title.points.map((point) => this.point(point, actor, flags, now)),
      })),
    };
  }

  private point(
    point: WorkPlanRow['phases'][number]['titles'][number]['points'][number],
    actor: AuthenticatedUser,
    flags: { canManage: boolean; canWork: boolean },
    now: Date,
  ): WorkPlanPoint {
    const started = point.startedAt !== null;
    const done = point.completedAt !== null;
    const reveal = flags.canManage || started;
    return {
      id: point.id,
      body: reveal ? point.body : null,
      estimateMinutes: point.estimateMinutes,
      sortOrder: point.sortOrder,
      startedAt: point.startedAt?.toISOString() ?? null,
      dueAt: point.dueAt?.toISOString() ?? null,
      completedAt: point.completedAt?.toISOString() ?? null,
      remainingSeconds: remainingSeconds(point.dueAt, now, point.completedAt),
      overdue: isWorkPlanOverdue(point.dueAt, now, point.completedAt),
      startedBy: point.startedBy,
      canStart: flags.canWork && !started && !done,
      canComplete:
        flags.canWork &&
        started &&
        !done &&
        (flags.canManage || point.startedById === actor.userId),
    };
  }

  private score(score: WorkPlanRow['scores'][number]): WorkPlanScore {
    return { user: score.user, percent: score.percent };
  }
}
