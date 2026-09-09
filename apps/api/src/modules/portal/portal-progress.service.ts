import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLIENT_UPDATE_STATUS,
  CLIENT_VISIBLE_STATUS,
  MILESTONE_STATUS,
  TASK_STATUS,
  toClientVisibleTaskStatus,
  type AuthenticatedUser,
  type ClientVisibleStatus,
  type PortalMilestoneSummary,
  type PortalProgressBlocker,
  type PortalProjectProgress,
  type PortalTaskSummary,
  type TaskStatus,
} from '@ashniva/types';

import { isClientUser } from '../../common/auth/access-scope';
import { ClientUpdatesRepository } from '../client-updates/client-updates.repository';
import { MilestonesService } from '../milestones/milestones.service';
import { progressPercent, toTaskCounts } from '../projects/projects.mapper';
import { ProjectsRepository } from '../projects/projects.repository';
import { toUatRequestSummary } from '../qa/uat.mapper';
import { todayUtc } from '../tasks/tasks.mapper';
import { TicketsService } from '../tickets/tickets.service';
import {
  PORTAL_PROGRESS_STATUSES_HELD,
  PROGRESS_LIMITS,
  PortalProgressRepository,
  type ProgressScope,
  type ProgressTaskRow,
} from './portal-progress.repository';
import {
  toPortalBlocker,
  toPortalRelease,
  toPortalTask,
  toPortalClientUpdate,
} from './portal.mapper';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Milestone states that are behind the project rather than ahead of it. */
const FINISHED_MILESTONES: readonly string[] = [
  MILESTONE_STATUS.COMPLETED,
  MILESTONE_STATUS.CANCELLED,
];

/**
 * "What did the Ashniva team do on my project today?", answered from records that already exist.
 *
 * Nothing here asks the team to type anything twice: the board is tasks, client-visible
 * milestones, published `ClientUpdate`s, releases that went live and UAT requests, each read
 * once and projected through the allow-list mappers in `portal.mapper.ts`.
 *
 * It is deliberately its own route rather than another section of `PortalService.home`, which
 * already issues a dozen queries before this page's work would begin.
 */
@Injectable()
export class PortalProgressService {
  constructor(
    private readonly progress: PortalProgressRepository,
    private readonly projects: ProjectsRepository,
    private readonly updates: ClientUpdatesRepository,
    private readonly milestones: MilestonesService,
    private readonly tickets: TicketsService,
  ) {}

  async forProject(actor: AuthenticatedUser, projectId: string): Promise<PortalProjectProgress> {
    if (!isClientUser(actor)) {
      throw new ForbiddenException('The portal is for client organizations');
    }
    const scope: ProgressScope = {
      organizationId: await this.tickets.providerId(actor),
      clientOrganizationId: actor.organizationId,
      projectId,
    };
    const project = await this.progress.findProject(scope);
    if (!project) {
      // The same answer for "does not exist" and "belongs to another client": an id cannot be
      // probed for existence from the portal.
      throw new NotFoundException('Project not found');
    }

    const today = todayUtc();
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const [counts, active, completedToday, releases, uatRequests, updates, milestones] =
      await Promise.all([
        this.projects.countsByProject(scope.organizationId, [project.id]),
        this.progress.activeTasks(scope),
        this.progress.completedToday(scope, today, tomorrow),
        this.progress.releases(scope),
        this.progress.uatRequests(scope),
        this.updates.list({
          organizationId: scope.organizationId,
          clientOrganizationId: scope.clientOrganizationId,
          projectId: project.id,
          status: [CLIENT_UPDATE_STATUS.PUBLISHED],
          limit: PROGRESS_LIMITS.updates,
        }),
        this.milestones.listForPortal(actor, scope.organizationId, project.id),
      ]);

    const { held, byClientStatus } = partition(active);
    const taskCounts = toTaskCounts(
      counts.get(project.id) ?? { byStatus: {}, overdue: 0, openTickets: 0 },
    );

    return {
      project,
      asOfDate: today.toISOString().slice(0, 10),
      progressPercent: progressPercent(taskCounts, counts.get(project.id)?.byStatus.CANCELLED ?? 0),
      taskCounts: {
        total: taskCounts.total,
        open: taskCounts.open,
        inProgress: taskCounts.inProgress,
        completed: taskCounts.completed,
      },
      currentMilestone: currentMilestone(milestones),
      completedToday: completedToday.map(toPortalTask),
      inProgress: byClientStatus(CLIENT_VISIBLE_STATUS.IN_DEVELOPMENT),
      underTesting: byClientStatus(CLIENT_VISIBLE_STATUS.UNDER_TESTING),
      readyToRelease: [
        ...byClientStatus(CLIENT_VISIBLE_STATUS.SCHEDULED_FOR_RELEASE),
        ...byClientStatus(CLIENT_VISIBLE_STATUS.PUBLISHED_LIVE),
      ],
      upcoming: byClientStatus(CLIENT_VISIBLE_STATUS.ASSIGNED),
      blockers: await this.blockers(scope, held),
      recentReleases: releases.map(toPortalRelease),
      uatRequests: uatRequests.map(toUatRequestSummary),
      recentUpdates: updates.map(toPortalClientUpdate),
    };
  }

  /**
   * The "why" behind a held-up task comes from the latest published update written about it —
   * intentional, approved words the team already chose to share. `blockedReason` is written for
   * the team and never leaves the API.
   */
  private async blockers(
    scope: ProgressScope,
    held: ProgressTaskRow[],
  ): Promise<PortalProgressBlocker[]> {
    if (held.length === 0) {
      return [];
    }
    const notes = await this.progress.blockerNotes(
      scope,
      held.map((row) => row.id),
    );
    const latest = new Map<string, string>();
    for (const note of notes) {
      // Newest first from the query, so the first note seen for a task is the one to keep.
      if (note.taskId && !latest.has(note.taskId)) {
        latest.set(note.taskId, note.body);
      }
    }
    return held.map((row) =>
      toPortalBlocker(row, row.status === TASK_STATUS.CLIENT_UAT, latest.get(row.id) ?? null),
    );
  }
}

/**
 * Split open work into the board's columns.
 *
 * Held work is picked out by its real status first, because `BLOCKED` deliberately reads to a
 * client as "assigned" and would otherwise sit in "upcoming" looking like progress. Everything
 * else is bucketed by the status the client is actually shown, so a column can never disagree
 * with the badge on the row inside it.
 */
function partition(rows: ProgressTaskRow[]): {
  held: ProgressTaskRow[];
  byClientStatus: (status: ClientVisibleStatus) => PortalTaskSummary[];
} {
  const held: ProgressTaskRow[] = [];
  const buckets = new Map<ClientVisibleStatus, PortalTaskSummary[]>();
  for (const row of rows) {
    if (PORTAL_PROGRESS_STATUSES_HELD.includes(row.status as TaskStatus)) {
      held.push(row);
      continue;
    }
    const key = toClientVisibleTaskStatus(row.status as TaskStatus);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(toPortalTask(row));
    } else {
      buckets.set(key, [toPortalTask(row)]);
    }
  }
  return { held, byClientStatus: (status) => buckets.get(status) ?? [] };
}

/** The milestone the project is working towards: the first shared one still ahead of it. */
function currentMilestone(milestones: PortalMilestoneSummary[]): PortalMilestoneSummary | null {
  return milestones.find((milestone) => !FINISHED_MILESTONES.includes(milestone.status)) ?? null;
}
