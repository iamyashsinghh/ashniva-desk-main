import { MILESTONE_STATUS, OPEN_TASK_STATUSES, REPORT_TYPE, TASK_STATUS } from '@ashniva/types';

import {
  column,
  dateCell,
  finish,
  percent,
  type ReportBuilder,
  type ReportRow,
} from './report-context';

/** Progress per project: task counts, completion %, overdue, open tickets, milestones. */
export const projectProgress: ReportBuilder = async (ctx) => {
  const projects = await ctx.prisma.project.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...(ctx.clientOrganizationId ? { clientOrganizationId: ctx.clientOrganizationId } : {}),
      ...(ctx.filters.projectId ? { id: ctx.filters.projectId } : {}),
      ...(ctx.filters.status ? { status: ctx.filters.status as never } : {}),
    },
    include: {
      clientOrganization: { select: { name: true } },
      tasks: {
        where: { deletedAt: null, ...(ctx.audience === 'client' ? { clientVisible: true } : {}) },
        select: { status: true, dueDate: true },
      },
      milestones: { where: { deletedAt: null }, select: { status: true, clientVisible: true } },
      _count: {
        select: {
          tickets: {
            where: { deletedAt: null, status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'] } },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  const today = new Date(ctx.now.toISOString().slice(0, 10));
  const rows: ReportRow[] = projects.map((project) => {
    const tasks = project.tasks.filter((task) => task.status !== TASK_STATUS.CANCELLED);
    const done = tasks.filter((task) => task.status === TASK_STATUS.COMPLETED).length;
    const overdue = tasks.filter(
      (task) =>
        task.dueDate &&
        task.dueDate < today &&
        (OPEN_TASK_STATUSES as string[]).includes(task.status),
    ).length;
    const milestones = project.milestones.filter(
      (m) => ctx.audience === 'internal' || m.clientVisible,
    );
    return {
      code: project.code,
      name: project.name,
      client: project.clientOrganization?.name ?? '',
      status: project.status,
      tasks: tasks.length,
      completed: done,
      inProgress: tasks.filter((task) => task.status === TASK_STATUS.IN_PROGRESS).length,
      overdue,
      progressPercent: percent(done, tasks.length),
      milestones: milestones.length,
      milestonesDone: milestones.filter((m) => m.status === MILESTONE_STATUS.COMPLETED).length,
      openTickets: project._count.tickets,
      endDate: dateCell(project.targetDate),
    };
  });
  const totalTasks = rows.reduce((sum, row) => sum + Number(row.tasks), 0);
  const totalDone = rows.reduce((sum, row) => sum + Number(row.completed), 0);
  return finish(
    ctx,
    REPORT_TYPE.PROJECT_PROGRESS,
    'Project progress',
    [
      column('code', 'Code'),
      column('name', 'Project'),
      column('client', 'Client'),
      column('status', 'Status', 'status'),
      column('tasks', 'Tasks', 'number'),
      column('completed', 'Completed', 'number'),
      column('inProgress', 'In progress', 'number'),
      column('overdue', 'Overdue', 'number'),
      column('progressPercent', 'Progress', 'percent'),
      column('milestones', 'Milestones', 'number'),
      column('milestonesDone', 'Milestones done', 'number'),
      column('openTickets', 'Open tickets', 'number'),
      column('endDate', 'Target end', 'date'),
    ],
    rows,
    [
      { label: 'Projects', value: rows.length },
      { label: 'Tasks', value: totalTasks },
      { label: 'Overall progress', value: `${percent(totalDone, totalTasks)}%` },
      { label: 'Overdue tasks', value: rows.reduce((sum, row) => sum + Number(row.overdue), 0) },
    ],
  );
};

/** Every milestone with its progress, dates, deliverables and linked-task counts. */
export const milestoneProgress: ReportBuilder = async (ctx) => {
  const rows = await ctx.prisma.milestone.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...(ctx.audience === 'client' ? { clientVisible: true } : {}),
      ...(ctx.clientOrganizationId
        ? { project: { clientOrganizationId: ctx.clientOrganizationId } }
        : {}),
      ...(ctx.filters.projectId ? { projectId: ctx.filters.projectId } : {}),
      ...(ctx.filters.contractId ? { contractId: ctx.filters.contractId } : {}),
      ...(ctx.filters.status ? { status: ctx.filters.status as never } : {}),
    },
    include: {
      project: {
        select: { code: true, name: true, clientOrganization: { select: { name: true } } },
      },
      contract: { select: { numberLabel: true } },
      owner: { select: { name: true } },
      deliverables: { select: { isDone: true } },
      _count: { select: { tasks: { where: { deletedAt: null } } } },
    },
    orderBy: [{ project: { code: 'asc' } }, { sortOrder: 'asc' }, { dueDate: 'asc' }],
  });
  const today = new Date(ctx.now.toISOString().slice(0, 10));
  const data: ReportRow[] = rows.map((row) => ({
    project: `${row.project.code} ${row.project.name}`,
    client: row.project.clientOrganization?.name ?? '',
    milestone: row.name,
    status: row.status,
    progressPercent: row.progressPercent,
    dueDate: dateCell(row.dueDate),
    completedAt: dateCell(row.completedAt),
    overdue: Boolean(
      row.dueDate && row.dueDate < today && row.status !== MILESTONE_STATUS.COMPLETED,
    ),
    deliverables: row.deliverables.length,
    deliverablesDone: row.deliverables.filter((item) => item.isDone).length,
    tasks: row._count.tasks,
    contract: row.contract?.numberLabel ?? '',
    ...(ctx.audience === 'internal' ? { owner: row.owner?.name ?? '' } : {}),
  }));
  return finish(
    ctx,
    REPORT_TYPE.MILESTONE_PROGRESS,
    'Milestone progress',
    [
      column('project', 'Project'),
      column('client', 'Client'),
      column('milestone', 'Milestone'),
      column('status', 'Status', 'status'),
      column('progressPercent', 'Progress', 'percent'),
      column('dueDate', 'Due', 'date'),
      column('completedAt', 'Completed', 'date'),
      column('overdue', 'Overdue'),
      column('deliverables', 'Deliverables', 'number'),
      column('deliverablesDone', 'Deliverables done', 'number'),
      column('tasks', 'Linked tasks', 'number'),
      column('contract', 'Contract'),
      ...(ctx.audience === 'internal' ? [column('owner', 'Owner')] : []),
    ],
    data,
    [
      { label: 'Milestones', value: data.length },
      {
        label: 'Completed',
        value: data.filter((row) => row.status === MILESTONE_STATUS.COMPLETED).length,
      },
      { label: 'Overdue', value: data.filter((row) => row.overdue === true).length },
    ],
  );
};
