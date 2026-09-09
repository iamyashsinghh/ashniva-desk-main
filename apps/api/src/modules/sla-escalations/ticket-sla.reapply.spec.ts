import { TICKET_STATUS } from '@ashniva/types';

import type { SlaPoliciesRepository, SlaPolicyRow } from './sla-policies.repository';
import type { SlaTransitionsService } from './sla-transitions.service';
import type { SupportTierPolicyService } from '../support-tiers/support-tier-policy.service';
import { TicketSlaService } from './ticket-sla.service';

const silentLogger = { setContext: () => {}, warn: () => {} } as never;

interface FakeTicket {
  id: string;
  organizationId: string;
  clientOrganizationId: string;
  projectId: string | null;
  priority: string;
  status: string;
}

/** One policy per project, plus a client-wide fallback — the shape a real tenant has. */
function policyFor(clientOrganizationId: string, projectId: string | null): SlaPolicyRow {
  return {
    id: `policy:${clientOrganizationId}:${projectId ?? 'all'}`,
    name: 'Standard',
    timezone: 'Asia/Kolkata',
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    businessDays: [1, 2, 3, 4, 5],
    pauseStatuses: [],
    warningPercent: 80,
    rules: [{ priority: 'MEDIUM', firstResponseMinutes: 60, resolutionMinutes: 480 }],
  } as unknown as SlaPolicyRow;
}

interface Counters {
  policyLookups: number;
  ticketPages: number;
  slaReads: number;
}

/**
 * Builds the service over fakes that count queries.
 *
 * The point of the test is the *shape* of the work — how many times the database is asked
 * something — so the fakes answer plausibly and record how often they were called.
 */
function serviceOver(tickets: FakeTicket[]): { service: TicketSlaService; counters: Counters } {
  const counters: Counters = { policyLookups: 0, ticketPages: 0, slaReads: 0 };

  const prisma = {
    ticket: {
      findMany: (args: {
        take: number;
        cursor?: { id: string };
        skip?: number;
      }): Promise<FakeTicket[]> => {
        counters.ticketPages += 1;
        const start = args.cursor
          ? tickets.findIndex((ticket) => ticket.id === args.cursor?.id) + 1
          : 0;
        return Promise.resolve(tickets.slice(start, start + args.take));
      },
    },
    ticketSla: {
      findMany: (): Promise<unknown[]> => {
        counters.slaReads += 1;
        // No ticket has an SLA row yet, so every ticket takes the `startClocks` branch — the one
        // that used to make its own policy lookup on top of the sweep's.
        return Promise.resolve([]);
      },
      findUnique: (): Promise<null> => Promise.resolve(null),
      deleteMany: (): Promise<unknown> => Promise.resolve({ count: 0 }),
      delete: (): Promise<unknown> => Promise.resolve({}),
      upsert: (): Promise<unknown> => Promise.resolve({}),
    },
  } as never;

  const policies = {
    findForTicket: (
      _organizationId: string,
      clientOrganizationId: string,
      projectId: string | null,
    ): Promise<SlaPolicyRow | null> => {
      counters.policyLookups += 1;
      return Promise.resolve(policyFor(clientOrganizationId, projectId));
    },
  } as unknown as SlaPoliciesRepository;

  const transitions = {
    addEvent: (): Promise<void> => Promise.resolve(),
    recalculate: (): Promise<void> => Promise.resolve(),
  } as unknown as SlaTransitionsService;

  const tenantContext = {
    runAsSystem: <T>(callback: () => Promise<T>): Promise<T> => callback(),
  } as never;

  // The sweep's tickets carry no product, so `tierPolicyId` short-circuits and this is never
  // called. It is a double rather than a real service precisely so that a future change which
  // starts calling it per ticket shows up here as a count, instead of quietly costing a query per
  // ticket — which is the regression this whole file exists to prevent.
  const tiers = {
    forTier: (): Promise<never> => {
      throw new Error('forTier must not be reached for a ticket with no product');
    },
  } as unknown as SupportTierPolicyService;

  return {
    service: new TicketSlaService(
      prisma,
      policies,
      transitions,
      tenantContext,
      tiers,
      silentLogger,
    ),
    counters,
  };
}

function ticketsAcross(projects: number, perProject: number): FakeTicket[] {
  const tickets: FakeTicket[] = [];
  for (let project = 0; project < projects; project += 1) {
    for (let index = 0; index < perProject; index += 1) {
      tickets.push({
        id: `ticket-${String(tickets.length).padStart(4, '0')}`,
        organizationId: 'org',
        clientOrganizationId: `client-${project % 3}`,
        projectId: `project-${project}`,
        priority: 'MEDIUM',
        status: TICKET_STATUS.IN_PROGRESS,
      });
    }
  }
  return tickets;
}

describe('TicketSlaService.reapply', () => {
  it('asks for a policy once per (client, project) pair, not once per ticket', async () => {
    // The regression this guards: a policy edit is a UI action, and it used to issue three to
    // five queries for every open ticket in the tenant. 12 projects × 40 tickets asked for the
    // applicable policy 480 times to get 12 distinct answers.
    const tickets = ticketsAcross(12, 40);
    const { service, counters } = serviceOver(tickets);

    const result = await service.reapply('org');

    expect(result).toEqual({ changed: 480, truncated: false });
    expect(counters.policyLookups).toBe(12);
  });

  it('pages the sweep instead of loading every open ticket at once', async () => {
    const tickets = ticketsAcross(5, 100);
    const { service, counters } = serviceOver(tickets);

    await service.reapply('org');

    // 500 tickets in pages of 200: three pages, and one SLA read per page rather than per ticket.
    expect(counters.ticketPages).toBe(3);
    expect(counters.slaReads).toBe(3);
  });

  it('stops at the ceiling rather than running a request for as long as the data takes', async () => {
    const tickets = ticketsAcross(1, 6_000);
    const { service, counters } = serviceOver(tickets);

    const result = await service.reapply('org');

    expect(result.changed).toBe(5_000);
    expect(counters.policyLookups).toBe(1);
  });

  it('says when it stopped short, because the count on its own reads as complete', async () => {
    // 6000 open tickets: 5000 are reapplied and 1000 keep the policy they had. The count alone
    // cannot be told from a complete run — one log line nobody is watching, an ordinary 200, and
    // an audit record saying `reappliedToOpenTickets: 5000`. The caller has to be able to say so.
    const truncated = await serviceOver(ticketsAcross(1, 6_000)).service.reapply('org');
    expect(truncated).toEqual({ changed: 5_000, truncated: true });

    // And it must not cry wolf on a tenant that finished.
    const complete = await serviceOver(ticketsAcross(1, 4_000)).service.reapply('org');
    expect(complete).toEqual({ changed: 4_000, truncated: false });

    // The boundary: exactly the ceiling, and nothing behind it.
    const exact = await serviceOver(ticketsAcross(1, 5_000)).service.reapply('org');
    expect(exact).toEqual({ changed: 5_000, truncated: false });
  });

  it('does nothing and asks nothing when the tenant has no open tickets', async () => {
    const { service, counters } = serviceOver([]);

    expect(await service.reapply('org')).toEqual({ changed: 0, truncated: false });
    expect(counters.policyLookups).toBe(0);
    expect(counters.ticketPages).toBe(1);
  });

  it('memoises per organization as well as per client and project', async () => {
    // Correct today only because a sweep visits one tenant. A key that stands for less than the
    // query it caches is one call site away from handing one tenant's policy to another's ticket,
    // and that is not a property to leave resting on the caller.
    const tickets = ticketsAcross(1, 2).map((ticket, index) => ({
      ...ticket,
      organizationId: `org-${index}`,
      clientOrganizationId: 'client-0',
      projectId: 'project-0',
    }));
    const { service, counters } = serviceOver(tickets);

    await service.reapply('org');

    // Same client and project, different tenants: two distinct answers, so two lookups.
    expect(counters.policyLookups).toBe(2);
  });
});
