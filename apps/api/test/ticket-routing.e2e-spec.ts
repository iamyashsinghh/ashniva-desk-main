import type { INestApplication } from '@nestjs/common';
import { TICKET_STATUS, WORKLOAD_TASK_STATUSES, WORKLOAD_TICKET_STATUSES } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { TicketsRepository } from '../src/modules/tickets/tickets.repository';
import { RoutingMonitorService } from '../src/modules/ticket-routing/routing-monitor.service';
import { TicketRoutingService } from '../src/modules/ticket-routing/ticket-routing.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * The routing engine end to end.
 *
 * Availability is made deterministic without freezing the clock. A person with **no rota at all**
 * is available whenever nothing says otherwise, so that is how the eligible developers are set up;
 * a rota with **no working days** is outside working hours at every instant, so that is how the
 * ineligible ones are. Neither depends on what time the suite happens to run, which a rota of
 * "09:30–18:30" very much would.
 */
describe('Support routing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let router: TicketRoutingService;
  let monitor: RoutingMonitorService;
  let tickets: TicketsRepository;
  let pm: Session;
  let apiDev: Session;
  let frontendDev: Session;
  let tester: Session;
  let clientAdmin: Session;
  let providerOrgId: string;
  let clientOrgId: string;
  let projectId: string;
  const ticketIds: string[] = [];

  const api = () => request(app.getHttpServer());

  const routing = (ticketId: string, session = pm) =>
    api().get(`/api/v1/tickets/${ticketId}/routing`).set('Authorization', bearer(session));

  const reroute = (ticketId: string, body: Record<string, unknown> = {}, session = pm) =>
    api()
      .post(`/api/v1/tickets/${ticketId}/route`)
      .set('Authorization', bearer(session))
      .send(body);

  /** Ownership for the fixture project. Every field is stated so no test inherits another's. */
  function setOwnership(over: Record<string, unknown> = {}) {
    return api()
      .put(`/api/v1/projects/${projectId}/support-ownership`)
      .set('Authorization', bearer(pm))
      .send({
        primaryDeveloperId: frontendDev.body.user.id,
        backupDeveloperId: tester.body.user.id,
        seniorId: null,
        supportExecutiveId: null,
        moduleOwners: { API: apiDev.body.user.id },
        workloadLimit: null,
        ackMinutes: 15,
        escalationMinutes: 30,
        directTypes: [],
        autoRouteEnabled: true,
        fallbackUserId: null,
        ...over,
      })
      .expect(200);
  }

  /** Nobody has a rota by default, which is what makes them available at any hour. */
  async function clearAvailability(): Promise<void> {
    const userIds = [apiDev.body.user.id, frontendDev.body.user.id, tester.body.user.id];
    await prisma.userWorkSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userAvailability.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.onCallSchedule.deleteMany({ where: { projectId } });
  }

  /** A rota with no working days: outside working hours whenever this test runs. */
  function makeOutOfHours(userId: string) {
    return api()
      .put(`/api/v1/users/${userId}/work-schedule`)
      .set('Authorization', bearer(pm))
      .send({ workingDays: [], startTime: '09:30', endTime: '18:30' })
      .expect(200);
  }

  function setAvailability(userId: string, status: string) {
    return api()
      .patch(`/api/v1/users/${userId}/availability`)
      .set('Authorization', bearer(pm))
      .send({ status, source: 'HR' })
      .expect(200);
  }

  /**
   * A ticket to route, created through the repository rather than `POST /tickets`.
   *
   * Raising a ticket over HTTP queues a routing job, and a background worker finishing that job
   * mid-assertion would make every test here race the very thing it is testing. The queued path
   * has its own test below; these need a ticket that sits still until the test routes it.
   */
  async function raise(over: Record<string, unknown> = {}): Promise<string> {
    const row = await tickets.create(providerOrgId, {
      clientOrganizationId: clientOrgId,
      requesterId: clientAdmin.body.user.id,
      title: 'WhatsApp template sync failing',
      description: 'Templates stopped syncing after the last release.',
      type: 'BUG',
      priority: 'HIGH',
      projectId,
      module: 'API',
      ...over,
    });
    ticketIds.push(row.id);
    return row.id;
  }

  /**
   * How much open work somebody is holding, recomputed here from the status sets rather than
   * read back from the router — so the workload test proves the rule rather than restating it.
   */
  async function workloadOf(userId: string): Promise<number> {
    const [tickets, tasks] = await Promise.all([
      prisma.ticket.count({
        where: {
          organizationId: providerOrgId,
          assignedToId: userId,
          deletedAt: null,
          status: { in: [...WORKLOAD_TICKET_STATUSES] },
        },
      }),
      prisma.task.count({
        where: {
          organizationId: providerOrgId,
          assignedToId: userId,
          deletedAt: null,
          status: { in: [...WORKLOAD_TASK_STATUSES] },
        },
      }),
    ]);
    return tickets + tasks;
  }

  /** One more open ticket on somebody's plate, without going through the router. */
  async function assignSpareTicket(userId: string): Promise<void> {
    const id = await raise({ module: 'Frontend' });
    await prisma.ticket.update({
      where: { id },
      data: { assignedToId: userId, status: TICKET_STATUS.ASSIGNED },
    });
  }

  /** Waits for the background worker to place a ticket raised over HTTP. */
  async function waitForRouting(ticketId: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await prisma.ticketRoutingState.findUnique({ where: { ticketId } });
      if (state && state.routedAt !== null) {
        return state;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`The router never placed ${ticketId}`);
  }

  /** Raise and route in one step, which is what the queued job does in production. */
  async function raiseAndRoute(over: Record<string, unknown> = {}): Promise<string> {
    const id = await raise(over);
    await router.route(providerOrgId, id);
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    router = app.get(TicketRoutingService);
    monitor = app.get(RoutingMonitorService);
    tickets = app.get(TicketsRepository);
    [pm, apiDev, frontendDev, tester, clientAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.developer2),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.clientAdmin),
    ]);
    const provider = await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } });
    providerOrgId = provider.id;
    clientOrgId = clientAdmin.body.user.organization.id;

    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: `RT${Date.now().toString().slice(-6)}`,
        name: 'Routing fixture',
        description: 'Created by ticket-routing.e2e-spec.ts',
        type: 'MONTHLY_CONTRACT',
        status: 'ACTIVE',
        clientOrganizationId: clientOrgId,
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    projectId = project.id;
    await prisma.projectMember.createMany({
      data: [
        {
          projectId,
          userId: apiDev.body.user.id,
          role: 'DEVELOPER',
          responsibilities: ['API', 'Backend'],
        },
        {
          projectId,
          userId: frontendDev.body.user.id,
          role: 'DEVELOPER',
          responsibilities: ['Frontend'],
        },
        { projectId, userId: tester.body.user.id, role: 'TESTER', responsibilities: ['QA'] },
      ],
      skipDuplicates: true,
    });
  });

  beforeEach(async () => {
    await clearAvailability();
    await setOwnership();
  });

  afterAll(async () => {
    const userIds = [apiDev.body.user.id, frontendDev.body.user.id, tester.body.user.id];
    await prisma.ticketRoutingTrail.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketRoutingState.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketSla.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.userWorkSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userAvailability.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.onCallSchedule.deleteMany({ where: { projectId } });
    await prisma.supportOwnership.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    // Conversion creates tasks that hold the project; they go before it does.
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await app.close();
  });

  describe('choosing an assignee', () => {
    it('routes an API ticket to the developer who owns the API area', async () => {
      const id = await raiseAndRoute();
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect({ assignedToId: ticket.assignedToId, status: ticket.status }).toEqual({
        assignedToId: apiDev.body.user.id,
        status: TICKET_STATUS.AUTO_ASSIGNED,
      });
    });

    it('prefers the work-area owner over an unrelated developer on the same project', async () => {
      // The frontend developer is the *primary*, and would win on any chain that ignored areas.
      const id = await raiseAndRoute({ module: 'API' });
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.assignedToId).toBe(apiDev.body.user.id);
    });

    it('falls through to the primary when the module owner is on leave', async () => {
      await setAvailability(apiDev.body.user.id, 'ON_LEAVE');
      const id = await raiseAndRoute();
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.assignedToId).toBe(frontendDev.body.user.id);

      const response = await routing(id).expect(200);
      expect(response.body.trail[0]).toMatchObject({
        skipReason: 'ON_LEAVE',
        user: { id: apiDev.body.user.id },
      });
    });

    it('skips somebody outside their working hours', async () => {
      await makeOutOfHours(apiDev.body.user.id);
      const id = await raiseAndRoute();
      const response = await routing(id).expect(200);
      expect(response.body.trail[0]).toMatchObject({ skipReason: 'OUT_OF_HOURS' });
      expect(response.body.state.assignmentType).toBe('AUTOMATIC');
    });

    it('skips somebody at their workload limit', async () => {
      // The development database already holds work for these people, so the ceiling is computed
      // from what they are actually carrying rather than assumed to be zero. The limit is set one
      // above the primary's load and the owner is topped up to reach it: the owner is full, the
      // primary is not, whatever else is in the database.
      const primaryLoad = await workloadOf(frontendDev.body.user.id);
      const limit = primaryLoad + 1;
      for (let held = await workloadOf(apiDev.body.user.id); held < limit; held += 1) {
        await assignSpareTicket(apiDev.body.user.id);
      }
      await setOwnership({ workloadLimit: limit });

      const id = await raiseAndRoute();
      const response = await routing(id).expect(200);
      expect(response.body.trail[0]).toMatchObject({
        skipReason: 'AT_WORKLOAD_LIMIT',
        user: { id: apiDev.body.user.id },
      });
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.assignedToId).toBe(frontendDev.body.user.id);
    });

    it('lets an on-call developer take a ticket outside their hours', async () => {
      // Everybody in the ordinary chain is off shift; the module owner is on call today.
      await makeOutOfHours(apiDev.body.user.id);
      await makeOutOfHours(frontendDev.body.user.id);
      await makeOutOfHours(tester.body.user.id);
      await api()
        .put(`/api/v1/projects/${projectId}/on-call`)
        .set('Authorization', bearer(pm))
        .send({ onDate: new Date().toISOString().slice(0, 10), userId: apiDev.body.user.id })
        .expect(200);

      const id = await raiseAndRoute();
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.assignedToId).toBe(apiDev.body.user.id);
    });

    it('does not route a ticket type the project sends to the support queue', async () => {
      await setOwnership({ directTypes: ['BUG'] });
      const id = await raiseAndRoute({ type: 'BILLING', module: null });
      const response = await routing(id).expect(200);
      expect(response.body.state).toMatchObject({
        outcome: 'SUPPORT_QUEUE',
        queueReason:
          'This ticket type goes to the support queue rather than straight to a developer',
      });
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.assignedToId).toBeNull();
    });

    it('respects a project that switched automatic routing off', async () => {
      await setOwnership({ autoRouteEnabled: false });
      const id = await raiseAndRoute();
      const response = await routing(id).expect(200);
      expect(response.body.state.outcome).toBe('DISABLED');
    });
  });

  describe('when nobody can take it', () => {
    it('leaves the ticket safely in the queue with a reason rather than dropping it', async () => {
      await makeOutOfHours(apiDev.body.user.id);
      await makeOutOfHours(frontendDev.body.user.id);
      await makeOutOfHours(tester.body.user.id);

      const id = await raiseAndRoute();
      const response = await routing(id).expect(200);
      expect(response.body.state).toMatchObject({
        outcome: 'SUPPORT_QUEUE',
        queueReason: 'Every candidate in the chain was unavailable',
      });

      // Still open, still visible, and on the screen a manager actually looks at.
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.status).toBe(TICKET_STATUS.NEW);
      const queue = await api()
        .get('/api/v1/tickets/queue/unassigned')
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(queue.body.map((row: { id: string }) => row.id)).toContain(id);
    });

    it('tells whoever manages routing that it could not be placed', async () => {
      await makeOutOfHours(apiDev.body.user.id);
      await makeOutOfHours(frontendDev.body.user.id);
      await makeOutOfHours(tester.body.user.id);
      const id = await raiseAndRoute();

      const notified = await prisma.notification.count({
        where: { type: 'TICKET_UNROUTABLE', entityId: id, userId: pm.body.user.id },
      });
      expect(notified).toBeGreaterThan(0);
    });
  });

  describe('acknowledgement', () => {
    it('lets the assignee acknowledge and moves the ticket on', async () => {
      const id = await raiseAndRoute();
      const response = await api()
        .post(`/api/v1/tickets/${id}/acknowledge`)
        .set('Authorization', bearer(apiDev))
        .expect(200);
      expect(response.body.state).toMatchObject({
        acknowledgedBy: { id: apiDev.body.user.id },
        acknowledgeDueAt: null,
      });
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.status).toBe(TICKET_STATUS.ACKNOWLEDGED);
    });

    it('does not let somebody else acknowledge on their behalf', async () => {
      const id = await raiseAndRoute();
      await api()
        .post(`/api/v1/tickets/${id}/acknowledge`)
        .set('Authorization', bearer(frontendDev))
        .expect(403);
    });

    it('re-routes to the next candidate when nobody acknowledges in time', async () => {
      const id = await raiseAndRoute();
      // Wind the clock forward by moving the deadline rather than by waiting fifteen minutes.
      await prisma.ticketRoutingState.update({
        where: { ticketId: id },
        data: { acknowledgeDueAt: new Date(Date.now() - 60_000) },
      });

      await monitor.run();

      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      // Away from the module owner, who did not answer, and on to the primary.
      expect(ticket.assignedToId).toBe(frontendDev.body.user.id);
      const response = await routing(id).expect(200);
      expect(
        response.body.trail.some(
          (row: { skipReason: string }) => row.skipReason === 'PREVIOUSLY_ASSIGNED',
        ),
      ).toBe(true);
    });

    it('escalates once the chain has nobody left to try', async () => {
      await setOwnership({ seniorId: tester.body.user.id, backupDeveloperId: null });
      const id = await raiseAndRoute();
      // Everybody eligible has now had it and did not answer.
      await prisma.ticketRoutingState.update({
        where: { ticketId: id },
        data: { acknowledgeDueAt: new Date(Date.now() - 60_000) },
      });
      await monitor.run();
      await prisma.ticketRoutingState.update({
        where: { ticketId: id },
        data: { acknowledgeDueAt: new Date(Date.now() - 60_000), acknowledgedAt: null },
      });
      await monitor.run();

      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.status).toBe(TICKET_STATUS.ESCALATED);
      const state = await prisma.ticketRoutingState.findUniqueOrThrow({ where: { ticketId: id } });
      expect(state.escalationLevel).toBeGreaterThan(0);
    });

    it('lets whoever the escalation landed on acknowledge it', async () => {
      // ESCALATED → ACKNOWLEDGED has been in the transition table since package 8b, and the
      // acknowledge guard did not admit it: the routing state recorded the acknowledgement and
      // the ticket went on reading as escalated to everybody else.
      const id = await raiseAndRoute();
      await prisma.ticket.update({
        where: { id },
        data: { status: TICKET_STATUS.ESCALATED, assignedToId: apiDev.body.user.id },
      });
      await prisma.ticketRoutingState.update({
        where: { ticketId: id },
        data: { acknowledgedAt: null, acknowledgedById: null },
      });

      await api()
        .post(`/api/v1/tickets/${id}/acknowledge`)
        .set('Authorization', bearer(apiDev))
        .expect(200);

      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.status).toBe(TICKET_STATUS.ACKNOWLEDGED);
    });
  });

  /**
   * The two things `TicketsRepository.transition` now insists on, at the layer that does the write.
   *
   * Both used to be nobody's job. The method took a bare id and no organization, so a caller that
   * skipped the scoped read wrote across tenants; and it took any pair of statuses, so the
   * escalation path reached ESCALATED from states `TICKET_TRANSITIONS` does not connect. Proving
   * that here rather than only through a route is deliberate: the repository is what every path
   * goes through, and a guard in one service protects one service.
   */
  describe('the write itself', () => {
    it('refuses a ticket belonging to another organization', async () => {
      const id = await raise();
      const foreign = await prisma.organization.findFirstOrThrow({
        where: { id: { not: providerOrgId } },
        select: { id: true },
      });

      await expect(
        tickets.transition(
          foreign.id,
          id,
          TICKET_STATUS.NEW,
          TICKET_STATUS.ASSIGNED,
          pm.body.user.id,
          'Reaching across the tenant boundary',
        ),
      ).rejects.toThrow();

      // Untouched, and no activity row invented on somebody else's ticket.
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.status).toBe(TICKET_STATUS.NEW);
      expect(
        await prisma.ticketStatusHistory.count({ where: { ticketId: id, toStatus: 'ASSIGNED' } }),
      ).toBe(0);
    });

    it('refuses a move the transition table does not connect', async () => {
      const id = await raise();
      await expect(
        tickets.transition(
          providerOrgId,
          id,
          TICKET_STATUS.WAITING_CLIENT,
          TICKET_STATUS.ESCALATED,
          pm.body.user.id,
          'Escalated: the old bypass',
        ),
      ).rejects.toThrow(/cannot become ESCALATED/i);
    });

    it('refuses the same move through addActivity’s organization scope', async () => {
      const id = await raise();
      const foreign = await prisma.organization.findFirstOrThrow({
        where: { id: { not: providerOrgId } },
        select: { id: true },
      });
      await expect(
        tickets.addActivity(foreign.id, id, TICKET_STATUS.NEW, pm.body.user.id, 'Not yours'),
      ).rejects.toThrow();
      expect(await prisma.ticketStatusHistory.count({ where: { ticketId: id } })).toBe(1);
    });
  });

  describe('escalating a ticket the table will not move', () => {
    it('records the escalation without overwriting what the ticket is waiting for', async () => {
      const id = await raiseAndRoute();
      // The assignee parked it on the client, and then the escalation window ran out anyway.
      await prisma.ticket.update({
        where: { id },
        data: { status: TICKET_STATUS.WAITING_CLIENT },
      });
      await prisma.ticketRoutingState.update({
        where: { ticketId: id },
        data: { escalationDueAt: new Date(Date.now() - 60_000) },
      });

      await monitor.run();

      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      // Still waiting for the client: the desk and the client both go on reading the truth.
      expect(ticket.status).toBe(TICKET_STATUS.WAITING_CLIENT);
      // …and the escalation happened all the same, on the trail and in the routing state.
      const history = await prisma.ticketStatusHistory.findMany({ where: { ticketId: id } });
      expect(history.some((row) => row.note?.startsWith('Escalated:'))).toBe(true);
      const state = await prisma.ticketRoutingState.findUniqueOrThrow({ where: { ticketId: id } });
      expect(state.escalationLevel).toBeGreaterThan(0);
    });
  });

  describe('manual reassignment', () => {
    it('overrides the router and is not undone by the next sweep', async () => {
      const id = await raiseAndRoute();
      await api()
        .post(`/api/v1/tickets/${id}/reassign`)
        .set('Authorization', bearer(pm))
        .send({ assignedToId: frontendDev.body.user.id, reason: 'Arjun is in a workshop today' })
        .expect(200);

      const after = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect({ assignedToId: after.assignedToId, status: after.status }).toEqual({
        assignedToId: frontendDev.body.user.id,
        status: TICKET_STATUS.ASSIGNED,
      });

      // The router runs again and stands down, because a person decided.
      await router.route(providerOrgId, id);
      await monitor.run();
      const later = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(later.assignedToId).toBe(frontendDev.body.user.id);
    });

    it('records who did it and why, and keeps the earlier trail', async () => {
      const id = await raiseAndRoute();
      const before = await routing(id).expect(200);
      await api()
        .post(`/api/v1/tickets/${id}/reassign`)
        .set('Authorization', bearer(pm))
        .send({ assignedToId: frontendDev.body.user.id, reason: 'Escalated by the client' })
        .expect(200);

      const response = await routing(id).expect(200);
      expect(response.body.state).toMatchObject({
        assignmentType: 'MANUAL',
        manualOverrideBy: { id: pm.body.user.id },
        manualOverrideReason: 'Escalated by the client',
      });
      // The rows explaining the automatic decision are still there, unedited.
      expect(response.body.trail.length).toBeGreaterThanOrEqual(before.body.trail.length);
    });

    it('insists on a reason', async () => {
      const id = await raiseAndRoute();
      await api()
        .post(`/api/v1/tickets/${id}/reassign`)
        .set('Authorization', bearer(pm))
        .send({ assignedToId: frontendDev.body.user.id })
        .expect(400);
    });

    it('routes again only when explicitly asked to', async () => {
      const id = await raiseAndRoute();
      await api()
        .post(`/api/v1/tickets/${id}/reassign`)
        .set('Authorization', bearer(pm))
        .send({ assignedToId: frontendDev.body.user.id, reason: 'Covering' })
        .expect(200);
      await reroute(id, { force: true }).expect(200);
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      // Forced back onto the automatic path, to somebody who has not had it yet.
      expect(ticket.status).toBe(TICKET_STATUS.AUTO_ASSIGNED);
    });
  });

  describe('concurrency', () => {
    it('produces one assignee when two routing attempts run at once', async () => {
      const id = await raise();
      const results = await Promise.all([
        router.route(providerOrgId, id),
        router.route(providerOrgId, id),
        router.route(providerOrgId, id),
      ]);
      // Exactly one attempt may apply; the others stand down rather than assigning a second person.
      expect(results.filter((result) => result.applied)).toHaveLength(1);

      const accepted = await prisma.ticketRoutingTrail.count({
        where: { ticketId: id, accepted: true },
      });
      expect(accepted).toBe(1);
    });

    it('places a ticket once even when the trigger arrives twice', async () => {
      // The interleaving that a slower database actually produces, made deterministic: the first
      // pass has left a state row, and a second unasked-for trigger — a redelivered queue job, or
      // a retry — must stand down rather than claim the next attempt and re-place the ticket.
      const id = await raiseAndRoute();
      const before = await prisma.ticket.findUniqueOrThrow({ where: { id } });

      const again = await router.route(providerOrgId, id);

      expect(again.applied).toBe(false);
      const after = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect({ assignee: after.assignedToId, status: after.status }).toEqual({
        assignee: before.assignedToId,
        status: before.status,
      });
      const accepted = await prisma.ticketRoutingTrail.count({
        where: { ticketId: id, accepted: true },
      });
      expect(accepted).toBe(1);
    });

    it('still re-routes when the acknowledgement timer asks it to', async () => {
      // The other half of the same rule: standing down must not have disabled the path that is
      // *supposed* to move a ticket on.
      const id = await raiseAndRoute();
      const rerouted = await router.route(providerOrgId, id, { mode: 'reroute' });
      expect(rerouted.applied).toBe(true);
      expect(rerouted.assignedUserId).not.toBe(apiDev.body.user.id);
    });

    it('does not let the escalation sweep undo an acknowledgement that landed first', async () => {
      const id = await raiseAndRoute();
      await prisma.ticketRoutingState.update({
        where: { ticketId: id },
        data: { acknowledgeDueAt: new Date(Date.now() - 60_000) },
      });
      await api()
        .post(`/api/v1/tickets/${id}/acknowledge`)
        .set('Authorization', bearer(apiDev))
        .expect(200);
      await monitor.run();

      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.assignedToId).toBe(apiDev.body.user.id);
      expect(ticket.status).toBe(TICKET_STATUS.ACKNOWLEDGED);
    });
  });

  describe('who may see the trail', () => {
    it('keeps candidate names and skip reasons away from a developer', async () => {
      const id = await raiseAndRoute();
      const response = await routing(id, apiDev).expect(200);
      // They can see the state of their own ticket, but not who else was passed over or why.
      expect(response.body.state).not.toBeNull();
      expect(response.body.trail).toEqual([]);
    });

    it('keeps all of it away from the client who raised the ticket', async () => {
      const id = await raiseAndRoute();
      await routing(id, clientAdmin).expect(403);
      await api()
        .get('/api/v1/tickets/queue/unassigned')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });

    it('needs a token at all', async () => {
      const id = await raiseAndRoute();
      await api().get(`/api/v1/tickets/${id}/routing`).expect(401);
    });

    it('does not let a developer re-run the router or reassign', async () => {
      const id = await raiseAndRoute();
      await reroute(id, {}, apiDev).expect(403);
      await api()
        .post(`/api/v1/tickets/${id}/reassign`)
        .set('Authorization', bearer(apiDev))
        .send({ assignedToId: frontendDev.body.user.id, reason: 'I would rather not' })
        .expect(403);
    });
  });

  describe('tenant isolation', () => {
    it('does not route a ticket belonging to another organization', async () => {
      const foreignOrg = await prisma.organization.findFirstOrThrow({ where: { slug: 'grouphr' } });
      const id = await raiseAndRoute();
      await expect(router.route(foreignOrg.id, id)).rejects.toThrow();
    });

    it('will not put somebody from another organization on a ticket', async () => {
      const id = await raiseAndRoute();
      await api()
        .post(`/api/v1/tickets/${id}/reassign`)
        .set('Authorization', bearer(pm))
        .send({ assignedToId: clientAdmin.body.user.id, reason: 'Wrong tenant' })
        .expect(400);
    });
  });

  describe('the production trigger', () => {
    it('routes a ticket raised over HTTP, without the caller waiting for it', async () => {
      const response = await api()
        .post('/api/v1/tickets')
        .set('Authorization', bearer(pm))
        .send({
          title: 'Raised through the API',
          description: 'Should reach the API owner without anybody asking the router.',
          clientOrganizationId: clientOrgId,
          projectId,
          module: 'API',
          type: 'BUG',
          priority: 'HIGH',
        })
        .expect(201);
      const id = response.body.id as string;
      ticketIds.push(id);

      // The raise returns before routing has happened — that is the point of the queue — so this
      // waits for the worker rather than assuming it has already run.
      const state = await waitForRouting(id);
      expect(state.outcome).toBe('AUTO_ASSIGNED');
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id } });
      expect(ticket.assignedToId).toBe(apiDev.body.user.id);
    }, 30_000);
  });

  describe('ticket → task conversion still works on a routed ticket', () => {
    it('keeps the assignee, the project link and the routing trail', async () => {
      const id = await raiseAndRoute();
      await api()
        .post(`/api/v1/tickets/${id}/convert`)
        .set('Authorization', bearer(pm))
        .send({
          projectId,
          tasks: [{ title: 'Fix template sync', assignedToId: apiDev.body.user.id }],
        })
        .expect(201);

      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id },
        include: { linkedTasks: true },
      });
      expect(ticket.assignedToId).toBe(apiDev.body.user.id);
      expect(ticket.projectId).toBe(projectId);
      expect(ticket.linkedTasks).toHaveLength(1);
      expect(ticket.linkedTasks[0]?.module).toBe('API');

      const response = await routing(id).expect(200);
      expect(response.body.trail.length).toBeGreaterThan(0);
    });
  });
});
