import {
  PROJECT_PLAN_ITEM_KIND,
  TICKET_STATUS,
  toClientVisibleTaskStatus,
  toClientVisibleTicketStatus,
  type MilestoneStatus,
  type PortalProjectPlan,
  type PortalProjectPlanItem,
  type ProjectPlan,
  type ProjectPlanItem,
  type Priority,
  type PortalClientUpdate,
  type PortalProgressBlocker,
  type PortalProgressRelease,
  type PortalProjectSummary,
  type PortalTaskSummary,
  type PortalTicketDetail,
  type PortalTicketSummary,
  type ProjectStatus,
  type TaskStatus,
  type TicketDetail,
  type TicketStatus,
  type TicketSummary,
  type TicketType,
} from '@ashniva/types';

import type { ProjectCounts, ProjectRow } from '../projects/projects.repository';
import { progressPercent, toTaskCounts } from '../projects/projects.mapper';
import type { ClientUpdateRow } from '../client-updates/client-updates.repository';
import type { PortalReleaseRow } from './portal-progress.repository';

/**
 * Allow-list mappers for the client portal. Each function names every field it exposes; nothing
 * internal (assignees, estimates, internal notes, failure states, other clients) can leak
 * because nothing is spread from the internal shapes.
 */
export function toPortalProject(
  row: ProjectRow,
  counts: ProjectCounts | undefined,
  lastUpdateAt: Date | null,
): PortalProjectSummary {
  const taskCounts = toTaskCounts(counts ?? { byStatus: {}, overdue: 0, openTickets: 0 });
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status as ProjectStatus,
    progressPercent: progressPercent(taskCounts, counts?.byStatus.CANCELLED ?? 0),
    taskCounts: {
      total: taskCounts.total,
      open: taskCounts.open,
      inProgress: taskCounts.inProgress,
      completed: taskCounts.completed,
    },
    openTicketCount: counts?.openTickets ?? 0,
    manager: row.manager,
    startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
    targetDate: row.targetDate?.toISOString().slice(0, 10) ?? null,
    lastUpdateAt: lastUpdateAt?.toISOString() ?? null,
  };
}

/**
 * The plan, narrowed for the client.
 *
 * Three things are dropped rather than filtered later. Milestones the team has not marked
 * client-visible — the same rule `toPortalMilestone` follows. The ungrouped bucket, which is the
 * work no milestone claims and so is not part of what was agreed. And, on every item that does
 * survive, the owner, the visibility flag, the progress mode, the dependency graph and the
 * overdue count: a client is told where the work stands, not who is late with it.
 */
function toPortalPlanItem(item: ProjectPlanItem): PortalProjectPlanItem {
  return {
    id: item.id,
    name: item.name,
    status: item.status as MilestoneStatus,
    startDate: item.startDate,
    endDate: item.endDate,
    progressPercent: item.progressPercent,
    tasks: { total: item.tasks.total, completed: item.tasks.completed },
    deliverables: {
      total: item.deliverables.total,
      completed: item.deliverables.completed,
    },
  };
}

export function toPortalProjectPlan(plan: ProjectPlan): PortalProjectPlan {
  const items = plan.items
    .filter((item) => item.kind === PROJECT_PLAN_ITEM_KIND.MILESTONE && item.clientVisible)
    .map(toPortalPlanItem);
  return {
    project: plan.project,
    window: {
      // Recomputed from the milestones the client can see, and from nothing else: the internal
      // window is stretched by internal milestones and by unscheduled work, so passing it on
      // would let a client read the dates of milestones they were never shown.
      startDate: edgeDate(
        items.map((item) => item.startDate),
        'min',
      ),
      endDate: edgeDate(
        items.map((item) => item.endDate),
        'max',
      ),
      todayDate: plan.window.todayDate,
    },
    progress: {
      percent: plan.progress.percent,
      basis: plan.progress.basis,
      taskTotal: plan.progress.taskTotal,
      taskCompleted: plan.progress.taskCompleted,
      milestoneTotal: items.length,
      milestoneCompleted: items.filter((item) => item.status === 'COMPLETED').length,
    },
    items,
  };
}

function edgeDate(dates: Array<string | null>, pick: 'min' | 'max'): string | null {
  const values = dates.filter((value): value is string => value !== null).sort();
  return (pick === 'min' ? values[0] : values.at(-1)) ?? null;
}

/**
 * The columns `toPortalTask` reads, named rather than taken from a repository row type.
 *
 * Both the tasks repository's `TaskSummaryRow` and the progress repository's much narrower
 * `ProgressTaskRow` satisfy this, so the two portal surfaces share one mapper instead of keeping
 * two lists of client-safe task fields that drift apart.
 */
export interface PortalTaskRow {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  project: { code: string };
}

export function toPortalTask(row: PortalTaskRow): PortalTaskSummary {
  return {
    id: row.id,
    key: `${row.project.code}-${row.number}`,
    title: row.title,
    status: toClientVisibleTaskStatus(row.status as TaskStatus),
    priority: row.priority as Priority,
    dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A held-up task, with the team's published words as the explanation.
 *
 * `note` is passed in by the service from a published `ClientUpdate`; the row's own
 * `blockedReason` is not a field on `PortalTaskRow` and so cannot be reached from here even by
 * accident.
 */
export function toPortalBlocker(
  row: PortalTaskRow,
  waitingOnYou: boolean,
  note: string | null,
): PortalProgressBlocker {
  return {
    id: row.id,
    key: `${row.project.code}-${row.number}`,
    title: row.title,
    waitingOnYou,
    since: row.updatedAt.toISOString(),
    note,
  };
}

/**
 * A release the client was told about, from its published note.
 *
 * `id` is the note's, so the board can link straight to `/portal/release-notes/:id`. The
 * deployment row behind it — with its rollback reason and its deploy plan — is not reachable from
 * `PortalReleaseRow` at all.
 */
export function toPortalRelease(row: PortalReleaseRow): PortalProgressRelease {
  return {
    id: row.id,
    version: row.version,
    releaseDate: row.releaseDate.toISOString().slice(0, 10),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    summary: row.clientSummary,
  };
}

function needsClientAction(status: TicketStatus): boolean {
  return status === TICKET_STATUS.WAITING_CLIENT || status === TICKET_STATUS.RESOLVED;
}

export function toPortalTicket(ticket: TicketSummary): PortalTicketSummary {
  return {
    id: ticket.id,
    number: ticket.number,
    key: ticket.key,
    title: ticket.title,
    type: ticket.type as TicketType,
    priority: ticket.priority,
    status: toClientVisibleTicketStatus(ticket.status),
    needsYourAction: needsClientAction(ticket.status),
    sla: ticket.sla ? { resolution: ticket.sla.resolution, isPaused: ticket.sla.isPaused } : null,
    project: ticket.project,
    requester: ticket.requester,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
  };
}

export function toPortalTicketDetail(ticket: TicketDetail): PortalTicketDetail {
  return {
    ...toPortalTicket(ticket),
    description: ticket.description,
    impact: ticket.impact,
    resolution: ticket.resolution,
    replies: ticket.comments.filter((comment) => comment.visibility === 'CLIENT'),
    files: ticket.files.filter((file) => file.visibility === 'CLIENT'),
    canReply: ticket.actions.some((action) => action.action === 'reply-public' && action.enabled),
    canReopen: ticket.actions.some((action) => action.action === 'reopen' && action.enabled),
    canClose: ticket.actions.some((action) => action.action === 'close' && action.enabled),
  };
}

/**
 * A published update, narrowed for the client.
 *
 * The internal `toClientUpdateSummary` was used here until a review noticed what it carries:
 * `author` and `publishedBy` are full `UserRef`s, so every client reading their own portal was
 * also being handed the internal user id and the work email address of the developer who did the
 * work and the manager who released it.
 *
 * The portal renders the title, the body, the date and the project name and nothing else, so the
 * narrowing costs nothing. `status` is not carried either: the portal only ever queries published
 * rows, and a status field would be a place for an unpublished one to arrive looking legitimate.
 */
export function toPortalClientUpdate(row: ClientUpdateRow): PortalClientUpdate {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    workDate: row.workDate.toISOString().slice(0, 10),
    project: row.project,
    task: row.task
      ? {
          id: row.task.id,
          key: `${row.task.project.code}-${row.task.number}`,
          title: row.task.title,
        }
      : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}
