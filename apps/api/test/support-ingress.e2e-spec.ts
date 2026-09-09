import type { INestApplication } from '@nestjs/common';
import { CLIENT_VISIBLE_STATUS, TICKET_STATUS } from '@ashniva/types';
import request from 'supertest';

import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { PrismaService } from '../src/database/prisma.service';
import { QUEUE_NAMES } from '../src/infrastructure/queue/queue-names';
import { TicketRoutingService } from '../src/modules/ticket-routing/ticket-routing.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * The product registry and the external support ingress.
 *
 * The assertions that matter most here are the ones about *scope*: an external caller supplies
 * content and nothing else, and every attempt to name its own organization, project or another
 * product's ticket has to fail. A support ingress that trusted the caller about where a ticket
 * belongs would be a route into every team in the product.
 */
describe('Support ingress (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let router: TicketRoutingService;
  let routingQueue: Queue;
  let pm: Session;
  let apiDev: Session;
  let developer2: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let clientOrgId: string;
  let projectId: string;
  let foreignProjectId: string;
  let productId: string;
  let secret: string;
  const createdTicketIds: string[] = [];
  const createdProductIds: string[] = [];

  const api = () => request(app.getHttpServer());

  /** A call as the product would make it: a machine credential, not an employee token. */
  const asProduct = (token = secret) =>
    api().post('/api/v1/support/tickets').set('Authorization', `Bearer ${token}`);

  const payload = (over: Record<string, unknown> = {}) => ({
    title: 'Template sync is failing',
    description: 'Templates stopped syncing after this morning’s update.',
    module: 'API',
    externalUserId: 'carelix-user-42',
    requesterName: 'Meera P',
    requesterEmail: 'meera@example.com',
    externalReference: 'CLX-9001',
    ...over,
  });

  async function raise(over: Record<string, unknown> = {}, key?: string) {
    const call = asProduct();
    if (key) {
      call.set('Idempotency-Key', key);
    }
    const response = await call.send(payload(over));
    if (response.status === 201 && response.body?.ticketId) {
      createdTicketIds.push(response.body.ticketId);
    }
    return response;
  }

  function patchProduct(body: Record<string, unknown>, id = productId) {
    return api()
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', bearer(pm))
      .send(body)
      .expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    router = app.get(TicketRoutingService);
    // Any handle on this queue addresses the same Redis list, which is what matters here: the
    // assertion below is about a job really arriving, not about which JavaScript object posted it.
    routingQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.ROUTING_MONITOR));
    [pm, apiDev, developer2, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.developer2),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    const provider = await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } });
    providerOrgId = provider.id;
    clientOrgId = clientAdmin.body.user.organization.id;

    const stamp = Date.now().toString().slice(-6);
    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: `PG${stamp}`,
        name: 'Ingress fixture',
        description: 'Created by support-ingress.e2e-spec.ts',
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
          userId: developer2.body.user.id,
          role: 'DEVELOPER',
          responsibilities: ['Frontend'],
        },
      ],
      skipDuplicates: true,
    });
    // The API developer owns the API area, so a correctly routed ingress ticket reaches them.
    await api()
      .put(`/api/v1/projects/${projectId}/support-ownership`)
      .set('Authorization', bearer(pm))
      .send({
        primaryDeveloperId: developer2.body.user.id,
        moduleOwners: { API: apiDev.body.user.id },
        autoRouteEnabled: true,
        directTypes: [],
      })
      .expect(200);

    const foreign = await prisma.organization.findFirstOrThrow({ where: { slug: 'grouphr' } });
    const other = await prisma.project.create({
      data: {
        organizationId: foreign.id,
        code: `PF${stamp}`,
        name: 'Another tenant',
        description: 'Created by support-ingress.e2e-spec.ts',
        type: 'INTERNAL_WORK',
        status: 'ACTIVE',
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    foreignProjectId = other.id;

    const created = await api()
      .post('/api/v1/products')
      .set('Authorization', bearer(pm))
      .send({
        code: `CLX${stamp}`,
        name: 'Carelix',
        projectId,
        supportRequesterId: clientAdmin.body.user.id,
        allowedWorkAreas: ['API', 'Frontend'],
        // Off by default so these tests drive the router themselves. The one test that proves
        // the hand-off turns it on for the length of that test and turns it back off.
        autoRouteEnabled: false,
      })
      .expect(201);
    productId = created.body.id;
    createdProductIds.push(productId);

    const credential = await api()
      .post(`/api/v1/products/${productId}/credentials`)
      .set('Authorization', bearer(pm))
      .send({ label: 'Carelix production' })
      .expect(201);
    secret = credential.body.secret;
  });

  afterAll(async () => {
    await prisma.supportIngressRequest.deleteMany({
      where: { productId: { in: createdProductIds } },
    });
    await prisma.file.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketRoutingTrail.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketRoutingState.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.comment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketSla.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.slaEvent.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await prisma.externalRequester.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.productCredential.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.supportOwnership.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: { in: [projectId, foreignProjectId] } } });
    await app.close();
  });

  describe('the credential', () => {
    it('shows the secret once and never again', async () => {
      expect(secret).toMatch(/^ask_[0-9a-f]+\.[A-Za-z0-9_-]+$/);
      const detail = await api()
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      // The stored form is a hash, so there is nothing left to return even to an administrator.
      const serialized = JSON.stringify(detail.body);
      expect(serialized).not.toContain(secret.split('.')[1]);
      expect(detail.body.credentials[0]).not.toHaveProperty('secret');
      expect(detail.body.credentials[0]).not.toHaveProperty('secretHash');
    });

    it('refuses a request with no credential, a malformed one, or a wrong secret', async () => {
      await api().post('/api/v1/support/tickets').send(payload()).expect(401);
      await asProduct('not-a-credential').send(payload()).expect(401);
      const [keyPart] = secret.split('.');
      await asProduct(`${keyPart}.wrong-secret`).send(payload()).expect(401);
    });

    it('does not accept an employee token on the ingress', async () => {
      // A person's token is not a product. The two are authenticated by different mechanisms and
      // neither should be usable where the other belongs.
      await api()
        .post('/api/v1/support/tickets')
        .set('Authorization', bearer(pm))
        .send(payload())
        .expect(401);
    });
  });

  describe('raising a ticket', () => {
    it('creates a Desk ticket scoped to the product’s own project and client', async () => {
      const response = await raise();
      expect(response.status).toBe(201);
      // The raise answer speaks the same client-visible vocabulary as the status read that
      // follows it; the internal enum is not the calling product's business either way.
      expect(response.body).toMatchObject({
        duplicate: false,
        status: CLIENT_VISIBLE_STATUS.RECEIVED,
      });

      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: response.body.ticketId },
        include: { externalRequester: true },
      });
      expect({
        organizationId: ticket.organizationId,
        clientOrganizationId: ticket.clientOrganizationId,
        projectId: ticket.projectId,
        productId: ticket.productId,
        source: ticket.source,
        externalReference: ticket.externalReference,
      }).toEqual({
        organizationId: providerOrgId,
        clientOrganizationId: clientOrgId,
        projectId,
        productId,
        source: 'API',
        externalReference: 'CLX-9001',
      });
      // The real reporter is preserved without a Desk account being invented for them.
      expect(ticket.externalRequester).toMatchObject({
        externalId: 'carelix-user-42',
        name: 'Meera P',
        email: 'meera@example.com',
      });
    });

    it('ignores an organization or project the caller tries to name', async () => {
      const response = await raise({
        organizationId: 'not-mine',
        clientOrganizationId: zenithAdmin.body.user.organization.id,
        projectId: foreignProjectId,
        productId: 'somebody-else',
      });
      // Unknown fields are stripped by validation rather than honoured.
      expect(response.status).toBe(400);
    });

    /**
     * Two separate claims, kept separate on purpose.
     *
     * The ingress *hands the ticket to* the router; the router then places it. Asserting both in
     * one test means waiting on a background worker, and a test that waits on a worker is a test
     * whose result depends on how busy the machine is. So this one proves the hand-off, and the
     * next proves the placement — neither races anything.
     */
    it('hands the ticket to the router rather than routing it itself', async () => {
      // The queue is paused so the job is still there to be looked at. Without this the worker
      // may consume it first, and the test would be racing the thing it is trying to observe.
      await routingQueue.pause();
      await patchProduct({ autoRouteEnabled: true });
      try {
        const response = await raise();
        const queued = await routingQueue.getJobs(['wait', 'waiting', 'delayed', 'paused']);
        const mine = queued.filter(
          (job) => (job.data as { ticketId?: string }).ticketId === response.body.ticketId,
        );
        expect(mine).toHaveLength(1);
        expect(mine[0]?.name).toBe('route-ticket');
        expect(mine[0]?.data).toEqual({
          organizationId: providerOrgId,
          ticketId: response.body.ticketId,
        });
        await mine[0]?.remove();
      } finally {
        await patchProduct({ autoRouteEnabled: false });
        await routingQueue.resume();
      }
    });

    it('routes through the same engine an internal ticket uses', async () => {
      const response = await raise();
      // Routed here rather than by the worker: with automatic routing off no job is queued, so
      // there is nothing to race and the outcome is the router's alone.
      const result = await router.route(providerOrgId, response.body.ticketId);
      expect(result.applied).toBe(true);
      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: response.body.ticketId },
      });
      // The API work area belongs to the API developer, not to the primary.
      expect({ assignedToId: ticket.assignedToId, status: ticket.status }).toEqual({
        assignedToId: apiDev.body.user.id,
        status: TICKET_STATUS.AUTO_ASSIGNED,
      });
      const trail = await prisma.ticketRoutingTrail.count({
        where: { ticketId: response.body.ticketId },
      });
      expect(trail).toBeGreaterThan(0);
    });

    it('refuses a work area the product may not raise against', async () => {
      const response = await raise({ module: 'Payroll' });
      expect(response.status).toBe(400);
    });

    it('applies the product’s defaults when the caller states nothing', async () => {
      await patchProduct({ defaultPriority: 'HIGH', defaultType: 'OUTAGE' });
      const response = await raise({ priority: undefined, type: undefined });
      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: response.body.ticketId },
      });
      expect({ priority: ticket.priority, type: ticket.type }).toEqual({
        priority: 'HIGH',
        type: 'OUTAGE',
      });
      await patchProduct({ defaultPriority: 'MEDIUM', defaultType: 'SUPPORT' });
    });

    it('bounds the metadata a caller may attach', async () => {
      const tooMany = Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`k${index}`, 'v']),
      );
      await raise({ metadata: tooMany }).then((response) => expect(response.status).toBe(400));
      await raise({ metadata: { note: 'x'.repeat(2000) } }).then((response) =>
        expect(response.status).toBe(400),
      );
    });
  });

  describe('the switches', () => {
    afterEach(async () => {
      await patchProduct({ supportEnabled: true, isActive: true, autoRouteEnabled: false });
    });

    it('refuses when support is switched off for the product', async () => {
      await patchProduct({ supportEnabled: false });
      const response = await raise();
      expect(response.status).toBe(403);
    });

    it('refuses when the product itself is inactive', async () => {
      await patchProduct({ isActive: false });
      // Inactive is an authentication-level refusal: the credential no longer resolves.
      const response = await raise();
      expect(response.status).toBe(401);
    });

    it('creates the ticket unrouted when automatic routing is off', async () => {
      await patchProduct({ autoRouteEnabled: false });
      await routingQueue.pause();
      const response = await raise();
      expect(response.status).toBe(201);
      // Not merely unassigned: nothing was even asked of the router, which is the difference
      // between "nobody was available" and "this product does not want automatic routing".
      const queued = await routingQueue.getJobs(['wait', 'waiting', 'delayed', 'paused']);
      expect(
        queued.filter(
          (job) => (job.data as { ticketId?: string }).ticketId === response.body.ticketId,
        ),
      ).toHaveLength(0);
      await routingQueue.resume();
      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: response.body.ticketId },
      });
      // Safe rather than assigned: it is in the queue, visible, and nobody has been guessed at.
      expect({ assignedToId: ticket.assignedToId, status: ticket.status }).toEqual({
        assignedToId: null,
        status: TICKET_STATUS.NEW,
      });
    });
  });

  describe('revocation', () => {
    it('stops a revoked credential immediately', async () => {
      const issued = await api()
        .post(`/api/v1/products/${productId}/credentials`)
        .set('Authorization', bearer(pm))
        .send({ label: 'To be revoked' })
        .expect(201);
      const throwaway = issued.body.secret as string;
      await asProduct(throwaway).send(payload()).expect(201);

      await api()
        .delete(`/api/v1/products/${productId}/credentials/${issued.body.credential.id}`)
        .set('Authorization', bearer(pm))
        .expect(200);

      await asProduct(throwaway).send(payload()).expect(401);
    });

    it('gives rotation a new secret and retires the old one', async () => {
      const issued = await api()
        .post(`/api/v1/products/${productId}/credentials`)
        .set('Authorization', bearer(pm))
        .send({ label: 'To be rotated' })
        .expect(201);
      const before = issued.body.secret as string;

      const rotated = await api()
        .post(`/api/v1/products/${productId}/credentials/${issued.body.credential.id}/rotate`)
        .set('Authorization', bearer(pm))
        .expect(201);
      const after = rotated.body.secret as string;

      expect(after).not.toBe(before);
      await asProduct(before).send(payload()).expect(401);
      await asProduct(after).send(payload()).expect(201);
    });
  });

  describe('idempotency', () => {
    it('returns the same ticket when a request is retried', async () => {
      const key = `retry-${Date.now()}`;
      const first = await raise({}, key);
      const second = await raise({}, key);

      expect(first.status).toBe(201);
      expect(second.body.ticketId).toBe(first.body.ticketId);
      expect(second.body.duplicate).toBe(true);

      const count = await prisma.ticket.count({
        where: { productId, externalReference: 'CLX-9001', id: first.body.ticketId },
      });
      expect(count).toBe(1);
    });

    it('makes one ticket when two identical requests arrive at once', async () => {
      const key = `concurrent-${Date.now()}`;
      const [a, b] = await Promise.all([raise({}, key), raise({}, key)]);

      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.ticketId).toBe(b.body.ticketId);
      // Exactly one claim row, and therefore exactly one ticket.
      const claims = await prisma.supportIngressRequest.count({
        where: { productId, idempotencyKey: key },
      });
      expect(claims).toBe(1);
    });

    it('scopes the key to the product, so two products may use the same one', async () => {
      const stamp = Date.now().toString().slice(-6);
      const other = await api()
        .post('/api/v1/products')
        .set('Authorization', bearer(pm))
        .send({
          code: `IRI${stamp}`,
          name: 'Irista',
          projectId,
          supportRequesterId: clientAdmin.body.user.id,
        })
        .expect(201);
      createdProductIds.push(other.body.id);
      const otherCredential = await api()
        .post(`/api/v1/products/${other.body.id}/credentials`)
        .set('Authorization', bearer(pm))
        .send({ label: 'Irista' })
        .expect(201);

      const key = `shared-${Date.now()}`;
      const mine = await raise({}, key);
      const theirs = await api()
        .post('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${otherCredential.body.secret}`)
        .set('Idempotency-Key', key)
        .send(payload())
        .expect(201);
      createdTicketIds.push(theirs.body.ticketId);

      expect(theirs.body.ticketId).not.toBe(mine.body.ticketId);
    });
  });

  describe('attachments', () => {
    it('stores a screenshot against the right ticket and tenant', async () => {
      // A one-pixel PNG, which is a real image rather than a string pretending to be one.
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const response = await raise({
        attachments: [{ filename: 'screen shot.png', contentType: 'image/png', content: png }],
      });
      expect(response.status).toBe(201);

      const files = await prisma.file.findMany({ where: { ticketId: response.body.ticketId } });
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({ organizationId: providerOrgId, contentType: 'image/png' });
      // The key is composed by the server and begins with the owning tenant, so one product's
      // objects cannot be addressed from another's.
      expect(files[0]?.storageKey.startsWith(`${providerOrgId}/${productId}/`)).toBe(true);
      expect(files[0]?.name).not.toContain('/');
    });

    it('refuses a file type the product does not accept', async () => {
      const response = await raise({
        attachments: [
          {
            filename: 'run.sh',
            contentType: 'application/x-sh',
            content: Buffer.from('id').toString('base64'),
          },
        ],
      });
      expect(response.status).toBe(400);
    });
  });

  describe('reading a ticket back', () => {
    it('gives the caller its own ticket without a word about the inside', async () => {
      const created = await raise();
      const ticketId = created.body.ticketId as string;
      // Routed explicitly so the leak assertion below runs against a ticket that really does
      // have an assignee — an unassigned one could not leak the assignee's id.
      await router.route(providerOrgId, ticketId);
      await prisma.comment.createMany({
        data: [
          {
            organizationId: providerOrgId,
            ticketId,
            authorId: pm.body.user.id,
            body: 'Public: we are looking into this.',
            visibility: 'CLIENT',
          },
          {
            organizationId: providerOrgId,
            ticketId,
            authorId: pm.body.user.id,
            body: 'Internal: Arjun is on it, the fix is in staging.',
            visibility: 'INTERNAL',
          },
        ],
      });

      const response = await api()
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${secret}`)
        .expect(200);

      const body = JSON.stringify(response.body);
      expect(response.body.updates).toHaveLength(1);
      expect(body).toContain('Public: we are looking into this.');
      // None of the inside of the ticket reaches the caller.
      expect(body).not.toContain('Internal:');
      expect(body).not.toContain(apiDev.body.user.id);
      expect(body).not.toContain('assignedTo');
      expect(body).not.toContain('trail');
    });

    it('does not let one product read another’s ticket', async () => {
      const mine = await raise();
      const stamp = Date.now().toString().slice(-5);
      const other = await api()
        .post('/api/v1/products')
        .set('Authorization', bearer(pm))
        .send({
          code: `OTH${stamp}`,
          name: 'Another product',
          projectId,
          supportRequesterId: clientAdmin.body.user.id,
        })
        .expect(201);
      createdProductIds.push(other.body.id);
      const otherCredential = await api()
        .post(`/api/v1/products/${other.body.id}/credentials`)
        .set('Authorization', bearer(pm))
        .send({ label: 'Other' })
        .expect(201);

      await api()
        .get(`/api/v1/support/tickets/${mine.body.ticketId}`)
        .set('Authorization', `Bearer ${otherCredential.body.secret}`)
        .expect(404);
    });
  });

  describe('the registry itself', () => {
    it('will not point a product at another organization’s project', async () => {
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ projectId: foreignProjectId })
        .expect(400);
    });

    it('refuses a duplicate code', async () => {
      const detail = await api()
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      await api()
        .post('/api/v1/products')
        .set('Authorization', bearer(pm))
        .send({ code: detail.body.code, name: 'Clash' })
        .expect(400);
    });

    it('keeps the registry away from client users', async () => {
      await api().get('/api/v1/products').set('Authorization', bearer(clientAdmin)).expect(403);
      await api()
        .post('/api/v1/products')
        .set('Authorization', bearer(clientAdmin))
        .send({ code: 'NOPE', name: 'No' })
        .expect(403);
    });

    it('does not let a developer issue a credential', async () => {
      await api()
        .post(`/api/v1/products/${productId}/credentials`)
        .set('Authorization', bearer(apiDev))
        .send({ label: 'Should not work' })
        .expect(403);
    });

    it('audits the switches by name rather than as an anonymous update', async () => {
      await patchProduct({ ivrEnabled: true });
      const audited = await prisma.auditLog.findFirst({
        where: { entityId: productId, action: 'product.support_toggled' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audited?.after).toMatchObject({ ivrEnabled: true });
      await patchProduct({ ivrEnabled: false });
    });

    it('never writes a secret into the audit trail', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { entityId: productId },
        select: { after: true, before: true },
      });
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toContain(secret.split('.')[1]);
    });
  });
});
