import { Injectable } from '@nestjs/common';
import {
  CLIENT_UPDATE_STATUS,
  OPEN_TASK_STATUSES,
  RELEASE_NOTE_STATUS,
  TASK_STATUS,
  type TaskStatus,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { uatRequestFields, type UatRequestRow } from '../qa/uat.repository';

/**
 * States the progress board draws. Everything still open except a draft: a task nobody has
 * committed to yet is not something to show a client, whatever its `clientVisible` flag says.
 */
const PROGRESS_STATUSES = OPEN_TASK_STATUSES.filter((status) => status !== TASK_STATUS.DRAFT);

/**
 * Work that is standing still rather than moving: held by the team, or waiting on the client.
 * These become the board's blockers instead of one of its columns.
 */
export const PORTAL_PROGRESS_STATUSES_HELD: readonly TaskStatus[] = [
  TASK_STATUS.BLOCKED,
  TASK_STATUS.CLIENT_UAT,
];

/** Bounded takes. The board is a summary, not a backlog export; the tabs already list everything. */
export const PROGRESS_LIMITS = {
  activeTasks: 60,
  completedToday: 25,
  releases: 5,
  uatRequests: 20,
  updates: 5,
} as const;

/**
 * Every task column a client response is allowed to read, and no other.
 *
 * A `select`, not the shared `taskSummaryInclude`, for the reason `uatRequestFields` is one: the
 * omission becomes a type. There is no `estimateMinutes`, no `blockedReason`, no assignee and no
 * `workLogs` on `ProgressTaskRow`, so no mapper below can reach for one and no column added to
 * `tasks` later arrives here on its own.
 */
const progressTaskFields = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  updatedAt: true,
  project: { select: { code: true } },
} satisfies Prisma.TaskSelect;

export type ProgressTaskRow = Prisma.TaskGetPayload<{ select: typeof progressTaskFields }>;

/**
 * Only what a client may read about a release.
 *
 * The columns come from `release_notes` rather than `releases`. That is not a preference: the
 * deployment row is the provider's — row-level security refuses it to a client tenant outright —
 * and it carries `failureReason`, `rollbackReason` and the internal deploy plan. The note is the
 * record of the same event written for the client, and `internalNotes` is not selected here.
 */
const releaseFields = {
  id: true,
  version: true,
  releaseDate: true,
  publishedAt: true,
  clientSummary: true,
} satisfies Prisma.ReleaseNoteSelect;

export type PortalReleaseRow = Prisma.ReleaseNoteGetPayload<{ select: typeof releaseFields }>;

/** The latest published explanation of one task, for a blocker the client can otherwise only see. */
export interface BlockerNoteRow {
  taskId: string | null;
  body: string;
}

/** Where every query on this page is pinned: the provider's tenant and the caller's own client. */
export interface ProgressScope {
  organizationId: string;
  clientOrganizationId: string;
  projectId: string;
}

/**
 * Reads behind `GET /portal/projects/:id/progress`.
 *
 * Two rules hold in every method and are the reason this file exists rather than a few more
 * queries inside `PortalService`. First, both organization columns are in the `where` — the
 * provider's `organizationId` on the row itself and the client's on the project it hangs off —
 * so a widened scope is a visible edit here and not a forgotten `.filter()` downstream. Second,
 * every read is bounded and indexed: no method fetches the whole tenant and narrows it in
 * JavaScript, which is what makes the portal's file listing the slow query it is.
 */
@Injectable()
export class PortalProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The project itself, or null when it is not this client's. Scope is the query, not a check. */
  findProject(scope: ProgressScope) {
    return this.prisma.project.findFirst({
      where: {
        id: scope.projectId,
        organizationId: scope.organizationId,
        clientOrganizationId: scope.clientOrganizationId,
        deletedAt: null,
      },
      select: { id: true, code: true, name: true },
    });
  }

  /** Open, client-visible work: one query the service partitions into the board's columns. */
  activeTasks(scope: ProgressScope): Promise<ProgressTaskRow[]> {
    return this.prisma.task.findMany({
      where: { ...this.taskScope(scope), status: { in: [...PROGRESS_STATUSES] } },
      select: progressTaskFields,
      orderBy: { updatedAt: 'desc' },
      take: PROGRESS_LIMITS.activeTasks,
    });
  }

  /** What finished on the provider's calendar day the caller is looking at. */
  completedToday(scope: ProgressScope, from: Date, to: Date): Promise<ProgressTaskRow[]> {
    return this.prisma.task.findMany({
      where: {
        ...this.taskScope(scope),
        status: TASK_STATUS.COMPLETED,
        completedAt: { gte: from, lt: to },
      },
      select: progressTaskFields,
      orderBy: { completedAt: 'desc' },
      take: PROGRESS_LIMITS.completedToday,
    });
  }

  /**
   * Releases the client has been told about: published notes only.
   *
   * A draft or an approved-but-unsent note is still the team's, and a deployment that was rolled
   * back never gets a published note — so "what went live" and "what you were told went live"
   * are the same list here, which is the honest one to show.
   */
  releases(scope: ProgressScope): Promise<PortalReleaseRow[]> {
    return this.prisma.releaseNote.findMany({
      where: {
        organizationId: scope.organizationId,
        clientOrganizationId: scope.clientOrganizationId,
        projectId: scope.projectId,
        status: RELEASE_NOTE_STATUS.PUBLISHED,
        deletedAt: null,
      },
      select: releaseFields,
      orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
      take: PROGRESS_LIMITS.releases,
    });
  }

  /**
   * Sign-offs for this project. A UAT request hangs off a release or a task rather than a
   * project, so the project is reached through whichever of the two it has. The client scope sits
   * outside that `OR`, on the request's own column, so neither branch can widen it.
   */
  uatRequests(scope: ProgressScope): Promise<UatRequestRow[]> {
    return this.prisma.uatRequest.findMany({
      where: {
        organizationId: scope.organizationId,
        clientOrganizationId: scope.clientOrganizationId,
        deletedAt: null,
        OR: [{ release: { projectId: scope.projectId } }, { task: { projectId: scope.projectId } }],
      },
      select: uatRequestFields,
      // Pending first: a sign-off nobody has answered is the one holding the release up.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: PROGRESS_LIMITS.uatRequests,
    });
  }

  /**
   * The newest published update for each of the given tasks.
   *
   * This is how a blocker gets a "why": the team's own approved words, never `blockedReason`.
   *
   * `distinct` rather than a global `take`, which is what this was. A flat cap of forty rows across
   * every blocked task meant one chatty task could fill the whole page and leave the others with
   * `note: null` — so the client saw the generic "your team is working on it" on four blockers the
   * team had actually written explanations for. One row per task is what the caller wants, and on
   * Postgres this compiles to `SELECT DISTINCT ON (task_id) … ORDER BY task_id, published_at DESC`.
   */
  blockerNotes(scope: ProgressScope, taskIds: string[]): Promise<BlockerNoteRow[]> {
    if (taskIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.clientUpdate.findMany({
      where: {
        organizationId: scope.organizationId,
        clientOrganizationId: scope.clientOrganizationId,
        projectId: scope.projectId,
        status: CLIENT_UPDATE_STATUS.PUBLISHED,
        taskId: { in: taskIds },
      },
      select: { taskId: true, body: true },
      distinct: ['taskId'],
      // `taskId` must lead the ordering for `distinct` to mean "the newest per task".
      orderBy: [{ taskId: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: taskIds.length,
    });
  }

  /** Both organization columns, on every task read: the row's own and the project's. */
  private taskScope(scope: ProgressScope): Prisma.TaskWhereInput {
    return {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      project: { clientOrganizationId: scope.clientOrganizationId },
      clientVisible: true,
      deletedAt: null,
    };
  }
}
