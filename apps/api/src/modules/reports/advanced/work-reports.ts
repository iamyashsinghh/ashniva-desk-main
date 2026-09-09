import { CLIENT_UPDATE_STATUS, OPEN_TASK_STATUSES, REPORT_TYPE, TASK_STATUS } from '@ashniva/types';

import { changeRequestNumber } from '../../change-requests/change-requests.mapper';
import {
  column,
  dateCell,
  dateTimeCell,
  finish,
  moneyCell,
  percent,
  type ReportBuilder,
  type ReportRow,
} from './report-context';

const DAY_MS = 86_400_000;

/** Tasks completed (or still open) in the range with estimate vs. actual and delay. */
export const taskCompletion: ReportBuilder = async (ctx) => {
  const tasks = await ctx.prisma.task.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      status: { not: TASK_STATUS.CANCELLED },
      OR: [
        { completedAt: { gte: ctx.from, lt: new Date(ctx.to.getTime() + DAY_MS) } },
        { completedAt: null, status: { in: [...OPEN_TASK_STATUSES] } },
      ],
      ...(ctx.filters.projectId ? { projectId: ctx.filters.projectId } : {}),
      ...(ctx.clientOrganizationId
        ? { project: { clientOrganizationId: ctx.clientOrganizationId } }
        : {}),
      ...(ctx.visibleUserIds ? { assignedToId: { in: ctx.visibleUserIds } } : {}),
      ...(ctx.filters.userId ? { assignedToId: ctx.filters.userId } : {}),
    },
    include: {
      project: { select: { code: true } },
      assignedTo: { select: { name: true } },
      workLogs: { select: { minutes: true } },
    },
    orderBy: [{ completedAt: 'desc' }, { dueDate: 'asc' }],
  });
  const today = new Date(ctx.now.toISOString().slice(0, 10));
  const rows: ReportRow[] = tasks.map((task) => {
    const actual = task.workLogs.reduce((sum, log) => sum + log.minutes, 0);
    const reference = task.completedAt ?? today;
    const delayDays = task.dueDate
      ? Math.max(0, Math.round((reference.getTime() - task.dueDate.getTime()) / DAY_MS))
      : null;
    return {
      key: `${task.project.code}-${task.number}`,
      title: task.title,
      assignee: task.assignedTo?.name ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: dateCell(task.dueDate),
      completedAt: dateCell(task.completedAt),
      delayDays,
      estimateMinutes: task.estimateMinutes,
      actualMinutes: actual,
      variancePercent:
        task.estimateMinutes && task.estimateMinutes > 0
          ? Math.round(((actual - task.estimateMinutes) / task.estimateMinutes) * 100)
          : null,
    };
  });
  const completed = rows.filter((row) => row.status === TASK_STATUS.COMPLETED);
  const late = completed.filter((row) => Number(row.delayDays) > 0);
  return finish(
    ctx,
    REPORT_TYPE.TASK_COMPLETION,
    'Task completion and delays',
    [
      column('key', 'Task'),
      column('title', 'Title'),
      column('assignee', 'Assignee'),
      column('status', 'Status', 'status'),
      column('priority', 'Priority', 'status'),
      column('dueDate', 'Due', 'date'),
      column('completedAt', 'Completed', 'date'),
      column('delayDays', 'Delay (days)', 'number'),
      column('estimateMinutes', 'Estimate', 'minutes'),
      column('actualMinutes', 'Logged', 'minutes'),
      column('variancePercent', 'Variance', 'percent'),
    ],
    rows,
    [
      { label: 'Completed in range', value: completed.length },
      {
        label: 'Completed late',
        value: `${late.length} (${percent(late.length, completed.length)}%)`,
      },
      { label: 'Still open', value: rows.length - completed.length },
      {
        label: 'Overdue now',
        value: rows.filter(
          (row) => row.status !== TASK_STATUS.COMPLETED && Number(row.delayDays) > 0,
        ).length,
      },
    ],
  );
};

/** Open work and logged minutes per person (staff the caller may see). */
export const teamWorkload: ReportBuilder = async (ctx) => {
  const members = await ctx.prisma.organizationMembership.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      user: { deletedAt: null, status: 'ACTIVE' },
      ...(ctx.visibleUserIds ? { userId: { in: ctx.visibleUserIds } } : {}),
      ...(ctx.filters.userId ? { userId: ctx.filters.userId } : {}),
      ...(ctx.filters.teamId
        ? { user: { teamMemberships: { some: { teamId: ctx.filters.teamId } } } }
        : {}),
    },
    include: { user: { select: { id: true, name: true } }, role: { select: { name: true } } },
    orderBy: { user: { name: 'asc' } },
  });
  const ids = members.map((member) => member.userId);
  const [tasks, logs] = await Promise.all([
    ctx.prisma.task.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null, assignedToId: { in: ids } },
      select: { assignedToId: true, status: true, dueDate: true, completedAt: true },
    }),
    ctx.prisma.workLog.groupBy({
      by: ['userId'],
      where: {
        organizationId: ctx.organizationId,
        userId: { in: ids },
        workDate: { gte: ctx.from, lte: ctx.to },
      },
      _sum: { minutes: true },
    }),
  ]);
  const today = new Date(ctx.now.toISOString().slice(0, 10));
  const minutes = new Map(logs.map((log) => [log.userId, log._sum.minutes ?? 0]));
  const rows: ReportRow[] = members.map((member) => {
    const mine = tasks.filter((task) => task.assignedToId === member.userId);
    const open = mine.filter((task) => (OPEN_TASK_STATUSES as string[]).includes(task.status));
    return {
      person: member.user.name,
      role: member.role.name,
      openTasks: open.length,
      inProgress: open.filter((task) => task.status === TASK_STATUS.IN_PROGRESS).length,
      inReview: open.filter((task) => task.status === TASK_STATUS.IN_REVIEW).length,
      blocked: open.filter((task) => task.status === TASK_STATUS.BLOCKED).length,
      overdue: open.filter((task) => task.dueDate && task.dueDate < today).length,
      completedInRange: mine.filter(
        (task) =>
          task.completedAt &&
          task.completedAt >= ctx.from &&
          task.completedAt < new Date(ctx.to.getTime() + DAY_MS),
      ).length,
      loggedMinutes: minutes.get(member.userId) ?? 0,
    };
  });
  return finish(
    ctx,
    REPORT_TYPE.TEAM_WORKLOAD,
    'Team workload',
    [
      column('person', 'Person'),
      column('role', 'Role'),
      column('openTasks', 'Open', 'number'),
      column('inProgress', 'In progress', 'number'),
      column('inReview', 'In review', 'number'),
      column('blocked', 'Blocked', 'number'),
      column('overdue', 'Overdue', 'number'),
      column('completedInRange', 'Completed in range', 'number'),
      column('loggedMinutes', 'Logged in range', 'minutes'),
    ],
    rows,
    [
      { label: 'People', value: rows.length },
      { label: 'Open tasks', value: rows.reduce((sum, row) => sum + Number(row.openTasks), 0) },
      {
        label: 'Logged (hours)',
        value: (rows.reduce((sum, row) => sum + Number(row.loggedMinutes), 0) / 60).toFixed(1),
      },
    ],
  );
};

/** Published client updates in the range: what the client was told was completed. */
export const clientCompletedWork: ReportBuilder = async (ctx) => {
  const updates = await ctx.prisma.clientUpdate.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: CLIENT_UPDATE_STATUS.PUBLISHED,
      workDate: { gte: ctx.from, lte: ctx.to },
      ...(ctx.clientOrganizationId ? { clientOrganizationId: ctx.clientOrganizationId } : {}),
      ...(ctx.filters.projectId ? { projectId: ctx.filters.projectId } : {}),
    },
    include: {
      project: { select: { code: true, name: true } },
      clientOrganization: { select: { name: true } },
      task: { select: { number: true } },
    },
    orderBy: { workDate: 'desc' },
  });
  const rows: ReportRow[] = updates.map((update) => ({
    workDate: dateCell(update.workDate),
    client: update.clientOrganization.name,
    project: `${update.project.code} ${update.project.name}`,
    task: update.task ? `${update.project.code}-${update.task.number}` : '',
    title: update.title,
    summary: update.body,
    publishedAt: dateTimeCell(update.publishedAt),
  }));
  return finish(
    ctx,
    REPORT_TYPE.CLIENT_COMPLETED_WORK,
    'Client-visible completed work',
    [
      column('workDate', 'Date', 'date'),
      column('client', 'Client'),
      column('project', 'Project'),
      column('task', 'Task'),
      column('title', 'Title'),
      column('summary', 'Summary'),
      column('publishedAt', 'Published', 'datetime'),
    ],
    rows,
    [{ label: 'Updates', value: rows.length }],
  );
};

/** Change requests with status, cost / timeline impact and linked work. */
export const changeRequests: ReportBuilder = async (ctx) => {
  const rows = await ctx.prisma.changeRequest.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      createdAt: { gte: ctx.from, lt: new Date(ctx.to.getTime() + DAY_MS) },
      ...(ctx.audience === 'client' ? { status: { not: 'DRAFT' as const } } : {}),
      ...(ctx.clientOrganizationId ? { clientOrganizationId: ctx.clientOrganizationId } : {}),
      ...(ctx.filters.projectId ? { projectId: ctx.filters.projectId } : {}),
      ...(ctx.filters.contractId ? { contractId: ctx.filters.contractId } : {}),
      ...(ctx.filters.status ? { status: ctx.filters.status as never } : {}),
    },
    include: {
      clientOrganization: { select: { name: true } },
      project: { select: { code: true } },
      requestedBy: { select: { name: true } },
      _count: { select: { tasks: { where: { deletedAt: null } } } },
    },
    orderBy: { number: 'desc' },
  });
  const data: ReportRow[] = rows.map((row) => ({
    number: changeRequestNumber(row),
    title: row.title,
    client: row.clientOrganization.name,
    project: row.project?.code ?? '',
    status: row.status,
    requestedBy: row.requestedBy.name,
    submittedAt: dateCell(row.submittedAt),
    approvedAt: dateCell(row.approvedAt),
    scheduledFor: dateCell(row.scheduledFor),
    completedAt: dateCell(row.completedAt),
    estimatedMinutes: row.estimatedMinutes,
    costImpact: moneyCell(row.costImpact),
    currency: row.currency,
    timelineImpactDays: row.timelineImpactDays,
    linkedTasks: row._count.tasks,
  }));
  return finish(
    ctx,
    REPORT_TYPE.CHANGE_REQUESTS,
    'Change-request status and impact',
    [
      column('number', 'CR'),
      column('title', 'Title'),
      column('client', 'Client'),
      column('project', 'Project'),
      column('status', 'Status', 'status'),
      column('requestedBy', 'Requested by'),
      column('submittedAt', 'Submitted', 'date'),
      column('approvedAt', 'Approved', 'date'),
      column('scheduledFor', 'Scheduled', 'date'),
      column('completedAt', 'Completed', 'date'),
      column('estimatedMinutes', 'Estimate', 'minutes'),
      column('costImpact', 'Cost impact', 'money'),
      column('currency', 'Currency'),
      column('timelineImpactDays', 'Timeline impact (days)', 'number'),
      column('linkedTasks', 'Linked tasks', 'number'),
    ],
    data,
    [
      { label: 'Change requests', value: data.length },
      {
        label: 'Approved / scheduled / completed',
        value: data.filter((row) =>
          ['APPROVED', 'SCHEDULED', 'COMPLETED'].includes(String(row.status)),
        ).length,
      },
      {
        label: 'Cost impact (approved)',
        value: data
          .filter((row) => ['APPROVED', 'SCHEDULED', 'COMPLETED'].includes(String(row.status)))
          .reduce((sum, row) => sum + Number(row.costImpact ?? 0), 0)
          .toFixed(2),
      },
    ],
  );
};
