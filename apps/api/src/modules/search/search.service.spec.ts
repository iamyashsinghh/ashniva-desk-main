import {
  PERMISSIONS,
  SEARCH_MAX_RESULTS,
  type AuthenticatedUser,
  type TaskSummary,
  type TicketSummary,
} from '@ashniva/types';

import type { ApprovalsService } from '../approvals/approvals.service';
import type { InvoicesService } from '../billing/invoices.service';
import type { ChangeRequestsService } from '../change-requests/change-requests.service';
import type { ContractsService } from '../contracts/contracts.service';
import type { IncidentsService } from '../incidents/incidents.service';
import type { PortalTicketsService } from '../portal/portal-tickets.service';
import type { ProblemsService } from '../problems/problems.service';
import type { ProjectsService } from '../projects/projects.service';
import type { ReleasesService } from '../releases/releases.service';
import type { TasksService } from '../tasks/tasks.service';
import type { TicketsService } from '../tickets/tickets.service';
import type { UsersService } from '../users/users.service';
import { SearchService } from './search.service';

function task(index: number): TaskSummary {
  return {
    id: `task-${index}`,
    key: `ACM-${index}`,
    title: `Task ${index}`,
    number: index,
    status: 'ASSIGNED',
    priority: 'MEDIUM',
    project: { id: 'p1', code: 'ACM', name: 'Acme portal' },
    clientOrganization: null,
    category: null,
    module: null,
    assignedTo: null,
    createdBy: { id: 'u1', name: 'Dev', email: 'dev@example.com' },
    reviewer: null,
    tester: null,
    dueDate: null,
    scheduledStartAt: null,
    dueAt: null,
    workAreas: [],
    isUpcoming: false,
    // The rest of TaskSummary is irrelevant to a hit; the cast keeps the fixture readable.
  } as unknown as TaskSummary;
}

function ticket(index: number): TicketSummary {
  return {
    id: `ticket-${index}`,
    key: `T-${index}`,
    title: `Ticket ${index}`,
    number: index,
    status: 'NEW',
    clientOrganization: { id: 'c1', name: 'Acme Ltd', slug: 'acme' },
  } as unknown as TicketSummary;
}

/** Only the two services the internal-staff cases below reach are given behaviour. */
function serviceUnder(options: {
  tasks: TaskSummary[];
  taskTotal?: number;
  tickets: TicketSummary[];
  ticketTotal?: number;
}): SearchService {
  const tasks = {
    list: jest.fn().mockResolvedValue({
      items: options.tasks,
      nextCursor: null,
      total: options.taskTotal ?? options.tasks.length,
    }),
  } as unknown as TasksService;
  const tickets = {
    list: jest.fn().mockResolvedValue({
      items: options.tickets,
      nextCursor: null,
      total: options.ticketTotal ?? options.tickets.length,
    }),
  } as unknown as TicketsService;
  const unused = {} as never;
  return new SearchService(
    tasks,
    tickets,
    unused as unknown as PortalTicketsService,
    unused as unknown as ProjectsService,
    unused as unknown as ContractsService,
    unused as unknown as InvoicesService,
    unused as unknown as ChangeRequestsService,
    unused as unknown as ProblemsService,
    unused as unknown as IncidentsService,
    unused as unknown as ApprovalsService,
    unused as unknown as ReleasesService,
    unused as unknown as UsersService,
  );
}

function actor(): AuthenticatedUser {
  return {
    userId: 'u1',
    organizationId: 'o1',
    roleKey: 'DEVELOPER',
    permissions: [PERMISSIONS.TASK_READ, PERMISSIONS.TICKET_READ],
    isServiceProvider: true,
  };
}

describe('SearchService', () => {
  it('groups by entity type and counts what it returned', async () => {
    const service = serviceUnder({ tasks: [task(1), task(2)], tickets: [ticket(9)] });
    const response = await service.search(actor(), { q: 'acme', limit: 5 });

    expect(response.query).toBe('acme');
    expect(response.total).toBe(3);
    expect(response.truncated).toBe(false);
    expect(response.groups.map((group) => group.type)).toEqual(['task', 'ticket']);
    expect(response.groups[0]?.hits[0]).toEqual({
      type: 'task',
      id: 'task-1',
      reference: 'ACM-1',
      title: 'Task 1',
      subtitle: 'Acme portal',
      status: 'ASSIGNED',
      href: '/tasks/task-1',
    });
  });

  it('asks each module only for the modules the caller can list', async () => {
    const service = serviceUnder({ tasks: [], tickets: [] });
    const response = await service.search(
      { ...actor(), permissions: [PERMISSIONS.TASK_READ] },
      { q: 'acme', limit: 5 },
    );
    expect(response.groups).toEqual([]);
    expect(response.total).toBe(0);
  });

  it('leaves out a module that matched nothing', async () => {
    const service = serviceUnder({ tasks: [task(1)], tickets: [] });
    const response = await service.search(actor(), { q: 'acme', limit: 5 });
    expect(response.groups.map((group) => group.type)).toEqual(['task']);
  });

  it('reports hasMore when the module matched more than the limit returned', async () => {
    const service = serviceUnder({ tasks: [task(1)], taskTotal: 40, tickets: [] });
    const response = await service.search(actor(), { q: 'acme', limit: 1 });
    expect(response.groups[0]?.hasMore).toBe(true);
  });

  it('caps the whole response and says it did', async () => {
    // Both modules answer far past the cap; the response stops at it, in group order.
    const many = Array.from({ length: SEARCH_MAX_RESULTS }, (_, index) => task(index));
    const service = serviceUnder({ tasks: many, tickets: [ticket(1)] });
    const response = await service.search(actor(), { q: 'acme', limit: SEARCH_MAX_RESULTS });

    expect(response.total).toBe(SEARCH_MAX_RESULTS);
    expect(response.truncated).toBe(true);
    expect(response.groups.map((group) => group.type)).toEqual(['task']);
  });

  it('trims the term before it reaches a module', async () => {
    const service = serviceUnder({ tasks: [], tickets: [] });
    const response = await service.search(actor(), { q: '  acme  ', limit: 5 });
    expect(response.query).toBe('acme');
  });
});
