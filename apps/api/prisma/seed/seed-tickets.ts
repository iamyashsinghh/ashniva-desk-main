import { TICKET_SOURCE, TICKET_STATUS, type TicketStatus } from '@ashniva/types';

import type { PrismaClient, Task } from '../../src/generated/prisma/client';
import { at, raiseCounter } from './seed-helpers';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededProjects } from './seed-projects';
import { TICKET_SEEDS, type TicketSeed } from './seed-tickets-data';
import type { SeededTeams } from './seed-teams';
import type { SeededUsers, SeedUserKey } from './seed-users';

const S = TICKET_STATUS;

function statusPath(status: TicketStatus): TicketStatus[] {
  switch (status) {
    case S.NEW:
      return [S.NEW];
    case S.ASSIGNED:
      return [S.NEW, S.ASSIGNED];
    case S.IN_PROGRESS:
      return [S.NEW, S.ASSIGNED, S.IN_PROGRESS];
    case S.WAITING_CLIENT:
      return [S.NEW, S.ASSIGNED, S.IN_PROGRESS, S.WAITING_CLIENT];
    case S.REVIEW:
      return [S.NEW, S.ASSIGNED, S.IN_PROGRESS, S.REVIEW];
    case S.RESOLVED:
      return [S.NEW, S.ASSIGNED, S.IN_PROGRESS, S.RESOLVED];
    case S.CLOSED:
      return [S.NEW, S.ASSIGNED, S.IN_PROGRESS, S.RESOLVED, S.CLOSED];
    case S.REOPENED:
      return [S.NEW, S.ASSIGNED, S.IN_PROGRESS, S.RESOLVED, S.REOPENED];
    case S.CANCELLED:
      return [S.NEW, S.CANCELLED];
    default:
      return [S.NEW, status];
  }
}

function actorFor(status: TicketStatus, seed: TicketSeed): SeedUserKey {
  switch (status) {
    case S.NEW:
    case S.REOPENED:
      return seed.requester;
    case S.IN_PROGRESS:
    case S.WAITING_CLIENT:
    case S.REVIEW:
    case S.RESOLVED:
      return seed.assignee ?? 'support';
    default:
      return 'support';
  }
}

interface SeedTicketsContext {
  organizations: SeededOrganizations;
  users: SeededUsers;
  projects: SeededProjects;
  teams: SeededTeams;
  tasksByNumber: Map<number, Task>;
}

export async function seedTickets(
  prisma: PrismaClient,
  context: SeedTicketsContext,
): Promise<void> {
  const { organizations, users, projects, teams, tasksByNumber } = context;
  const organizationId = organizations.serviceProvider.id;

  for (const seed of TICKET_SEEDS) {
    const path = statusPath(seed.status);
    const start = at(-seed.ageDays, 10).getTime();
    let end = at(-seed.lastChangeDaysAgo, 16).getTime();
    if (end <= start) {
      end = start + path.length * 60 * 60 * 1000;
    }
    const times = path.map((_, index) =>
      path.length === 1
        ? new Date(start)
        : new Date(start + ((end - start) * index) / (path.length - 1)),
    );
    const timeOf = (status: TicketStatus): Date | null => {
      const index = path.lastIndexOf(status);
      return index === -1 ? null : (times[index] ?? null);
    };

    const data = {
      clientOrganizationId: organizations[seed.client].id,
      title: seed.title,
      description: seed.description,
      type: seed.type,
      priority: seed.priority,
      status: seed.status,
      source: seed.source ?? TICKET_SOURCE.PORTAL,
      projectId: seed.project ? projects[seed.project].id : null,
      module: seed.module ?? null,
      impact: seed.impact ?? null,
      requesterId: users[seed.requester].id,
      assignedToId: seed.assignee ? users[seed.assignee].id : null,
      teamId: seed.team ? teams[seed.team].id : null,
      resolution: seed.resolution ?? null,
      resolvedAt: timeOf(S.RESOLVED),
      closedAt: timeOf(S.CLOSED),
      createdAt: times[0],
      deletedAt: null,
    };
    const ticket = await prisma.ticket.upsert({
      where: { organizationId_number: { organizationId, number: seed.number } },
      update: data,
      create: { ...data, organizationId, number: seed.number },
    });

    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.comment.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticketStatusHistory.createMany({
      data: path.map((status, index) => ({
        ticketId: ticket.id,
        fromStatus: index === 0 ? null : path[index - 1],
        toStatus: status,
        changedById: users[actorFor(status, seed)].id,
        note: index === path.length - 1 ? (seed.lastNote ?? seed.resolution ?? null) : null,
        createdAt: times[index],
      })),
    });
    if (seed.comments?.length) {
      await prisma.comment.createMany({
        data: seed.comments.map((comment) => ({
          organizationId,
          ticketId: ticket.id,
          authorId: users[comment.author].id,
          visibility: comment.visibility,
          body: comment.body,
          createdAt: at(comment.dayOffset, 12),
        })),
      });
    }
    for (const taskNumber of seed.linkedTasks ?? []) {
      const task = tasksByNumber.get(taskNumber);
      if (task) {
        await prisma.task.update({ where: { id: task.id }, data: { ticketId: ticket.id } });
      }
    }
  }

  const maxNumber = Math.max(...TICKET_SEEDS.map((seed) => seed.number));
  await raiseCounter(prisma, organizationId, 'TICKET', maxNumber);

  console.warn(`Tickets: ${TICKET_SEEDS.length}`);
}
