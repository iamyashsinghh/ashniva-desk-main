import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Release notes end to end.
 *
 * The three things worth proving here cannot be shown by a unit test: that the workflow is
 * enforced against the real guards rather than the pure function alone; that a draft never
 * reaches the portal; and that another client's published note is invisible even to a caller who
 * knows its id.
 */
describe('Release notes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let projectId: string;
  let clientOrgId: string;
  const version = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const created: string[] = [];

  const api = () => request(app.getHttpServer());

  /** A fresh draft, straight through the API so the test exercises the real path. */
  async function newDraft(session: Session = pm): Promise<string> {
    const response = await api()
      .post('/api/v1/release-notes')
      .set('Authorization', bearer(session))
      .send({ projectId, version: version(), releaseDate: '2026-09-30' })
      .expect(201);
    created.push(response.body.id);
    return response.body.id;
  }

  /** Adds a client-visible line, since publishing requires at least one. */
  async function addLine(id: string, label = 'Checkout totals corrected'): Promise<string> {
    const response = await api()
      .post(`/api/v1/release-notes/${id}/items`)
      .set('Authorization', bearer(pm))
      .send({ kind: 'MANUAL', label })
      .expect(201);
    return response.body.items.at(-1).id;
  }

  async function publish(id: string): Promise<void> {
    await api()
      .post(`/api/v1/release-notes/${id}/submit`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/release-notes/${id}/approve`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/release-notes/${id}/publish`)
      .set('Authorization', bearer(pm))
      .send({})
      .expect(201);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, pm, lead, developer, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    const org = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = org?.id ?? '';
    const project = await prisma.project.findFirst({
      where: {
        organizationId: providerOrgId,
        deletedAt: null,
        clientOrganizationId: { not: null },
      },
      select: { id: true, clientOrganizationId: true },
    });
    projectId = project?.id ?? '';
    clientOrgId = project?.clientOrganizationId ?? '';
    expect(providerOrgId && projectId && clientOrgId).toBeTruthy();
  });

  afterAll(async () => {
    // Only the rows these tests created; nothing seeded is touched.
    if (created.length > 0) {
      await prisma.releaseNote.deleteMany({ where: { id: { in: created } } });
    }
    await app.close();
  });

  describe('the workflow', () => {
    it('walks draft → in review → approved → published', async () => {
      const id = await newDraft();
      await addLine(id);
      await publish(id);

      const detail = await api()
        .get(`/api/v1/release-notes/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(detail.body.status).toBe('PUBLISHED');
      expect(detail.body.publishedAt).toBeTruthy();
    });

    it('refuses to publish a draft nobody reviewed', async () => {
      const id = await newDraft();
      await addLine(id);
      // The caller holds the publish permission; only the state stops them.
      await api()
        .post(`/api/v1/release-notes/${id}/publish`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(409);
    });

    it('refuses to publish a note with nothing a client can read', async () => {
      const id = await newDraft();
      await api()
        .post(`/api/v1/release-notes/${id}/items`)
        .set('Authorization', bearer(pm))
        .send({ kind: 'MANUAL', label: 'Internal only', clientVisible: false })
        .expect(201);
      await api()
        .post(`/api/v1/release-notes/${id}/submit`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);
      await api()
        .post(`/api/v1/release-notes/${id}/approve`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);
      await api()
        .post(`/api/v1/release-notes/${id}/publish`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(409);
    });

    it('requires a reason when sending a note back', async () => {
      const id = await newDraft();
      await addLine(id);
      await api()
        .post(`/api/v1/release-notes/${id}/submit`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);

      await api()
        .post(`/api/v1/release-notes/${id}/request-changes`)
        .set('Authorization', bearer(lead))
        .send({})
        .expect(409);

      const sentBack = await api()
        .post(`/api/v1/release-notes/${id}/request-changes`)
        .set('Authorization', bearer(lead))
        .send({ note: 'Tighten the pricing wording' })
        .expect(201);
      expect(sentBack.body.status).toBe('CHANGES_REQUESTED');
    });

    it('freezes a published note against edits', async () => {
      const id = await newDraft();
      await addLine(id);
      await publish(id);

      await api()
        .patch(`/api/v1/release-notes/${id}`)
        .set('Authorization', bearer(pm))
        .send({ clientSummary: 'Rewritten after the fact' })
        .expect(409);
    });

    it('records every transition against the person who made it', async () => {
      const id = await newDraft();
      await addLine(id);
      await api()
        .post(`/api/v1/release-notes/${id}/submit`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);
      await api()
        .post(`/api/v1/release-notes/${id}/approve`)
        .set('Authorization', bearer(lead))
        .send({ note: 'Reads well' })
        .expect(201);

      const history = await api()
        .get(`/api/v1/release-notes/${id}/history`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(history.body.map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
        'APPROVED',
        'IN_REVIEW',
      ]);
      expect(history.body[0].changedByName).toBeTruthy();
      expect(history.body[0].note).toBe('Reads well');
    });
  });

  describe('permissions', () => {
    it('lets a developer read but not write', async () => {
      await api().get('/api/v1/release-notes').set('Authorization', bearer(developer)).expect(200);
      await api()
        .post('/api/v1/release-notes')
        .set('Authorization', bearer(developer))
        .send({ projectId, version: version(), releaseDate: '2026-09-30' })
        .expect(403);
    });

    it('does not let a team lead publish', async () => {
      // A lead may approve; publishing is what a client sees, and needs its own permission.
      const id = await newDraft();
      await addLine(id);
      await api()
        .post(`/api/v1/release-notes/${id}/submit`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);
      await api()
        .post(`/api/v1/release-notes/${id}/approve`)
        .set('Authorization', bearer(lead))
        .send({})
        .expect(201);
      await api()
        .post(`/api/v1/release-notes/${id}/publish`)
        .set('Authorization', bearer(lead))
        .send({})
        .expect(403);
    });

    it('keeps a client out of the internal endpoints entirely', async () => {
      const id = await newDraft();
      await api()
        .get(`/api/v1/release-notes/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .get('/api/v1/release-notes')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });

    it('rejects an unauthenticated caller', async () => {
      await api().get('/api/v1/release-notes').expect(401);
    });
  });

  describe('what a client can see', () => {
    it('shows a published note in the right portal', async () => {
      const id = await newDraft();
      await addLine(id, 'Invoices now show the purchase order number');
      await publish(id);

      const detail = await api()
        .get(`/api/v1/portal/release-notes/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(detail.body.items).toEqual([
        { label: 'Invoices now show the purchase order number', kind: 'MANUAL' },
      ]);
    });

    it('never shows a draft, even to the client it is addressed to', async () => {
      const id = await newDraft();
      await addLine(id);
      await api()
        .get(`/api/v1/portal/release-notes/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);

      const list = await api()
        .get('/api/v1/portal/release-notes')
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(list.body.items.map((note: { id: string }) => note.id)).not.toContain(id);
    });

    it('hides another client’s published note, even given its id', async () => {
      const id = await newDraft();
      await addLine(id);
      await publish(id);

      // Zenith is a different client organization. Same answer as a note that does not exist.
      await api()
        .get(`/api/v1/portal/release-notes/${id}`)
        .set('Authorization', bearer(zenithAdmin))
        .expect(404);

      const list = await api()
        .get('/api/v1/portal/release-notes')
        .set('Authorization', bearer(zenithAdmin))
        .expect(200);
      expect(list.body.items.map((note: { id: string }) => note.id)).not.toContain(id);
    });

    it('omits internal notes and the approval trail from the portal response', async () => {
      const id = await newDraft();
      await addLine(id);
      await api()
        .patch(`/api/v1/release-notes/${id}`)
        .set('Authorization', bearer(pm))
        .send({ internalNotes: 'Escalated by the account manager; do not share' })
        .expect(200);
      await publish(id);

      const detail = await api()
        .get(`/api/v1/portal/release-notes/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      const body = JSON.stringify(detail.body);
      expect(body).not.toContain('do not share');
      expect(body).not.toContain('internalNotes');
      expect(detail.body).not.toHaveProperty('history');
      expect(detail.body).not.toHaveProperty('status');
    });

    it('leaves out a line marked not client-visible', async () => {
      const id = await newDraft();
      await addLine(id, 'Search is faster');
      await api()
        .post(`/api/v1/release-notes/${id}/items`)
        .set('Authorization', bearer(pm))
        .send({
          kind: 'MANUAL',
          label: 'Dropped the legacy pricing table and its migration hack',
          clientVisible: false,
        })
        .expect(201);
      await publish(id);

      const detail = await api()
        .get(`/api/v1/portal/release-notes/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(detail.body.items).toHaveLength(1);
      expect(JSON.stringify(detail.body)).not.toContain('migration hack');
    });
  });

  describe('items and generation', () => {
    it('refuses a second identical line', async () => {
      const id = await newDraft();
      await api()
        .post(`/api/v1/release-notes/${id}/items`)
        .set('Authorization', bearer(pm))
        .send({ kind: 'TASK', refId: '00000000-0000-4000-8000-000000000001', label: 'One' })
        .expect(201);
      await api()
        .post(`/api/v1/release-notes/${id}/items`)
        .set('Authorization', bearer(pm))
        .send({ kind: 'TASK', refId: '00000000-0000-4000-8000-000000000001', label: 'One again' })
        .expect(409);
    });

    it('generates without duplicating on a second run', async () => {
      const id = await newDraft();
      const first = await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({ defaultDays: 365 })
        .expect(201);
      const second = await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({ defaultDays: 365 })
        .expect(201);

      expect(second.body.items).toHaveLength(first.body.items.length);
      expect(second.body.items.map((item: { id: string }) => item.id)).toEqual(
        first.body.items.map((item: { id: string }) => item.id),
      );
    });

    it('keeps a manual line through a regeneration', async () => {
      const id = await newDraft();
      await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({ defaultDays: 365 })
        .expect(201);
      const manualId = await addLine(id, 'Written by hand');

      const after = await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({ defaultDays: 365 })
        .expect(201);
      expect(after.body.items.map((item: { id: string }) => item.id)).toContain(manualId);
    });

    it('never generates a line from work another organization did', async () => {
      const id = await newDraft();
      const generated = await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({ defaultDays: 365 })
        .expect(201);

      const refIds = generated.body.items
        .map((item: { refId: string | null }) => item.refId)
        .filter(Boolean);
      if (refIds.length > 0) {
        const foreign = await prisma.task.count({
          where: { id: { in: refIds }, organizationId: { not: providerOrgId } },
        });
        expect(foreign).toBe(0);
      }
    });

    it('never generates a line from work that is not client-visible', async () => {
      const id = await newDraft();
      const generated = await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({ defaultDays: 365 })
        .expect(201);

      const taskRefs = generated.body.items
        .filter((item: { kind: string }) => item.kind === 'TASK')
        .map((item: { refId: string }) => item.refId);
      if (taskRefs.length > 0) {
        const hidden = await prisma.task.count({
          where: { id: { in: taskRefs }, clientVisible: false },
        });
        expect(hidden).toBe(0);
      }
    });

    it('accepts a background generation request', async () => {
      // Exercises the queue path, not just the inline one: a job id BullMQ rejects would only
      // ever show up here.
      const id = await newDraft();
      await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({ background: true, defaultDays: 30 })
        .expect(201);
    });

    it('refuses to regenerate a published note', async () => {
      const id = await newDraft();
      await addLine(id);
      await publish(id);
      await api()
        .post(`/api/v1/release-notes/${id}/generate`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(409);
    });

    it('reorders lines and refuses a partial order', async () => {
      const id = await newDraft();
      const first = await addLine(id, 'First');
      const second = await addLine(id, 'Second');

      await api()
        .patch(`/api/v1/release-notes/${id}/items/order`)
        .set('Authorization', bearer(pm))
        .send({ itemIds: [second, first] })
        .expect(200)
        .expect((response) => {
          expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
            second,
            first,
          ]);
        });

      await api()
        .patch(`/api/v1/release-notes/${id}/items/order`)
        .set('Authorization', bearer(pm))
        .send({ itemIds: [first] })
        .expect(400);
    });
  });

  describe('tenant scope', () => {
    it('does not list another organization’s notes', async () => {
      const id = await newDraft();
      const list = await api()
        .get('/api/v1/release-notes?limit=100')
        .set('Authorization', bearer(director))
        .expect(200);
      const ids = list.body.items.map((note: { id: string }) => note.id);
      expect(ids).toContain(id);

      const rows = await prisma.releaseNote.findMany({
        where: { id: { in: ids } },
        select: { organizationId: true },
      });
      expect(rows.every((row) => row.organizationId === providerOrgId)).toBe(true);
    });

    it('rejects a version already used on the project', async () => {
      const shared = version();
      const first = await api()
        .post('/api/v1/release-notes')
        .set('Authorization', bearer(pm))
        .send({ projectId, version: shared, releaseDate: '2026-09-30' })
        .expect(201);
      created.push(first.body.id);

      await api()
        .post('/api/v1/release-notes')
        .set('Authorization', bearer(pm))
        .send({ projectId, version: shared, releaseDate: '2026-10-31' })
        .expect(409);
    });

    it('rejects an unknown query parameter rather than ignoring it', async () => {
      await api()
        .get('/api/v1/release-notes?includeDrafts=true')
        .set('Authorization', bearer(pm))
        .expect(400);
    });
  });
});
