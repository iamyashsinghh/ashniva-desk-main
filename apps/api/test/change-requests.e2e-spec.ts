import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { DEMO, bearer, createTestApp, loginAs, type Session } from './helpers/test-app';

/**
 * Change requests and client approvals end to end: a client drafts and submits → the provider
 * reviews and sends it to the client (an approval request is published) → the client asks for
 * changes → resubmission → approval → tasks and a milestone are generated with traceability →
 * scheduled → completed. Plus: internal data never reaches the portal, the provider can never
 * decide for the client, other clients see nothing, and cancelling withdraws the approval.
 */
describe('Change requests and approvals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pm: Session;
  let developer: Session;
  let clientAdmin: Session;
  let clientEmployee: Session;
  let zenithAdmin: Session;
  let acmeId = '';
  let projectId = '';
  let crId = '';
  let approvalId = '';
  let milestoneId = '';
  const api = () => request(app.getHttpServer());
  const stamp = Date.now();

  const portalCr = (session: Session, id: string) =>
    api().get(`/api/v1/portal/change-requests/${id}`).set('Authorization', bearer(session));
  const internalCr = (id: string) =>
    api().get(`/api/v1/change-requests/${id}`).set('Authorization', bearer(pm)).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [pm, developer, clientAdmin, clientEmployee, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.clientEmployee),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    acmeId = clientAdmin.body.user.organization.id;
    projectId = (await prisma.project.findFirstOrThrow({ where: { code: 'ACM' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a client admin drafts a change request; drafts are private to their author', async () => {
    const created = await api()
      .post('/api/v1/portal/change-requests')
      .set('Authorization', bearer(clientAdmin))
      .send({
        title: `Loyalty points on receipts ${stamp}`,
        description: 'Print the loyalty balance at the bottom of every receipt.',
        businessReason: 'Customers keep asking cashiers for their balance.',
        projectId,
      })
      .expect(201);
    crId = created.body.id;
    expect(created.body.number).toMatch(/^CR-\d{4}$/);
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.internalNotes).toBeUndefined();
    await portalCr(clientEmployee, crId).expect(404);
    const list = await api()
      .get('/api/v1/portal/change-requests')
      .set('Authorization', bearer(clientEmployee))
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(crId);
  });

  it('clients cannot set estimates or internal notes, but can edit their draft', async () => {
    await api()
      .patch(`/api/v1/portal/change-requests/${crId}`)
      .set('Authorization', bearer(clientAdmin))
      .send({ estimatedMinutes: 600 })
      .expect(403);
    const edited = await api()
      .patch(`/api/v1/portal/change-requests/${crId}`)
      .set('Authorization', bearer(clientAdmin))
      .send({ impact: 'Receipts get one extra line.' })
      .expect(200);
    expect(edited.body.impact).toBe('Receipts get one extra line.');
  });

  it('submit → internal review → estimate → send to client publishes an approval', async () => {
    const submitted = await api()
      .post(`/api/v1/portal/change-requests/${crId}/submit`)
      .set('Authorization', bearer(clientAdmin))
      .send({})
      .expect(201);
    expect(submitted.body.status).toBe('SUBMITTED');
    await api()
      .post(`/api/v1/change-requests/${crId}/start-internal-review`)
      .set('Authorization', bearer(developer))
      .send({})
      .expect(403);
    await api()
      .post(`/api/v1/change-requests/${crId}/start-internal-review`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
    const estimated = await api()
      .patch(`/api/v1/change-requests/${crId}`)
      .set('Authorization', bearer(pm))
      .send({
        estimatedMinutes: 480,
        costImpact: '12000.00',
        timelineImpactDays: 3,
        internalNotes: 'Margin is thin on this one.',
      })
      .expect(200);
    expect(estimated.body.internalNotes).toBe('Margin is thin on this one.');
    await api()
      .post(`/api/v1/change-requests/${crId}/comments`)
      .set('Authorization', bearer(pm))
      .send({ body: 'Internal: reuse the receipt template service', visibility: 'INTERNAL' })
      .expect(201);
    await api()
      .post(`/api/v1/change-requests/${crId}/comments`)
      .set('Authorization', bearer(pm))
      .send({ body: 'We estimate one day of work.', visibility: 'CLIENT' })
      .expect(201);
    const sent = await api()
      .post(`/api/v1/change-requests/${crId}/send-to-client`)
      .set('Authorization', bearer(pm))
      .send({ note: 'Proposal: one day, INR 12,000, three days on the timeline.' })
      .expect(201);
    expect(sent.body.status).toBe('CLIENT_REVIEW');

    const waiting = await api()
      .get('/api/v1/approvals?view=waiting-client')
      .set('Authorization', bearer(pm))
      .expect(200);
    const approval = waiting.body.items.find(
      (item: { subject: { type: string; id: string } }) =>
        item.subject.type === 'CHANGE_REQUEST' && item.subject.id === crId,
    );
    expect(approval).toBeDefined();
    approvalId = approval.id;
    expect(approval.status).toBe('PUBLISHED');
  });

  it('the portal shows the proposal without internal notes or internal comments', async () => {
    const portal = (await portalCr(clientAdmin, crId).expect(200)).body;
    expect(portal.status).toBe('CLIENT_REVIEW');
    expect(portal.costImpact).toBe('12000.00');
    expect(portal.internalNotes).toBeUndefined();
    expect(portal.comments).toHaveLength(1);
    expect(portal.comments[0].body).toBe('We estimate one day of work.');
    expect(JSON.stringify(portal)).not.toContain('Margin is thin');
    expect(portal.canApprove).toBe(true);
    expect((await portalCr(clientEmployee, crId).expect(200)).body.canApprove).toBe(false);

    const inbox = await api()
      .get('/api/v1/portal/approvals')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(inbox.body.map((item: { id: string }) => item.id)).toContain(approvalId);
    const detail = await api()
      .get(`/api/v1/portal/approvals/${approvalId}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(detail.body.canDecide).toBe(true);
    expect(detail.body.internalNotes).toBeUndefined();
  });

  it('only the client organization decides; the provider and other clients cannot', async () => {
    await api()
      .post(`/api/v1/portal/approvals/${approvalId}/approve`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(403);
    await api()
      .post(`/api/v1/portal/change-requests/${crId}/approve`)
      .set('Authorization', bearer(clientEmployee))
      .send({})
      .expect(403);
    await api()
      .get(`/api/v1/portal/approvals/${approvalId}`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(404);
    await portalCr(zenithAdmin, crId).expect(404);
    const zenithList = await api()
      .get('/api/v1/portal/change-requests')
      .set('Authorization', bearer(zenithAdmin))
      .expect(200);
    expect(zenithList.body.items.map((item: { id: string }) => item.id)).not.toContain(crId);
  });

  it('the client asks for changes from the CR page; the approval follows', async () => {
    await api()
      .post(`/api/v1/portal/change-requests/${crId}/request-changes`)
      .set('Authorization', bearer(clientAdmin))
      .send({})
      .expect(400);
    const changed = await api()
      .post(`/api/v1/portal/change-requests/${crId}/request-changes`)
      .set('Authorization', bearer(clientAdmin))
      .send({ note: 'Please include the points expiry date too.' })
      .expect(201);
    expect(changed.body.status).toBe('CHANGES_REQUESTED');
    expect(changed.body.decisionNote).toBe('Please include the points expiry date too.');
    const approval = await api()
      .get(`/api/v1/approvals/${approvalId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(approval.body.status).toBe('CHANGES_REQUESTED');
    expect(approval.body.decidedBy.id).toBe(clientAdmin.body.user.id);
    expect(approval.body.history.at(-1).side).toBe('CLIENT');
  });

  it('resubmission → new approval → approval from the approvals inbox approves the CR', async () => {
    await api()
      .post(`/api/v1/portal/change-requests/${crId}/submit`)
      .set('Authorization', bearer(clientAdmin))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/change-requests/${crId}/start-internal-review`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/change-requests/${crId}/send-to-client`)
      .set('Authorization', bearer(pm))
      .send({ note: 'Now with the expiry date. Same estimate.' })
      .expect(201);
    const inbox = await api()
      .get('/api/v1/portal/approvals')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    const open = inbox.body.find(
      (item: { status: string; subject: { id: string } }) =>
        item.status === 'PUBLISHED' && item.subject.id === crId,
    );
    expect(open).toBeDefined();
    const decided = await api()
      .post(`/api/v1/portal/approvals/${open.id}/approve`)
      .set('Authorization', bearer(clientAdmin))
      .send({ comment: 'Go ahead.' })
      .expect(201);
    expect(decided.body.status).toBe('CLIENT_APPROVED');
    const cr = (await internalCr(crId)).body;
    expect(cr.status).toBe('APPROVED');
    expect(cr.approvedAt).not.toBeNull();
    const audits = await prisma.auditLog.count({
      where: { action: 'approval.decided', entityId: open.id },
    });
    expect(audits).toBe(1);
  });

  it('an approved request generates linked tasks under a new milestone', async () => {
    const generated = await api()
      .post(`/api/v1/change-requests/${crId}/generate-tasks`)
      .set('Authorization', bearer(pm))
      .send({
        milestone: { name: `Loyalty on receipts ${stamp}`, clientVisible: true },
        tasks: [
          {
            title: 'Add loyalty balance to receipt template',
            assignedToId: developer.body.user.id,
          },
          { title: 'Show points expiry date' },
        ],
      })
      .expect(201);
    expect(generated.body.linkedTasks).toHaveLength(2);
    expect(generated.body.milestones).toHaveLength(1);
    milestoneId = generated.body.milestones[0].id;
    const task = await api()
      .get(`/api/v1/tasks/${generated.body.linkedTasks[0].id}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(task.body.changeRequest.id).toBe(crId);
    expect(task.body.milestone.id).toBe(milestoneId);
    const milestone = await api()
      .get(`/api/v1/milestones/${milestoneId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(milestone.body.taskCounts?.total ?? milestone.body.linkedTasks?.length ?? 2).toBe(2);
  });

  it('schedule → complete; completed requests are final', async () => {
    const scheduled = await api()
      .post(`/api/v1/change-requests/${crId}/schedule`)
      .set('Authorization', bearer(pm))
      .send({ scheduledFor: '2026-10-01' })
      .expect(201);
    expect(scheduled.body.status).toBe('SCHEDULED');
    expect(scheduled.body.scheduledFor).toBe('2026-10-01');
    const completed = await api()
      .post(`/api/v1/change-requests/${crId}/complete`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
    expect(completed.body.status).toBe('COMPLETED');
    await api()
      .post(`/api/v1/change-requests/${crId}/submit`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(409);
    const history = completed.body.history.map((entry: { toStatus: string }) => entry.toStatus);
    expect(history).toEqual([
      'DRAFT',
      'SUBMITTED',
      'INTERNAL_REVIEW',
      'CLIENT_REVIEW',
      'CHANGES_REQUESTED',
      'SUBMITTED',
      'INTERNAL_REVIEW',
      'CLIENT_REVIEW',
      'APPROVED',
      'SCHEDULED',
      'COMPLETED',
    ]);
  });

  it('a milestone approval: prepared internally, decided by the client', async () => {
    const created = await api()
      .post('/api/v1/approvals')
      .set('Authorization', bearer(pm))
      .send({
        title: 'Sign off the loyalty milestone',
        summary: 'Please confirm the loyalty receipt work is accepted.',
        subjectType: 'MILESTONE',
        subjectId: milestoneId,
        internalNotes: 'Chase on Friday if silent.',
      })
      .expect(201);
    expect(created.body.clientOrganization.id).toBe(acmeId);
    expect(created.body.subject.label).toContain('Loyalty on receipts');
    await api()
      .post(`/api/v1/portal/approvals/${created.body.id}/approve`)
      .set('Authorization', bearer(clientAdmin))
      .send({})
      .expect(404); // drafts never reach the portal
    await api()
      .post(`/api/v1/approvals/${created.body.id}/send-to-internal-review`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/approvals/${created.body.id}/publish`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
    const decided = await api()
      .post(`/api/v1/portal/approvals/${created.body.id}/approve`)
      .set('Authorization', bearer(clientAdmin))
      .send({ comment: 'Accepted.' })
      .expect(201);
    expect(decided.body.status).toBe('CLIENT_APPROVED');
    expect(JSON.stringify(decided.body)).not.toContain('Chase on Friday');
    const milestone = await api()
      .get(`/api/v1/milestones/${milestoneId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(milestone.body.approvalStatus).toBe('CLIENT_APPROVED');
  });

  it('cancelling a request in client review withdraws its approval', async () => {
    const created = await api()
      .post('/api/v1/change-requests')
      .set('Authorization', bearer(pm))
      .send({
        clientOrganizationId: acmeId,
        requestedById: clientAdmin.body.user.id,
        title: `Dark mode for the POS ${stamp}`,
        description: 'Requested by phone: a dark theme for night shifts.',
      })
      .expect(201);
    const id = created.body.id;
    for (const step of ['submit', 'start-internal-review', 'send-to-client']) {
      await api()
        .post(`/api/v1/change-requests/${id}/${step}`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);
    }
    const cancelled = await api()
      .post(`/api/v1/change-requests/${id}/cancel`)
      .set('Authorization', bearer(pm))
      .send({ note: 'Client withdrew the idea.' })
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    const approvals = await prisma.approvalRequest.findMany({
      where: { subjectType: 'CHANGE_REQUEST', subjectId: id },
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.status).toBe('WITHDRAWN');
  });
});
