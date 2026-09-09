import 'reflect-metadata';

import { PERMISSIONS, SEARCH_ENTITY_TYPE, type AuthenticatedUser } from '@ashniva/types';

import {
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../../common/decorators/require-permissions.decorator';
import { ApprovalsController } from '../approvals/approvals.controller';
import { BillingController } from '../billing/billing.controller';
import { ChangeRequestsController } from '../change-requests/change-requests.controller';
import { PortalChangeRequestsController } from '../change-requests/portal-change-requests.controller';
import { ContractsController } from '../contracts/contracts.controller';
import { IncidentsController } from '../incidents/incidents.controller';
import { PortalController } from '../portal/portal.controller';
import { ProblemsController } from '../problems/problems.controller';
import { ProjectsController } from '../projects/projects.controller';
import { ReleasesController } from '../releases/releases.controller';
import { TasksController } from '../tasks/tasks.controller';
import { TicketsController } from '../tickets/tickets.controller';
import { UsersController } from '../users/users.controller';
import { allowsSource, SEARCH_GATES, type SearchGate } from './search-gates';

/**
 * The gate table is a copy of the list routes' decorators. A copy drifts, so this reads the real
 * routes' Nest metadata and compares.
 *
 * `route` names the controller method each source stands for. If somebody tightens
 * `GET /problems` and forgets search, or loosens the search gate on its own, one of these fails.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- a route is a method reference; its signature is irrelevant here.
type RouteHandler = Function;

interface GateCase {
  type: SearchGate['type'];
  audience: SearchGate['audience'];
  /** The controller method whose permissions this source must match, exactly. */
  route: RouteHandler;
  routeName: string;
}

const CASES: GateCase[] = [
  {
    type: SEARCH_ENTITY_TYPE.TASK,
    audience: 'internal',
    route: TasksController.prototype.list,
    routeName: 'GET /tasks',
  },
  {
    type: SEARCH_ENTITY_TYPE.TICKET,
    audience: 'internal',
    route: TicketsController.prototype.list,
    routeName: 'GET /tickets',
  },
  {
    type: SEARCH_ENTITY_TYPE.TICKET,
    audience: 'client',
    route: PortalController.prototype.tickets,
    routeName: 'GET /portal/tickets',
  },
  {
    type: SEARCH_ENTITY_TYPE.PROJECT,
    audience: 'internal',
    route: ProjectsController.prototype.list,
    routeName: 'GET /projects',
  },
  {
    type: SEARCH_ENTITY_TYPE.CONTRACT,
    audience: 'internal',
    route: ContractsController.prototype.list,
    routeName: 'GET /contracts',
  },
  {
    type: SEARCH_ENTITY_TYPE.INVOICE,
    audience: 'internal',
    route: BillingController.prototype.list,
    routeName: 'GET /billing/invoices',
  },
  {
    type: SEARCH_ENTITY_TYPE.CHANGE_REQUEST,
    audience: 'internal',
    route: ChangeRequestsController.prototype.list,
    routeName: 'GET /change-requests',
  },
  {
    type: SEARCH_ENTITY_TYPE.CHANGE_REQUEST,
    audience: 'client',
    route: PortalChangeRequestsController.prototype.list,
    routeName: 'GET /portal/change-requests',
  },
  {
    type: SEARCH_ENTITY_TYPE.PROBLEM,
    audience: 'internal',
    route: ProblemsController.prototype.list,
    routeName: 'GET /problems',
  },
  {
    type: SEARCH_ENTITY_TYPE.INCIDENT,
    audience: 'internal',
    route: IncidentsController.prototype.list,
    routeName: 'GET /incidents',
  },
  {
    type: SEARCH_ENTITY_TYPE.APPROVAL,
    audience: 'internal',
    route: ApprovalsController.prototype.list,
    routeName: 'GET /approvals',
  },
  {
    type: SEARCH_ENTITY_TYPE.RELEASE,
    audience: 'internal',
    route: ReleasesController.prototype.list,
    routeName: 'GET /releases',
  },
  {
    type: SEARCH_ENTITY_TYPE.USER,
    audience: 'internal',
    route: UsersController.prototype.list,
    routeName: 'GET /users',
  },
];

function metadata(key: string, route: RouteHandler): string[] {
  return [...((Reflect.getMetadata(key, route) as string[] | undefined) ?? [])].sort();
}

function actorWith(permissions: string[], isServiceProvider = true): AuthenticatedUser {
  return {
    userId: 'u1',
    organizationId: 'o1',
    roleKey: 'DEVELOPER',
    permissions: permissions as AuthenticatedUser['permissions'],
    isServiceProvider,
  };
}

describe('search gates', () => {
  it('covers every source exactly once', () => {
    const keys = SEARCH_GATES.map((gate) => `${gate.type}:${gate.audience}`).sort();
    expect(keys).toEqual([...new Set(keys)].sort());
    expect(keys).toEqual(CASES.map((one) => `${one.type}:${one.audience}`).sort());
  });

  it.each(CASES)(
    'gates $type ($audience) with exactly what $routeName requires',
    ({ type, audience, route }) => {
      const gate = SEARCH_GATES.find(
        (candidate) => candidate.type === type && candidate.audience === audience,
      );
      expect(gate).toBeDefined();
      expect([...(gate?.requires ?? [])].sort()).toEqual(metadata(REQUIRED_PERMISSIONS_KEY, route));
      expect([...(gate?.requiresAny ?? [])].sort()).toEqual(
        metadata(REQUIRED_ANY_PERMISSIONS_KEY, route),
      );
    },
  );

  it('gives a client the portal sources and never the internal ones', () => {
    const client = actorWith(
      [PERMISSIONS.TICKET_READ, PERMISSIONS.CHANGE_REQUEST_READ, PERMISSIONS.PROJECT_READ],
      false,
    );
    const allowed = SEARCH_GATES.filter((gate) => allowsSource(client, gate));
    expect(allowed.map((gate) => `${gate.type}:${gate.audience}`).sort()).toEqual([
      'change-request:client',
      'ticket:client',
    ]);
  });

  it('gives internal staff nothing they lack the module permission for', () => {
    const developer = actorWith([PERMISSIONS.TASK_READ, PERMISSIONS.TICKET_READ]);
    expect(
      SEARCH_GATES.filter((gate) => allowsSource(developer, gate))
        .map((gate) => gate.type)
        .sort(),
    ).toEqual(['task', 'ticket']);
  });

  it('accepts either alternative on a route that asks for one of two', () => {
    const approvals = SEARCH_GATES.find((gate) => gate.type === SEARCH_ENTITY_TYPE.APPROVAL);
    expect(approvals).toBeDefined();
    expect(allowsSource(actorWith([PERMISSIONS.APPROVAL_MANAGE]), approvals!)).toBe(true);
    expect(allowsSource(actorWith([PERMISSIONS.APPROVAL_DECIDE]), approvals!)).toBe(true);
    expect(allowsSource(actorWith([PERMISSIONS.PROJECT_READ]), approvals!)).toBe(false);
  });

  it('lets nobody search with no permissions at all', () => {
    expect(SEARCH_GATES.filter((gate) => allowsSource(actorWith([]), gate))).toEqual([]);
  });
});
