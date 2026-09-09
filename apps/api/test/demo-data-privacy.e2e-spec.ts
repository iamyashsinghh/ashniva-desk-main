import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { DEMO, bearer, createTestApp, loginAs, type Session } from './helpers/test-app';

/**
 * The demo data itself must obey the rules: everything the client portal returns for the seeded
 * contracts, milestones, change requests and approvals is client-visible, and nothing internal
 * (costs, internal notes, other clients' rows) ever appears.
 */
describe('Demo data privacy and cross-tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pm: Session;
  let clientAdmin: Session;
  let clientEmployee: Session;
  let zenithAdmin: Session;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [pm, clientAdmin, clientEmployee, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.clientEmployee),
      loginAs(app, DEMO.zenithAdmin),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('the seeded contracts reach the client without cost, margin or internal notes', async () => {
    const list = await api()
      .get('/api/v1/portal/contracts')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    const body = JSON.stringify(list.body);
    expect(body).not.toContain('internalCost');
    expect(body).not.toContain('internalNotes');
    expect(body).not.toContain('Renewal talk');

    for (const contract of list.body) {
      const detail = await api()
        .get(`/api/v1/portal/contracts/${contract.id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      const text = JSON.stringify(detail.body);
      expect(text).not.toContain('internalCost');
      expect(text).not.toContain('internalNotes');
      expect(
        detail.body.milestones.every((row: { clientVisible: boolean }) => row.clientVisible),
      ).toBe(true);
    }
  });

  it('internal-only milestones never reach the portal', async () => {
    const internal = await prisma.milestone.findFirstOrThrow({
      where: { clientVisible: false, deletedAt: null },
    });
    const portal = await api()
      .get('/api/v1/portal/milestones')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(portal.body.map((row: { id: string }) => row.id)).not.toContain(internal.id);
    expect(JSON.stringify(portal.body)).not.toContain(internal.name);
  });

  it('the seeded change requests hide internal notes and internal comments from the client', async () => {
    const internalView = await api()
      .get('/api/v1/change-requests')
      .set('Authorization', bearer(pm))
      .expect(200);
    const withNotes = await Promise.all(
      internalView.body.items.map((row: { id: string }) =>
        api().get(`/api/v1/change-requests/${row.id}`).set('Authorization', bearer(pm)),
      ),
    );
    const notes = withNotes
      .map((response) => response.body.internalNotes)
      .filter((note: string | null): note is string => Boolean(note));
    expect(notes.length).toBeGreaterThan(0);

    const portal = await api()
      .get('/api/v1/portal/change-requests')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    for (const row of portal.body.items) {
      const detail = await api()
        .get(`/api/v1/portal/change-requests/${row.id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      const text = JSON.stringify(detail.body);
      expect(text).not.toContain('internalNotes');
      for (const note of notes) {
        expect(text).not.toContain(note);
      }
      expect(
        detail.body.comments.every(
          (comment: { visibility: string }) => comment.visibility === 'CLIENT',
        ),
      ).toBe(true);
    }
  });

  it('the progress board carries nothing internal for any seeded project', async () => {
    const projects = await api()
      .get('/api/v1/portal/projects')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(projects.body.length).toBeGreaterThan(0);

    // Every internal reason the seed writes on this client's work. None may appear in the board.
    const internalTasks = await prisma.task.findMany({
      where: { project: { clientOrganizationId: clientAdmin.body.user.organization.id } },
      select: { blockedReason: true, acceptanceCriteria: true },
    });
    const secrets = internalTasks
      .flatMap((task) => [task.blockedReason, task.acceptanceCriteria])
      .filter((value): value is string => Boolean(value));

    for (const project of projects.body) {
      const board = await api()
        .get(`/api/v1/portal/projects/${project.id}/progress`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      // The raw body: a leak nested three levels down is still a leak.
      for (const field of [
        'blockedReason',
        'estimateMinutes',
        'loggedMinutes',
        'assignedTo',
        'rollbackReason',
        'failureReason',
        'failureDescription',
        'internalNotes',
        'health',
      ]) {
        expect(board.text).not.toContain(field);
      }
      for (const secret of secrets) {
        expect(board.text).not.toContain(secret);
      }
    }
  });

  it('the other client’s progress board holds none of this client’s work', async () => {
    const acmeProject = await prisma.project.findFirstOrThrow({ where: { code: 'ACM' } });
    await api()
      .get(`/api/v1/portal/projects/${acmeProject.id}/progress`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(404);

    const zenithProject = await prisma.project.findFirstOrThrow({ where: { code: 'ZEN' } });
    const board = await api()
      .get(`/api/v1/portal/projects/${zenithProject.id}/progress`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(200);
    const acmeTitles = await prisma.task.findMany({
      where: { project: { code: 'ACM' } },
      select: { title: true },
    });
    for (const task of acmeTitles) {
      expect(board.text).not.toContain(task.title);
    }
  });

  it('a client employee cannot decide an approval that is waiting for the client admin', async () => {
    const waiting = await api()
      .get('/api/v1/portal/approvals')
      .set('Authorization', bearer(clientEmployee))
      .expect(200);
    const published = waiting.body.find((row: { status: string }) => row.status === 'PUBLISHED');
    expect(published).toBeDefined();
    expect(published.canDecide).toBeUndefined();
    await api()
      .post(`/api/v1/portal/approvals/${published.id}/approve`)
      .set('Authorization', bearer(clientEmployee))
      .send({})
      .expect(403);
  });

  it('the other client sees none of it: contracts, change requests and approvals stay apart', async () => {
    const [contracts, changeRequests, approvals] = await Promise.all([
      api().get('/api/v1/portal/contracts').set('Authorization', bearer(zenithAdmin)).expect(200),
      api()
        .get('/api/v1/portal/change-requests')
        .set('Authorization', bearer(zenithAdmin))
        .expect(200),
      api().get('/api/v1/portal/approvals').set('Authorization', bearer(zenithAdmin)).expect(200),
    ]);
    expect(JSON.stringify(contracts.body)).not.toContain('Acme');
    expect(changeRequests.body.items).toHaveLength(0);
    expect(approvals.body).toHaveLength(0);

    const acmeContract = await prisma.contract.findFirstOrThrow({
      where: { numberLabel: 'CT-2026-0001' },
    });
    await api()
      .get(`/api/v1/portal/contracts/${acmeContract.id}`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(404);

    const acmeChangeRequest = await prisma.changeRequest.findFirstOrThrow({
      where: { number: 1 },
    });
    await api()
      .get(`/api/v1/portal/change-requests/${acmeChangeRequest.id}`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(404);
  });

  it('clients cannot reach any internal Phase 2 endpoint', async () => {
    for (const path of [
      '/api/v1/contracts',
      '/api/v1/milestones',
      '/api/v1/change-requests',
      '/api/v1/approvals',
      '/api/v1/sla/policies',
      '/api/v1/reports/advanced',
    ]) {
      await api().get(path).set('Authorization', bearer(clientAdmin)).expect(403);
    }
  });
});
