import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { DEMO, bearer, createTestApp, loginAs, type Session } from './helpers/test-app';

/**
 * SLA: policy CRUD and scope precedence → a raised ticket gets backend-computed clocks → first
 * public reply meets first response → waiting-for-client pauses, the client's reply resumes →
 * the monitor raises warning then breach exactly once → dashboards and the portal reflect it →
 * resolution after the deadline is MET_LATE → permissions and tenant isolation.
 */
describe('SLA policies, ticket clocks and monitor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pm: Session;
  let support: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let projectId = '';
  let defaultPolicyId = '';
  let projectPolicyId = '';
  let ticketId = '';
  let secondTicketId = '';
  const api = () => request(app.getHttpServer());
  const stamp = Date.now();

  const ALWAYS_OPEN = {
    timezone: 'UTC',
    businessHoursStart: '00:00',
    businessHoursEnd: '24:00',
    businessDays: [1, 2, 3, 4, 5, 6, 7],
  };

  const getTicket = (session: Session, id: string) =>
    api().get(`/api/v1/tickets/${id}`).set('Authorization', bearer(session)).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [pm, support, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.support),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    // Zenith has no client-scoped policy in the demo seed, so the default policy this suite
    // creates is the one that must apply. Acme plays the outsider in the isolation check.
    const project = await prisma.project.findFirstOrThrow({ where: { code: 'ZEN' } });
    projectId = project.id;
  });

  afterAll(async () => {
    for (const id of [projectPolicyId, defaultPolicyId].filter(Boolean)) {
      await api().delete(`/api/v1/sla/policies/${id}`).set('Authorization', bearer(pm));
    }
    await app.close();
  });

  it('rejects invalid policies and non-managers', async () => {
    await api()
      .post('/api/v1/sla/policies')
      .set('Authorization', bearer(support))
      .send({ name: 'x', rules: [] })
      .expect(403);
    await api()
      .post('/api/v1/sla/policies')
      .set('Authorization', bearer(pm))
      .send({
        name: `Bad hours ${stamp}`,
        ...ALWAYS_OPEN,
        businessHoursStart: '18:00',
        businessHoursEnd: '09:00',
        rules: [{ priority: 'HIGH', firstResponseMinutes: 60, resolutionMinutes: 240 }],
      })
      .expect(400);
    await api()
      .post('/api/v1/sla/policies')
      .set('Authorization', bearer(pm))
      .send({
        name: `Bad tz ${stamp}`,
        timezone: 'Mars/Olympus',
        rules: [{ priority: 'HIGH', firstResponseMinutes: 60, resolutionMinutes: 240 }],
      })
      .expect(400);
    await api().get('/api/v1/sla/policies').set('Authorization', bearer(clientAdmin)).expect(403);
  });

  it('a PM creates the default policy (24x7 so the timings below are deterministic)', async () => {
    const created = await api()
      .post('/api/v1/sla/policies')
      .set('Authorization', bearer(pm))
      .send({
        name: `E2E default ${stamp}`,
        isDefault: true,
        warningPercent: 50,
        ...ALWAYS_OPEN,
        rules: [
          { priority: 'CRITICAL', firstResponseMinutes: 30, resolutionMinutes: 120 },
          { priority: 'HIGH', firstResponseMinutes: 60, resolutionMinutes: 240 },
          { priority: 'MEDIUM', firstResponseMinutes: 120, resolutionMinutes: 480 },
          { priority: 'LOW', firstResponseMinutes: 240, resolutionMinutes: 960 },
        ],
      })
      .expect(201);
    defaultPolicyId = created.body.id;
    expect(created.body.isDefault).toBe(true);
    expect(created.body.rules).toHaveLength(4);
    const list = await api()
      .get('/api/v1/sla/policies')
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(list.body.filter((policy: { isDefault: boolean }) => policy.isDefault)).toHaveLength(1);
  });

  it('a raised ticket gets clocks computed by the backend', async () => {
    const raised = await api()
      .post('/api/v1/portal/tickets')
      .set('Authorization', bearer(zenithAdmin))
      .send({
        title: `SLA e2e ${stamp}`,
        description: 'Checkout hangs on the second item.',
        type: 'BUG',
        priority: 'HIGH',
        projectId,
      })
      .expect(201);
    ticketId = raised.body.id;
    const ticket = await getTicket(support, ticketId);
    const { sla } = ticket.body;
    expect(sla.policy.id).toBe(defaultPolicyId);
    expect(sla.firstResponse.status).toBe('ON_TRACK');
    expect(sla.firstResponse.remainingMinutes).toBeGreaterThan(55);
    expect(sla.firstResponse.remainingMinutes).toBeLessThanOrEqual(60);
    expect(sla.resolution.remainingMinutes).toBeGreaterThan(235);
    expect(sla.isPaused).toBe(false);
    expect(sla.overall).toBe('ON_TRACK');
    const events = await api()
      .get(`/api/v1/sla/tickets/${ticketId}/events`)
      .set('Authorization', bearer(support))
      .expect(200);
    expect(events.body.map((event: { kind: string }) => event.kind)).toEqual(['STARTED']);
  });

  it('the first public reply meets the first-response target; internal notes do not', async () => {
    await api()
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', bearer(support))
      .send({ assignedToId: support.body.user.id })
      .expect(201);
    await api()
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', bearer(support))
      .send({ body: 'Looking into it (internal)', visibility: 'INTERNAL' })
      .expect(201);
    expect((await getTicket(support, ticketId)).body.sla.firstResponse.metAt).toBeNull();
    await api()
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', bearer(support))
      .send({ body: 'Thanks, we are on it.', visibility: 'CLIENT' })
      .expect(201);
    const { sla } = (await getTicket(support, ticketId)).body;
    expect(sla.firstResponse.status).toBe('MET');
    expect(sla.firstResponse.metAt).not.toBeNull();
    expect(sla.resolution.status).toBe('ON_TRACK');
  });

  it('waiting for the client pauses the clock and the client reply resumes it', async () => {
    await api()
      .post(`/api/v1/tickets/${ticketId}/start`)
      .set('Authorization', bearer(support))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/tickets/${ticketId}/wait-client`)
      .set('Authorization', bearer(support))
      .send({ note: 'Which browser?' })
      .expect(201);
    const paused = (await getTicket(support, ticketId)).body.sla;
    expect(paused.isPaused).toBe(true);
    expect(paused.resolution.status).toBe('PAUSED');
    expect(paused.resolution.remainingMinutes).toBeNull();
    await api()
      .post(`/api/v1/portal/tickets/${ticketId}/reply`)
      .set('Authorization', bearer(zenithAdmin))
      .send({ body: 'Safari 18' })
      .expect(201);
    const resumed = (await getTicket(support, ticketId)).body.sla;
    expect(resumed.isPaused).toBe(false);
    expect(resumed.resolution.status).toBe('ON_TRACK');
    expect(resumed.resolution.remainingMinutes).toBeGreaterThan(230);
    const kinds = (
      await api()
        .get(`/api/v1/sla/tickets/${ticketId}/events`)
        .set('Authorization', bearer(support))
        .expect(200)
    ).body.map((event: { kind: string }) => event.kind);
    expect(kinds).toEqual(expect.arrayContaining(['FIRST_RESPONSE_MET', 'PAUSED', 'RESUMED']));
  });

  it('the monitor raises a warning, then a breach, each exactly once', async () => {
    const minuteAgo = new Date(Date.now() - 60_000);
    await prisma.ticketSla.update({ where: { ticketId }, data: { resolutionWarnAt: minuteAgo } });
    const first = await api()
      .post('/api/v1/sla/monitor/run')
      .set('Authorization', bearer(pm))
      .expect(201);
    expect(first.body.warnings).toBeGreaterThanOrEqual(1);
    expect((await getTicket(support, ticketId)).body.sla.resolution.status).toBe('AT_RISK');
    await api().post('/api/v1/sla/monitor/run').set('Authorization', bearer(pm)).expect(201);

    await prisma.ticketSla.update({ where: { ticketId }, data: { resolutionDueAt: minuteAgo } });
    const second = await api()
      .post('/api/v1/sla/monitor/run')
      .set('Authorization', bearer(pm))
      .expect(201);
    expect(second.body.breaches).toBeGreaterThanOrEqual(1);
    await api().post('/api/v1/sla/monitor/run').set('Authorization', bearer(pm)).expect(201);

    const { sla } = (await getTicket(support, ticketId)).body;
    expect(sla.resolution.status).toBe('BREACHED');
    expect(sla.resolution.remainingMinutes).toBeLessThan(0);
    expect(sla.overall).toBe('BREACHED');
    const events = await prisma.slaEvent.groupBy({
      by: ['kind'],
      where: { ticketId },
      _count: { _all: true },
    });
    const count = (kind: string) => events.find((row) => row.kind === kind)?._count._all ?? 0;
    expect(count('RESOLUTION_WARNING')).toBe(1);
    expect(count('RESOLUTION_BREACHED')).toBe(1);
    const audits = await prisma.auditLog.count({
      where: { action: 'sla.breached', entityId: ticketId },
    });
    expect(audits).toBe(1);
  });

  it('dashboards count the breach and the portal shows only the resolution target', async () => {
    const dashboard = await api()
      .get('/api/v1/dashboard')
      .set('Authorization', bearer(support))
      .expect(200);
    expect(dashboard.body.kpis.slaBreached).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.slaTickets.map((ticket: { id: string }) => ticket.id)).toContain(
      ticketId,
    );
    const management = await api()
      .get('/api/v1/dashboard')
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(management.body.kpis.slaBreached).toBeGreaterThanOrEqual(1);

    const portal = await api()
      .get(`/api/v1/portal/tickets/${ticketId}`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(200);
    expect(portal.body.sla.resolution.status).toBe('BREACHED');
    expect(portal.body.sla.firstResponse).toBeUndefined();
    expect(portal.body.sla.policy).toBeUndefined();
    expect(JSON.stringify(portal.body)).not.toContain('E2E default');
  });

  it('resolving after the deadline is MET_LATE and stops the clock', async () => {
    await api()
      .post(`/api/v1/tickets/${ticketId}/resolve`)
      .set('Authorization', bearer(support))
      .send({ resolution: 'Fixed the Safari upload handler.' })
      .expect(201);
    const { sla } = (await getTicket(support, ticketId)).body;
    expect(sla.resolution.status).toBe('MET_LATE');
    expect(sla.resolution.metAt).not.toBeNull();
    expect(sla.resolution.remainingMinutes).toBeNull();
  });

  it('a project policy takes precedence and deleting it falls back to the default', async () => {
    const created = await api()
      .post('/api/v1/sla/policies')
      .set('Authorization', bearer(pm))
      .send({
        name: `E2E ZEN project ${stamp}`,
        projectId,
        ...ALWAYS_OPEN,
        rules: [{ priority: 'CRITICAL', firstResponseMinutes: 15, resolutionMinutes: 60 }],
      })
      .expect(201);
    projectPolicyId = created.body.id;
    await api()
      .post('/api/v1/sla/policies')
      .set('Authorization', bearer(pm))
      .send({
        name: `E2E duplicate scope ${stamp}`,
        projectId,
        rules: [{ priority: 'LOW', firstResponseMinutes: 15, resolutionMinutes: 60 }],
      })
      .expect(400);

    const raised = await api()
      .post('/api/v1/portal/tickets')
      .set('Authorization', bearer(zenithAdmin))
      .send({
        title: `SLA precedence ${stamp}`,
        description: 'Second ticket',
        type: 'SUPPORT',
        priority: 'HIGH',
        projectId,
      })
      .expect(201);
    secondTicketId = raised.body.id;
    // The project policy wins even though it has no HIGH rule → no SLA on this ticket.
    expect((await getTicket(support, secondTicketId)).body.sla).toBeNull();

    await api()
      .post(`/api/v1/tickets/${secondTicketId}/assign`)
      .set('Authorization', bearer(support))
      .send({ assignedToId: support.body.user.id, priority: 'CRITICAL' })
      .expect(201);
    const critical = (await getTicket(support, secondTicketId)).body.sla;
    expect(critical.policy.id).toBe(projectPolicyId);
    expect(critical.firstResponse.remainingMinutes).toBeLessThanOrEqual(15);

    await api()
      .delete(`/api/v1/sla/policies/${projectPolicyId}`)
      .set('Authorization', bearer(pm))
      .expect(204);
    projectPolicyId = '';
    const fallback = (await getTicket(support, secondTicketId)).body.sla;
    expect(fallback.policy.id).toBe(defaultPolicyId);
    expect(fallback.firstResponse.remainingMinutes).toBeGreaterThan(15);
    const kinds = (
      await api()
        .get(`/api/v1/sla/tickets/${secondTicketId}/events`)
        .set('Authorization', bearer(support))
        .expect(200)
    ).body.map((event: { kind: string }) => event.kind);
    expect(kinds).toContain('POLICY_CHANGED');
  });

  it('another client organization cannot read SLA history or the ticket', async () => {
    await api()
      .get(`/api/v1/sla/tickets/${ticketId}/events`)
      .set('Authorization', bearer(clientAdmin))
      .expect(403);
    await api()
      .get(`/api/v1/portal/tickets/${ticketId}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(404);
  });
});
