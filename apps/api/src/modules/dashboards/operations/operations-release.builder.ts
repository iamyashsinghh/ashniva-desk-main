import {
  RELEASE_STATUS,
  type OperationsRelease,
  type OperationsReleaseRow,
  type ReleaseStatus,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { OperationsFilters } from './operations-filters';

const RELEASE_LIST_SIZE = 10;

/** QA that somebody still has to do. Clarification counts: the tester is waiting on an answer. */
const QA_WAITING = ['PENDING', 'IN_PROGRESS', 'CLARIFICATION'];

/** A failed or rolled-back release holds the next one up until somebody deals with it. */
const BLOCKING_RELEASES: ReleaseStatus[] = [RELEASE_STATUS.FAILED, RELEASE_STATUS.ROLLED_BACK];
const READY_RELEASES: ReleaseStatus[] = [RELEASE_STATUS.APPROVED, RELEASE_STATUS.SCHEDULED];

/** Releases worth a manager's attention: waiting on somebody, or gone wrong. */
const LISTED_RELEASES: ReleaseStatus[] = [
  RELEASE_STATUS.APPROVAL_REQUESTED,
  ...READY_RELEASES,
  RELEASE_STATUS.PUBLISHING,
  ...BLOCKING_RELEASES,
];

/**
 * The QA and release pipeline for the projects in scope.
 *
 * Four queries: two `groupBy`s carry every count, so adding a status to either report costs
 * nothing. The QA numbers come from the testing assignments rather than from task statuses
 * because the QA module is where a pass or a fail is actually recorded, and counting the same
 * thing from two tables is how the two end up disagreeing.
 */
export async function buildOperationsRelease(
  prisma: PrismaService,
  organizationId: string,
  filters: OperationsFilters,
): Promise<OperationsRelease> {
  const projectScope = filters.organizationWide ? {} : { projectId: { in: filters.projectIds } };
  const [testing, uatPending, releaseCounts, releases] = await Promise.all([
    prisma.testingAssignment.groupBy({
      by: ['status'],
      where: {
        organizationId,
        deletedAt: null,
        kind: { in: ['QA', 'RETEST'] },
        ...projectScope,
      },
      _count: { _all: true },
    }),
    prisma.uatRequest.count({ where: uatWhere(organizationId, filters) }),
    prisma.release.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null, ...projectScope },
      _count: { _all: true },
    }),
    prisma.release.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...projectScope,
        status: { in: LISTED_RELEASES },
      },
      select: {
        id: true,
        version: true,
        title: true,
        status: true,
        scheduledFor: true,
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ scheduledFor: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: RELEASE_LIST_SIZE,
    }),
  ]);

  const qa = tally(testing);
  const byReleaseStatus = tally(releaseCounts);
  const sum = (counts: Map<string, number>, keys: readonly string[]): number =>
    keys.reduce((total, key) => total + (counts.get(key) ?? 0), 0);

  return {
    qaWaiting: sum(qa, QA_WAITING),
    qaFailed: qa.get('FAILED') ?? 0,
    qaPassed: qa.get('PASSED') ?? 0,
    uatPending,
    blockers: sum(byReleaseStatus, BLOCKING_RELEASES),
    readyToRelease: sum(byReleaseStatus, READY_RELEASES),
    releases: releases.map((row): OperationsReleaseRow => ({
      id: row.id,
      version: row.version,
      title: row.title,
      status: row.status as ReleaseStatus,
      project: row.project,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
    })),
  };
}

function tally(rows: Array<{ status: string; _count: { _all: number } }>): Map<string, number> {
  return new Map(rows.map((row) => [row.status, row._count._all]));
}

/**
 * UAT requests belong to a release or a task, never directly to a project, so a project-scoped
 * caller reaches them through whichever of the two they hang off.
 */
function uatWhere(organizationId: string, filters: OperationsFilters): Prisma.UatRequestWhereInput {
  const base: Prisma.UatRequestWhereInput = {
    organizationId,
    deletedAt: null,
    status: 'PENDING',
  };
  if (filters.organizationWide) {
    return base;
  }
  const ids = { in: filters.projectIds };
  return { ...base, OR: [{ release: { projectId: ids } }, { task: { projectId: ids } }] };
}
