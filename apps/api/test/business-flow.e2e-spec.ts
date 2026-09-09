import type { INestApplication } from '@nestjs/common';
import { ROLE_KEYS, TASK_STATUS, TICKET_STATUS } from '@ashniva/types';
import request from 'supertest';

import {
  DEMO,
  bearer,
  createTestApp,
  loginAs,
  reauthHeaders,
  type Session,
} from './helpers/test-app';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The complete Phase 1 business workflow, end to end, through the public API:
 * organization → users → project → task → work → review → completion → daily report → client
 * update → publish → client sees it → ticket → assignment → conversion → tenant isolation.
 */
describe('Phase 1 business workflow (e2e)', () => {
  let app: INestApplication;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let developer2: Session;
  let tester: Session;
  let support: Session;
  let acmeAdmin: Session;
  let flowClient: Session;

  let clientOrgId = '';
  let projectId = '';
  let taskId = '';
  let updateId = '';
  let ticketId = '';
  let linkedTaskId = '';

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    [director, pm, lead, developer, developer2, tester, support, acmeAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.developer2),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.support),
      loginAs(app, DEMO.clientAdmin),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1–3. the Super Admin creates a client organization and its admin user', async () => {
    const stamp = Date.now();
    const organization = await api()
      .post('/api/v1/organizations')
      .set('Authorization', bearer(director))
      .send({ name: `Flow Client ${stamp}`, type: 'CONTRACT_CLIENT' })
      .expect(201);
    clientOrgId = organization.body.id;

    const email = `flow-admin-${stamp}@example.com`;
    await api()
      .post('/api/v1/users')
      .set('Authorization', bearer(director))
      .set(await reauthHeaders(app, director))
      .send({
        email,
        name: 'Flow Admin',
        password: 'FlowClientPass1',
        roleKey: ROLE_KEYS.CLIENT_ADMIN,
        organizationId: clientOrgId,
        title: 'IT Head',
      })
      .expect(201);
    flowClient = await loginAs(app, email, 'FlowClientPass1');
    expect(flowClient.body.user.organization.id).toBe(clientOrgId);
  });

  it('4. the Project Manager creates a project for the client', async () => {
    const response = await api()
      .post('/api/v1/projects')
      .set('Authorization', bearer(pm))
      .send({
        code: `F${Date.now().toString().slice(-5)}`,
        name: 'Flow Portal Revamp',
        type: 'FIXED_PRICE',
        clientOrganizationId: clientOrgId,
        managerUserId: pm.body.user.id,
        leadUserId: lead.body.user.id,
        members: [
          { userId: developer.body.user.id, role: 'DEVELOPER' },
          { userId: tester.body.user.id, role: 'TESTER' },
        ],
      })
      .expect(201);
    projectId = response.body.id;
    expect(response.body.clientOrganization.id).toBe(clientOrgId);
  });

  it('5. the Senior creates and assigns a client-visible task', async () => {
    const response = await api()
      .post('/api/v1/tasks')
      .set('Authorization', bearer(lead))
      .send({
        title: 'Login page redesign',
        projectId,
        assignedToId: developer.body.user.id,
        testerId: tester.body.user.id,
        priority: 'HIGH',
        clientVisible: true,
        dueDate: today(),
      })
      .expect(201);
    taskId = response.body.id;
    expect(response.body.status).toBe(TASK_STATUS.ASSIGNED);
  });

  it('6. the Developer starts and submits work with time spent', async () => {
    await api()
      .post(`/api/v1/tasks/${taskId}/start`)
      .set('Authorization', bearer(developer))
      .expect(201);
    const submitted = await api()
      .post(`/api/v1/tasks/${taskId}/submit`)
      .set('Authorization', bearer(developer))
      .send({
        summary: 'New login layout implemented',
        minutes: 120,
        gitRef: 'feature/login',
        clientSummary: 'The new login page is ready for your review.',
      })
      .expect(201);
    expect(submitted.body.status).toBe(TASK_STATUS.IN_REVIEW);
  });

  it('7. the Tester rejects with a comment', async () => {
    const rejected = await api()
      .post(`/api/v1/tasks/${taskId}/review`)
      .set('Authorization', bearer(tester))
      .send({ outcome: 'REJECT', note: 'Password field overlaps the logo on mobile' })
      .expect(201);
    expect(rejected.body.status).toBe(TASK_STATUS.RETURNED_TO_DEV);
    expect(rejected.body.history.at(-1).note).toContain('overlaps');
  });

  it('8–9. the Developer resubmits and the Tester approves; the task is completed', async () => {
    await api()
      .post(`/api/v1/tasks/${taskId}/submit`)
      .set('Authorization', bearer(developer))
      .send({ summary: 'Fixed the mobile overlap', minutes: 45 })
      .expect(201);
    const approved = await api()
      .post(`/api/v1/tasks/${taskId}/review`)
      .set('Authorization', bearer(tester))
      .send({ outcome: 'APPROVE', note: 'Looks good on all sizes' })
      .expect(201);
    expect(approved.body.status).toBe(TASK_STATUS.COMPLETED);
    expect(approved.body.clientUpdate.status).toBe('PENDING');
    updateId = approved.body.clientUpdate.id;
  });

  it('10. the task appears in the developer’s daily report', async () => {
    const report = await api()
      .get('/api/v1/reports/daily')
      .set('Authorization', bearer(developer))
      .expect(200);
    const item = report.body.snapshot.items.find(
      (entry: { taskId: string }) => entry.taskId === taskId,
    );
    expect(item).toMatchObject({ completedToday: true, minutes: 165, clientVisible: true });
    expect(report.body.snapshot.tasksCompleted).toBeGreaterThanOrEqual(1);
    // The lead sees the team's reports; the developer cannot read a colleague's.
    const team = await api()
      .get('/api/v1/reports/daily/team')
      .set('Authorization', bearer(lead))
      .expect(200);
    expect(team.body.map((entry: { userId: string }) => entry.userId)).toContain(
      developer.body.user.id,
    );
    await api()
      .get(`/api/v1/reports/daily?userId=${developer2.body.user.id}`)
      .set('Authorization', bearer(developer))
      .expect(403);
  });

  it('11–12. the client update waits until the Senior publishes it', async () => {
    const before = await api()
      .get(`/api/v1/portal/updates?from=${today()}&to=${today()}`)
      .set('Authorization', bearer(flowClient))
      .expect(200);
    expect(before.body.map((update: { id: string }) => update.id)).not.toContain(updateId);
    const pending = await api()
      .get('/api/v1/client-updates?status=PENDING')
      .set('Authorization', bearer(lead))
      .expect(200);
    expect(pending.body.map((update: { id: string }) => update.id)).toContain(updateId);
    await api()
      .post(`/api/v1/client-updates/${updateId}/publish`)
      .set('Authorization', bearer(lead))
      .expect(201);
  });

  it('13. it shows in Completed Today for the right client only', async () => {
    const mine = await api()
      .get(`/api/v1/portal/updates?from=${today()}&to=${today()}`)
      .set('Authorization', bearer(flowClient))
      .expect(200);
    expect(mine.body.map((update: { id: string }) => update.id)).toContain(updateId);
    expect(mine.body.find((update: { id: string }) => update.id === updateId).body).toBe(
      'The new login page is ready for your review.',
    );

    const acme = await api()
      .get(`/api/v1/portal/updates?from=${today()}&to=${today()}`)
      .set('Authorization', bearer(acmeAdmin))
      .expect(200);
    expect(acme.body.map((update: { id: string }) => update.id)).not.toContain(updateId);

    const home = await api()
      .get('/api/v1/portal/home')
      .set('Authorization', bearer(flowClient))
      .expect(200);
    expect(home.body.kpis.completedToday).toBeGreaterThanOrEqual(1);
    expect(home.body.projects.map((project: { id: string }) => project.id)).toEqual([projectId]);
    const detail = await api()
      .get(`/api/v1/portal/projects/${projectId}`)
      .set('Authorization', bearer(flowClient))
      .expect(200);
    expect(
      detail.body.tasks.map((task: { id: string; status: string }) => [task.id, task.status]),
    ).toContainEqual([taskId, 'COMPLETED']);
    // The internal task shape never reaches the portal.
    expect(detail.body.tasks[0].assignedTo).toBeUndefined();
  });

  it('14. the client raises a ticket', async () => {
    const response = await api()
      .post('/api/v1/portal/tickets')
      .set('Authorization', bearer(flowClient))
      .send({
        title: 'Cannot upload the company logo',
        description: 'The upload button does nothing on Safari.',
        type: 'BUG',
        priority: 'HIGH',
        projectId,
        impact: 'Branding cannot be finished.',
      })
      .expect(201);
    ticketId = response.body.id;
    expect(response.body.key).toMatch(/^T-\d+$/);
    expect(response.body.status).toBe('RECEIVED');
  });

  it('15. Support assigns the ticket to a developer', async () => {
    const assigned = await api()
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', bearer(support))
      .send({ assignedToId: developer2.body.user.id })
      .expect(201);
    expect(assigned.body.status).toBe(TICKET_STATUS.ASSIGNED);
    expect(assigned.body.assignedTo.id).toBe(developer2.body.user.id);
    await api()
      .post(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', bearer(developer))
      .send({ assignedToId: developer.body.user.id })
      .expect(403);
  });

  it('16. the ticket is converted into a linked task', async () => {
    const converted = await api()
      .post(`/api/v1/tickets/${ticketId}/convert`)
      .set('Authorization', bearer(support))
      .send({
        projectId,
        tasks: [
          {
            title: 'Fix Safari logo upload',
            assignedToId: developer2.body.user.id,
            dueDate: today(),
          },
        ],
      })
      .expect(201);
    expect(converted.body.linkedTasks).toHaveLength(1);
    linkedTaskId = converted.body.linkedTasks[0].id;
    const task = await api()
      .get(`/api/v1/tasks/${linkedTaskId}`)
      .set('Authorization', bearer(developer2))
      .expect(200);
    expect(task.body.ticket.id).toBe(ticketId);
    expect(task.body.status).toBe(TASK_STATUS.ASSIGNED);
  });

  it('17. the ticket thread: developer waits for the client, the client answers, resolution, closure', async () => {
    await api()
      .post(`/api/v1/tickets/${ticketId}/start`)
      .set('Authorization', bearer(developer2))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', bearer(developer2))
      .send({ body: 'Which Safari version are you on?', visibility: 'CLIENT' })
      .expect(201);
    await api()
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', bearer(developer2))
      .send({ body: 'Probably the file input polyfill', visibility: 'INTERNAL' })
      .expect(201);
    await api()
      .post(`/api/v1/tickets/${ticketId}/wait-client`)
      .set('Authorization', bearer(developer2))
      .send({})
      .expect(201);

    const portalView = await api()
      .get(`/api/v1/portal/tickets/${ticketId}`)
      .set('Authorization', bearer(flowClient))
      .expect(200);
    expect(portalView.body.status).toBe('WAITING_FOR_YOU');
    expect(portalView.body.replies).toHaveLength(1);
    expect(JSON.stringify(portalView.body)).not.toContain('polyfill');

    await api()
      .post(`/api/v1/portal/tickets/${ticketId}/reply`)
      .set('Authorization', bearer(flowClient))
      .send({ body: 'Safari 17.4' })
      .expect(201);
    const afterReply = await api()
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', bearer(support))
      .expect(200);
    expect(afterReply.body.status).toBe(TICKET_STATUS.IN_PROGRESS);
    expect(afterReply.body.comments).toHaveLength(3);

    await api()
      .post(`/api/v1/tickets/${ticketId}/resolve`)
      .set('Authorization', bearer(developer2))
      .send({ resolution: 'Upload works on Safari 17.4 after the fix.' })
      .expect(201);
    const closed = await api()
      .post(`/api/v1/portal/tickets/${ticketId}/close`)
      .set('Authorization', bearer(flowClient))
      .expect(201);
    expect(closed.body.status).toBe('COMPLETED');
  });

  it('18. another client is denied access to everything of this client', async () => {
    await api()
      .get(`/api/v1/portal/tickets/${ticketId}`)
      .set('Authorization', bearer(acmeAdmin))
      .expect(404);
    await api()
      .post(`/api/v1/portal/tickets/${ticketId}/reply`)
      .set('Authorization', bearer(acmeAdmin))
      .send({ body: 'hi' })
      .expect(404);
    await api()
      .get(`/api/v1/portal/projects/${projectId}`)
      .set('Authorization', bearer(acmeAdmin))
      .expect(404);
    const acmeTickets = await api()
      .get('/api/v1/portal/tickets?view=all')
      .set('Authorization', bearer(acmeAdmin))
      .expect(200);
    expect(acmeTickets.body.items.map((ticket: { id: string }) => ticket.id)).not.toContain(
      ticketId,
    );
    // Query parameters cannot widen a client's scope.
    const forced = await api()
      .get(`/api/v1/portal/tickets?view=all&clientOrganizationId=${clientOrgId}`)
      .set('Authorization', bearer(acmeAdmin))
      .expect(200);
    expect(forced.body.items.map((ticket: { id: string }) => ticket.id)).not.toContain(ticketId);
    await api()
      .get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', bearer(acmeAdmin))
      .expect(404);
    await api()
      .get(`/api/v1/tasks/${linkedTaskId}`)
      .set('Authorization', bearer(flowClient))
      .expect(403);
  });

  it('19. every role gets its own dashboard; clients get the portal instead', async () => {
    const expectKind = async (session: Session, kind: string) => {
      const response = await api()
        .get('/api/v1/dashboard')
        .set('Authorization', bearer(session))
        .expect(200);
      expect(response.body.kind).toBe(kind);
      return response.body;
    };
    const management = await expectKind(director, 'management');
    expect(management.kpis.activeProjects).toBeGreaterThan(0);
    expect(management.workload.length).toBeGreaterThan(0);
    await expectKind(pm, 'management');
    const senior = await expectKind(lead, 'senior');
    expect(senior.own.enabled).toBe(true);
    expect(
      senior.management.workload.map((entry: { user: { email: string } }) => entry.user.email),
    ).toContain(DEMO.developer);
    const dev = await expectKind(developer, 'developer');
    expect(dev.kpis.completedToday).toBeGreaterThanOrEqual(1);
    const qa = await expectKind(tester, 'tester');
    expect(qa.kpis.approvedToday).toBeGreaterThanOrEqual(1);
    expect(qa.kpis.rejectedToday).toBeGreaterThanOrEqual(1);
    const sup = await expectKind(support, 'support');
    expect(sup.kpis.newTickets).toBeGreaterThan(0);
    const employee = await loginAs(app, DEMO.employee);
    await expectKind(employee, 'employee');
    await api().get('/api/v1/dashboard').set('Authorization', bearer(flowClient)).expect(403);
    await api().get('/api/v1/portal/home').set('Authorization', bearer(developer)).expect(403);
  });

  it('20. the audit history records the flow and stays internal', async () => {
    const audit = await api()
      .get('/api/v1/audit-logs?limit=100')
      .set('Authorization', bearer(director))
      .expect(200);
    const actions = audit.body.items.map((entry: { action: string }) => entry.action);
    for (const expected of [
      'organization.created',
      'user.created',
      'project.created',
      'task.created',
      'task.reviewed',
      'client_update.published',
      'ticket.created',
      'ticket.assigned',
      'ticket.converted_to_task',
    ]) {
      expect(actions).toContain(expected);
    }
    const filtered = await api()
      .get('/api/v1/audit-logs?entityType=ticket')
      .set('Authorization', bearer(director))
      .expect(200);
    expect(
      filtered.body.items.every((entry: { entityType: string }) => entry.entityType === 'ticket'),
    ).toBe(true);
    await api().get('/api/v1/audit-logs').set('Authorization', bearer(developer)).expect(403);
    await api().get('/api/v1/audit-logs').set('Authorization', bearer(flowClient)).expect(403);
  });
});
