import type { INestApplication } from '@nestjs/common';
import { CLIENT_VISIBLE_STATUS, SUPPORT_CALLBACK_HEADERS, TICKET_STATUS } from '@ashniva/types';
import { createHmac } from 'node:crypto';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { MockCallbackTransport } from '../src/modules/support-callbacks/callback-transport';
import { CallbackEmitterService } from '../src/modules/support-callbacks/callback-emitter.service';
import { CallbackSenderService } from '../src/modules/support-callbacks/callback-sender.service';
import { SupportCallbacksProcessor } from '../src/modules/support-callbacks/support-callbacks.processor';
import { TicketRoutingService } from '../src/modules/ticket-routing/ticket-routing.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * The support platform end to end: the widget's authentication model, the outbound callbacks, and
 * what a support tier changes.
 *
 * The assertions that carry the most weight are the negative ones. A widget token that works from
 * the wrong origin, a callback payload with an assignee in it, or a callback URL pointing at
 * loopback are each a hole that no amount of correct behaviour elsewhere makes up for — so each is
 * tested for what it must *refuse*, on the raw bytes where the shape is what matters.
 */
describe('Support platform (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let transport: MockCallbackTransport;
  let sender: CallbackSenderService;
  let emitter: CallbackEmitterService;
  let processor: SupportCallbacksProcessor;
  let router: TicketRoutingService;
  let pm: Session;
  let developer: Session;
  let support: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let clientOrgId: string;
  let projectId: string;
  let productId: string;
  let credential: string;
  let signingSecret: string;
  let slaPolicyId: string;
  const ORIGIN = 'https://app.carelix.example';
  /**
   * A publicly resolvable host, because `SafeHttpService.check` runs for real at save time — that
   * is the point of the SSRF test below. No request is ever made to it: the mock transport records
   * deliveries and opens no socket.
   */
  const CALLBACK_URL = 'https://example.com/hooks/ashniva';
  const createdTicketIds: string[] = [];

  const api = () => request(app.getHttpServer());

  /** A widget call, exactly as a browser would make it: bearer token plus an Origin header. */
  const asWidget = (method: 'get' | 'post', path: string, token: string, origin = ORIGIN) =>
    api()
      [method](`/api/v1/support/widget${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', origin);

  async function mintSession(over: Record<string, unknown> = {}): Promise<string> {
    const response = await api()
      .post('/api/v1/support/widget-sessions')
      .set('Authorization', `Bearer ${credential}`)
      .send({ externalUserId: 'carelix-user-42', origin: ORIGIN, ...over })
      .expect(201);
    return response.body.token as string;
  }

  /** Raises through the widget and asserts the status, so callers get a settled response. */
  async function raiseThroughWidget(
    token: string,
    over: Record<string, unknown> = {},
    expected = 201,
  ) {
    const response = await asWidget('post', '/tickets', token)
      .send({
        title: 'Template sync is failing',
        description: 'Templates stopped syncing after this morning’s update.',
        ...over,
      })
      .expect(expected);
    if (response.body?.ticketId) {
      createdTicketIds.push(response.body.ticketId);
    }
    return response;
  }

  /**
   * Raises with the *server* credential, naming the end user it is for.
   *
   * Used where a test needs a ticket to exist for somebody rather than to exercise the widget's
   * own POST — which is throttled at twenty a minute, deliberately harder than this route, and is
   * a budget the tests that are actually about the widget should get to spend.
   */
  async function raiseThroughServer(externalUserId: string, over: Record<string, unknown> = {}) {
    const response = await api()
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${credential}`)
      .send({
        title: 'Raised from the customer’s server',
        description: 'Templates stopped syncing after this morning’s update.',
        externalUserId,
        ...over,
      })
      .expect(201);
    createdTicketIds.push(response.body.ticketId);
    return response;
  }

  /**
   * Waits for the background worker to settle every delivery this product has queued.
   *
   * The real BullMQ worker is running in this application, so a delivery is genuinely posted by
   * the same code that would post it in production — the mock only replaces the socket. Driving
   * the sender by hand instead would race that worker and prove less.
   */
  async function settledDeliveries(timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // Rows attached to a ticket only: `unqueuedDelivery` creates rows with no queue job behind
      // them, and waiting for those to settle would wait forever.
      const rows = await prisma.supportCallbackDelivery.findMany({
        where: { productId, ticketId: { not: null } },
      });
      const settled = rows.every((row) => row.status !== 'QUEUED' && row.status !== 'SENDING');
      if (rows.length > 0 && settled) {
        return rows;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Callbacks were never delivered');
  }

  /**
   * A delivery row with no queue job behind it.
   *
   * The retry, permanent-failure and stalled-sweep tests drive `CallbackSenderService` directly and
   * would otherwise race the live worker for the same row. Inserting the row here means the only
   * thing touching it is the test.
   */
  async function unqueuedDelivery(event = 'ticket.resolved') {
    return prisma.supportCallbackDelivery.create({
      data: {
        organizationId: providerOrgId,
        productId,
        event,
        idempotencyKey: `${event}:manual:${Math.random().toString(36).slice(2)}`,
        url: CALLBACK_URL,
        payload: { deliveryId: 'manual', event, ticket: { key: 'T-0' } },
      },
    });
  }

  async function setTierPolicy(tier: string, body: Record<string, unknown>): Promise<void> {
    await api()
      .put(`/api/v1/support-tiers/${tier}`)
      .set('Authorization', bearer(pm))
      .send(body)
      .expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    transport = app.get(MockCallbackTransport);
    sender = app.get(CallbackSenderService);
    emitter = app.get(CallbackEmitterService);
    processor = app.get(SupportCallbacksProcessor);
    router = app.get(TicketRoutingService);
    [pm, developer, support, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.support),
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
        code: `SP${stamp}`,
        name: 'Support platform fixture',
        description: 'Created by support-platform.e2e-spec.ts',
        type: 'MONTHLY_CONTRACT',
        status: 'ACTIVE',
        clientOrganizationId: clientOrgId,
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    projectId = project.id;
    await prisma.projectMember.create({
      data: { projectId, userId: developer.body.user.id, role: 'DEVELOPER', responsibilities: [] },
    });
    await api()
      .put(`/api/v1/projects/${projectId}/support-ownership`)
      .set('Authorization', bearer(pm))
      .send({
        primaryDeveloperId: developer.body.user.id,
        autoRouteEnabled: true,
        directTypes: [],
        ackMinutes: 60,
        escalationMinutes: 120,
      })
      .expect(200);

    const created = await api()
      .post('/api/v1/products')
      .set('Authorization', bearer(pm))
      .send({
        code: `SPX${stamp}`,
        name: 'Carelix',
        projectId,
        supportRequesterId: clientAdmin.body.user.id,
        allowedOrigins: [ORIGIN],
        autoRouteEnabled: false,
      })
      .expect(201);
    productId = created.body.id;

    const issued = await api()
      .post(`/api/v1/products/${productId}/credentials`)
      .set('Authorization', bearer(pm))
      .send({ label: 'Carelix production' })
      .expect(201);
    credential = issued.body.secret;

    const sla = await prisma.slaPolicy.create({
      data: {
        organizationId: providerOrgId,
        name: `Priority tier ${stamp}`,
        rules: {
          createMany: {
            data: [
              { priority: 'LOW', firstResponseMinutes: 30, resolutionMinutes: 240 },
              { priority: 'MEDIUM', firstResponseMinutes: 20, resolutionMinutes: 180 },
              { priority: 'HIGH', firstResponseMinutes: 10, resolutionMinutes: 60 },
              { priority: 'CRITICAL', firstResponseMinutes: 5, resolutionMinutes: 30 },
            ],
          },
        },
      },
      select: { id: true },
    });
    slaPolicyId = sla.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.supportCallbackDelivery.deleteMany({ where: { productId } });
    await prisma.productCallbackEndpoint.deleteMany({ where: { productId } });
    await prisma.supportTierPolicy.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.supportIngressRequest.deleteMany({ where: { productId } });
    await prisma.ticketRoutingTrail.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketRoutingState.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.comment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketSla.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.slaEvent.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await prisma.externalRequester.deleteMany({ where: { productId } });
    await prisma.productCredential.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.slaPolicyRule.deleteMany({ where: { policyId: slaPolicyId } });
    await prisma.slaPolicy.deleteMany({ where: { id: slaPolicyId } });
    await prisma.supportOwnership.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await app.close();
  });

  beforeEach(() => {
    transport.reset();
  });

  // -------------------------------------------------------------------------------------------
  // Part A — the browser authentication model
  // -------------------------------------------------------------------------------------------

  describe('minting a widget session', () => {
    it('needs the server credential, not an employee token and not a widget token', async () => {
      await api()
        .post('/api/v1/support/widget-sessions')
        .send({ externalUserId: 'x', origin: ORIGIN })
        .expect(401);
      await api()
        .post('/api/v1/support/widget-sessions')
        .set('Authorization', bearer(pm))
        .send({ externalUserId: 'x', origin: ORIGIN })
        .expect(401);
      const token = await mintSession();
      await api()
        .post('/api/v1/support/widget-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ externalUserId: 'x', origin: ORIGIN })
        .expect(401);
    });

    it('returns a browser-safe token that is not the machine credential', async () => {
      const response = await api()
        .post('/api/v1/support/widget-sessions')
        .set('Authorization', `Bearer ${credential}`)
        .send({ externalUserId: 'carelix-user-42', origin: ORIGIN })
        .expect(201);

      expect(response.body.token).toMatch(/^askp_/);
      // The server credential must not appear anywhere in what reaches a browser.
      expect(JSON.stringify(response.body)).not.toContain(credential.split('.')[1]);
      // Minutes, not hours.
      const ttlMinutes = (Date.parse(response.body.expiresAt) - Date.now()) / 60_000;
      expect(ttlMinutes).toBeGreaterThan(1);
      expect(ttlMinutes).toBeLessThanOrEqual(30);
    });

    it('refuses an origin the product has not registered', async () => {
      await api()
        .post('/api/v1/support/widget-sessions')
        .set('Authorization', `Bearer ${credential}`)
        .send({ externalUserId: 'carelix-user-42', origin: 'https://evil.example.com' })
        .expect(403);
    });

    it('records the external requester so the first ticket already has a name', async () => {
      await mintSession({ externalUserId: 'named-user', name: 'Meera P' });
      const requester = await prisma.externalRequester.findFirstOrThrow({
        where: { productId, externalId: 'named-user' },
      });
      expect(requester.name).toBe('Meera P');
    });
  });

  describe('using a widget session', () => {
    it('raises a ticket for the requester in the token', async () => {
      const token = await mintSession({ externalUserId: 'widget-user-1' });
      const response = await raiseThroughWidget(token);

      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { id: response.body.ticketId },
        include: { externalRequester: true },
      });
      expect(ticket.externalRequester?.externalId).toBe('widget-user-1');
      expect(ticket.productId).toBe(productId);
    });

    /** Four refusals, each proved on its own so a single surviving check cannot mask the others. */
    it('refuses a token used from a different origin', async () => {
      const token = await mintSession();
      await asWidget('post', '/tickets', token, 'https://evil.example.com')
        .send({ title: 'Sync broke', description: 'Templates stopped syncing.' })
        .expect(401);
      await api()
        .post('/api/v1/support/widget/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Sync broke', description: 'Templates stopped syncing.' })
        .expect(401);
    });

    it('refuses a token whose product has had its origin removed', async () => {
      const token = await mintSession();
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ allowedOrigins: [] })
        .expect(200);
      await asWidget('get', '/config', token).expect(401);
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ allowedOrigins: [ORIGIN] })
        .expect(200);
      await asWidget('get', '/config', token).expect(200);
    });

    it('refuses a tampered or foreign token', async () => {
      const token = await mintSession();
      const [claims, signature] = token.slice('askp_'.length).split('.');
      const forged = `askp_${Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(claims ?? '', 'base64url').toString()),
          externalUserId: 'somebody-else',
        }),
      ).toString('base64url')}.${signature}`;

      await asWidget('get', '/config', forged).expect(401);
      await asWidget('get', '/config', 'askp_nonsense.signature').expect(401);
      await asWidget('get', '/config', credential).expect(401);
    });

    it('will not let the browser name its own requester', async () => {
      const token = await mintSession();
      // `externalUserId` is not a field of the widget DTO at all, so sending it is a 400 with a
      // reason rather than a value that is quietly dropped.
      await asWidget('post', '/tickets', token)
        .send({
          title: 'Sync broke',
          description: 'Templates stopped syncing.',
          externalUserId: 'somebody-else',
        })
        .expect(400);
    });

    it('cannot read another product’s ticket, even inside the same tenant', async () => {
      const token = await mintSession();
      const foreign = await prisma.ticket.findFirstOrThrow({
        where: { organizationId: providerOrgId, productId: null, deletedAt: null },
        select: { id: true },
      });
      await asWidget('get', `/tickets/${foreign.id}`, token).expect(404);
    });

    /**
     * The scope the session token exists to pin, on the read path.
     *
     * Product scope alone is not enough here: every end user of one product shares it. A widget
     * session is minted for one person, and if the read is not pinned to that person then any of a
     * product's users can walk uuids and collect everybody else's title, priority, external
     * reference and public replies — the support queue of a whole customer base, from a page
     * anybody can load.
     */
    it('cannot read another end user’s ticket on the same product', async () => {
      const mine = await mintSession({ externalUserId: 'tenant-a-user' });
      const theirs = await mintSession({ externalUserId: 'tenant-b-user' });
      const raised = await raiseThroughServer('tenant-b-user', { title: 'Only B may read this' });
      const ticketId = raised.body.ticketId as string;

      // B may read their own.
      const own = await asWidget('get', `/tickets/${ticketId}`, theirs).expect(200);
      expect(own.body.title).toBe('Only B may read this');

      // A may not, and is told nothing about it — not even that it exists.
      const refused = await asWidget('get', `/tickets/${ticketId}`, mine).expect(404);
      expect(JSON.stringify(refused.body)).not.toContain('Only B may read this');
    });

    /**
     * The same fact on the write path.
     *
     * The idempotency key is chosen entirely by the browser, and integrators pick meaningful ones
     * — `carelix-support-<userId>-<n>` is the shape the SDK's own documentation suggests. So a
     * guessable key must not be a way to be handed somebody else's ticket id as a "duplicate",
     * which is the read above with an extra step.
     */
    it('does not let one end user claim another’s idempotency key', async () => {
      const key = 'carelix-support-shared-key-1';
      const theirs = await mintSession({ externalUserId: 'key-owner' });
      const mine = await mintSession({ externalUserId: 'key-guesser' });

      const first = await asWidget('post', '/tickets', theirs)
        .set('Idempotency-Key', key)
        .send({ title: 'B’s ticket', description: 'Raised by B first.' })
        .expect(201);
      createdTicketIds.push(first.body.ticketId);
      expect(first.body.duplicate).toBe(false);

      // B's own retry is still a retry: the key means the same thing for the same person.
      const retried = await asWidget('post', '/tickets', theirs)
        .set('Idempotency-Key', key)
        .send({ title: 'B’s ticket', description: 'Raised by B first.' })
        .expect(201);
      expect(retried.body).toMatchObject({ ticketId: first.body.ticketId, duplicate: true });

      // A guessing it gets a ticket of their own, and nothing about B's.
      const guessed = await asWidget('post', '/tickets', mine)
        .set('Idempotency-Key', key)
        .send({ title: 'A’s ticket', description: 'Raised by A with B’s key.' })
        .expect(201);
      createdTicketIds.push(guessed.body.ticketId);
      expect(guessed.body.ticketId).not.toBe(first.body.ticketId);
      expect(guessed.body.duplicate).toBe(false);
      expect(guessed.body.key).not.toBe(first.body.key);
    });

    it('answers a preflight for a registered origin and refuses an unregistered one', async () => {
      const allowed = await api()
        .options('/api/v1/support/widget/config')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'GET');
      expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
      // Never `*`, and never with credentials — a reflected origin plus cookies would be a much
      // larger grant than "you may embed our support widget".
      expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();

      const refused = await api()
        .options('/api/v1/support/widget/config')
        .set('Origin', 'https://evil.example.com')
        .set('Access-Control-Request-Method', 'GET');
      expect(refused.headers['access-control-allow-origin']).toBeUndefined();
      // The refusal is per-origin, so it must not be cacheable as if it were not. `cors` writes no
      // headers at all on this path, which without an explicit Vary would let a CDN hand this
      // header-less answer to a registered origin.
      expect(refused.headers.vary).toMatch(/\bOrigin\b/);
      expect(allowed.headers.vary).toMatch(/\bOrigin\b/);
    });

    /**
     * The widget ruleset must not be reachable from another route's query string.
     *
     * The CORS delegate runs before routing, where the URL is still path plus query, so "is this a
     * widget route" is a string test on caller-controlled input. Answered loosely, it hands the
     * widget's rules — reflect any origin any tenant has registered — to the whole first-party API.
     */
    it('does not apply the widget’s CORS rules to another route with a crafted query', async () => {
      const smuggled = await api()
        .get('/api/v1/tickets?ref=/support/widget')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'GET');
      // ORIGIN is a registered *widget* origin and is not on the first-party list, so nothing may
      // be reflected back to it here.
      expect(smuggled.headers['access-control-allow-origin']).toBeUndefined();

      const preflight = await api()
        .options('/api/v1/tickets?ref=/support/widget')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'GET');
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------------------------
  // Part C — outbound callbacks
  // -------------------------------------------------------------------------------------------

  describe('configuring a callback endpoint', () => {
    it('refuses a URL that resolves to a private or loopback address', async () => {
      for (const url of [
        'https://127.0.0.1/hooks',
        'https://localhost/hooks',
        'https://169.254.169.254/latest/meta-data',
        'https://10.0.0.5/hooks',
      ]) {
        const response = await api()
          .put(`/api/v1/products/${productId}/callbacks`)
          .set('Authorization', bearer(pm))
          .send({ url })
          .expect(400);
        expect(response.body.message).toContain('cannot be used');
      }
    });

    it('refuses plain HTTP outright', async () => {
      await api()
        .put(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(pm))
        .send({ url: 'http://hooks.carelix.example/ashniva' })
        .expect(400);
    });

    it('shows the signing secret exactly once, and never again', async () => {
      const created = await api()
        .put(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(pm))
        .send({ url: CALLBACK_URL })
        .expect(200);
      expect(created.body.signingSecret).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      signingSecret = created.body.signingSecret;

      const read = await api()
        .get(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(JSON.stringify(read.body)).not.toContain(signingSecret);
      expect(read.body).not.toHaveProperty('signingSecret');

      // An ordinary edit keeps the secret rather than reissuing it: correcting a typo in a URL
      // must not break the receiver.
      const edited = await api()
        .put(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(pm))
        .send({ url: CALLBACK_URL, events: [] })
        .expect(200);
      expect(edited.body).not.toHaveProperty('signingSecret');
    });

    it('is refused to another tenant and to a client user', async () => {
      await api()
        .get(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(zenithAdmin))
        .expect(403);
      await api()
        .get(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .put(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(developer))
        .send({ url: CALLBACK_URL })
        .expect(403);
    });
  });

  describe('the ingress to callback loop', () => {
    it('delivers ticket.created, signed over the exact bytes it sent', async () => {
      const token = await mintSession({ externalUserId: 'loop-user' });
      const raised = await raiseThroughWidget(token, {
        title: 'Sync broke on the loop',
        description: 'Templates stopped syncing after the update.',
      });
      await settledDeliveries();

      const delivery = transport.delivered.find(
        (request) =>
          request.headers[SUPPORT_CALLBACK_HEADERS.EVENT.toLowerCase()] === 'ticket.created' &&
          JSON.parse(request.body).ticket.ticketId === raised.body.ticketId,
      );
      expect(delivery).toBeDefined();
      expect(delivery?.url).toBe(CALLBACK_URL);

      const timestamp = delivery?.headers[SUPPORT_CALLBACK_HEADERS.TIMESTAMP.toLowerCase()];
      const expected = `sha256=${createHmac('sha256', signingSecret)
        .update(`${timestamp}.${delivery?.body}`)
        .digest('hex')}`;
      expect(delivery?.headers[SUPPORT_CALLBACK_HEADERS.SIGNATURE.toLowerCase()]).toBe(expected);

      const body = JSON.parse(delivery?.body ?? '{}');
      expect(body.deliveryId).toBe(
        delivery?.headers[SUPPORT_CALLBACK_HEADERS.DELIVERY.toLowerCase()],
      );
    });

    /**
     * Asserted on the raw JSON string, not on a parsed object.
     *
     * A parsed assertion can only check the fields somebody thought to name. The point here is
     * that the assignee's name, an internal note and the routing trail are nowhere in the bytes
     * at all — which is a claim about the payload's shape rather than about this one ticket.
     */
    it('never carries an internal note, an assignee or a routing field', async () => {
      const token = await mintSession({ externalUserId: 'privacy-user' });
      const raised = await raiseThroughWidget(token);
      const ticketId = raised.body.ticketId as string;
      transport.reset();

      await api()
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', bearer(pm))
        .send({ body: 'Internal: the sync worker is out of memory', visibility: 'INTERNAL' })
        .expect(201);
      await api()
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', bearer(pm))
        .send({ assignedToId: developer.body.user.id })
        .expect(201);
      await api()
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', bearer(pm))
        .send({ body: 'We are on it — a fix is on the way.', visibility: 'CLIENT' })
        .expect(201);
      await router.route(providerOrgId, ticketId, { force: true });
      await settledDeliveries();

      const mine = transport.delivered.filter(
        (delivery) => JSON.parse(delivery.body).ticket?.ticketId === ticketId,
      );
      expect(mine.length).toBeGreaterThan(0);
      for (const delivery of mine) {
        const raw = delivery.body;
        expect(raw).not.toContain('out of memory');
        expect(raw).not.toContain(developer.body.user.id);
        expect(raw).not.toContain(developer.body.user.name);
        for (const field of [
          'assignedTo',
          'assignee',
          'internal',
          'routing',
          'trail',
          'recording',
          'rca',
          'requesterId',
        ]) {
          expect(raw.toLowerCase()).not.toContain(field.toLowerCase());
        }
      }
      // The public reply is exactly what a client may see, and it did travel.
      expect(mine.some((delivery) => delivery.body.includes('a fix is on the way'))).toBe(true);
    });

    it('sends one delivery per event, and never the same delivery id twice', async () => {
      const token = await mintSession({ externalUserId: 'idempotency-user' });
      const raised = await raiseThroughWidget(token);
      await settledDeliveries();

      const rows = await prisma.supportCallbackDelivery.findMany({
        where: { ticketId: raised.body.ticketId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('SENT');

      // A re-run of the same job sends nothing: `claimForSending` matches QUEUED only, which is
      // what stops a worker killed after the endpoint accepted the request from sending twice.
      const before = transport.delivered.length;
      expect(await sender.deliver(providerOrgId, rows[0]?.id ?? '')).toEqual({ retry: false });
      expect(transport.delivered.length).toBe(before);

      const ids = transport.delivered.map(
        (delivery) => delivery.headers[SUPPORT_CALLBACK_HEADERS.DELIVERY.toLowerCase()],
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    /**
     * The unique index on (organization, idempotency key) is the whole duplicate protection.
     *
     * Emitting the same event twice — which a retried job, a re-run emission or two workers racing
     * all do — must produce one delivery, not two. `claim` inserts first and reads the constraint
     * violation as "somebody else got there", because checking for an existing row and then
     * inserting leaves a window in which both see nothing.
     */
    it('claims one delivery when the same event is emitted twice', async () => {
      const token = await mintSession({ externalUserId: 'duplicate-user' });
      const raised = await raiseThroughWidget(token, { title: 'Emitted twice' });
      const ticketId = raised.body.ticketId as string;
      await settledDeliveries();

      const occurredAt = new Date('2026-09-17T09:00:00.000Z');
      await emitter.ticketStatusChanged(
        providerOrgId,
        ticketId,
        TICKET_STATUS.RESOLVED,
        occurredAt,
      );
      await emitter.ticketStatusChanged(
        providerOrgId,
        ticketId,
        TICKET_STATUS.RESOLVED,
        occurredAt,
      );

      const rows = await prisma.supportCallbackDelivery.findMany({
        where: { ticketId, event: 'ticket.resolved' },
      });
      expect(rows).toHaveLength(1);
    });

    /**
     * The collision above only protects anything if the key a *real* transition produces is
     * deterministic.
     *
     * Every emission point defaults `occurredAt` to `new Date()`, so a transition emitted twice —
     * a retried request, a re-run job, two workers racing — would produce two millisecond-distinct
     * keys and two deliveries of one status change. `TicketTransitionsService.finish` therefore
     * passes the transition's own `updatedAt`, which is the same value however often the emission
     * is repeated.
     */
    it('keys a status callback by the transition’s own timestamp, not by the clock', async () => {
      const raised = await raiseThroughServer('deterministic-user', {
        title: 'Emitted from a real transition',
      });
      const ticketId = raised.body.ticketId as string;
      await settledDeliveries();

      await api()
        .post(`/api/v1/tickets/${ticketId}/assign`)
        .set('Authorization', bearer(pm))
        .send({ assignedToId: developer.body.user.id })
        .expect(201);

      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      const assigned = await prisma.supportCallbackDelivery.findMany({
        where: { ticketId, event: 'ticket.assigned' },
      });
      expect(assigned).toHaveLength(1);
      expect(assigned[0]?.idempotencyKey).toBe(
        `ticket.assigned:${ticketId}:${ticket.updatedAt.toISOString()}`,
      );

      // Emitting that same transition again claims nothing new, which is what the key promises.
      await emitter.ticketStatusChanged(
        providerOrgId,
        ticketId,
        TICKET_STATUS.ASSIGNED,
        ticket.updatedAt,
      );
      const after = await prisma.supportCallbackDelivery.findMany({
        where: { ticketId, event: 'ticket.assigned' },
      });
      expect(after).toHaveLength(1);
    });

    it('retries a failing delivery and then marks it FAILED, never back to QUEUED', async () => {
      const row = await unqueuedDelivery();
      // 503 every time: retryable on each attempt, and the attempts run out on the fifth.
      transport.respondWith(503);

      const verdicts = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        verdicts.push(await sender.deliver(providerOrgId, row.id));
      }
      transport.respondWith(null);
      expect(verdicts.slice(0, 4).every((verdict) => verdict.retry)).toBe(true);
      expect(verdicts[4]?.retry).toBe(false);

      const settled = await prisma.supportCallbackDelivery.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(settled.status).toBe('FAILED');
      expect(settled.attempts).toBe(5);
      expect(settled.responseStatus).toBe(503);
    });

    it('does not retry a permanent refusal', async () => {
      const row = await unqueuedDelivery();
      transport.respondWith(422);
      const verdict = await sender.deliver(providerOrgId, row.id);
      transport.respondWith(null);

      expect(verdict).toEqual({ retry: false });
      const settled = await prisma.supportCallbackDelivery.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(settled.status).toBe('FAILED');
      expect(settled.attempts).toBe(1);
    });

    it('lets an operator redeliver a failed callback with the same delivery id', async () => {
      const row = await unqueuedDelivery();
      transport.respondWith(422);
      await sender.deliver(providerOrgId, row.id);
      transport.reset();

      const response = await api()
        .post(`/api/v1/products/${productId}/callbacks/deliveries/${row.id}/redeliver`)
        .set('Authorization', bearer(pm))
        .expect(201);
      expect(response.body.status).toBe('QUEUED');

      // The same id: receivers are told to deduplicate on it, which is what makes re-queueing the
      // same row safe where resending an email is not.
      const sent = () =>
        transport.delivered.some(
          (delivery) =>
            delivery.headers[SUPPORT_CALLBACK_HEADERS.DELIVERY.toLowerCase()] === row.id,
        );
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && !sent()) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(sent()).toBe(true);
    });

    it('refuses to redeliver one that is still in flight', async () => {
      const row = await unqueuedDelivery();
      await api()
        .post(`/api/v1/products/${productId}/callbacks/deliveries/${row.id}/redeliver`)
        .set('Authorization', bearer(pm))
        .expect(409);
    });

    it('settles a stalled claim as FAILED rather than putting it back in the queue', async () => {
      const row = await unqueuedDelivery();
      await prisma.supportCallbackDelivery.update({
        where: { id: row.id },
        data: { status: 'SENDING', updatedAt: new Date(Date.now() - 60 * 60_000) },
      });

      expect(await processor.sweepStalledClaims()).toBeGreaterThanOrEqual(1);
      const settled = await prisma.supportCallbackDelivery.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(settled.status).toBe('FAILED');
      expect(settled.lastError).toContain('stopped before reporting back');
    });

    it('shows the delivery log to product:read and refuses another tenant', async () => {
      // A support executive holds product:read but not product:manage — the split the controller
      // draws between "did the customer get told" and "where do we tell them".
      await api()
        .get(`/api/v1/products/${productId}/callbacks/deliveries`)
        .set('Authorization', bearer(support))
        .expect(200);
      await api()
        .put(`/api/v1/products/${productId}/callbacks`)
        .set('Authorization', bearer(support))
        .send({ url: CALLBACK_URL })
        .expect(403);
      await api()
        .get(`/api/v1/products/${productId}/callbacks/deliveries`)
        .set('Authorization', bearer(zenithAdmin))
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Part D — support tiers
  // -------------------------------------------------------------------------------------------

  describe('what a support tier changes', () => {
    afterEach(async () => {
      await prisma.supportTierPolicy.deleteMany({ where: { organizationId: providerOrgId } });
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ supportTier: 'STANDARD' })
        .expect(200);
    });

    it('leaves everything as it was for a tier nobody has configured', async () => {
      const tiers = await api()
        .get('/api/v1/support-tiers')
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(tiers.body).toHaveLength(4);
      for (const tier of tiers.body) {
        expect(tier.configured).toBe(false);
        expect(tier.admissionEnabled).toBe(true);
        expect(tier.ackMinutes).toBeNull();
      }
    });

    it('closes the ingress for a tier whose admission is switched off, uniformly', async () => {
      await setTierPolicy('BASIC', { admissionEnabled: false });
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ supportTier: 'BASIC' })
        .expect(200);

      const token = await mintSession({ externalUserId: 'gated-user' });
      const refused = await raiseThroughWidget(token, {}, 403);
      // The same sentence the two switches give: a probe learns it may not raise a ticket, not
      // which of three reasons applies.
      expect(refused.body.message).toBe('Support is not enabled for this product');
    });

    it('changes the acknowledgement and escalation deadlines the router writes', async () => {
      const token = await mintSession({ externalUserId: 'timing-user' });
      const baseline = await raiseThroughWidget(token, { title: 'Baseline timing' });
      await router.route(providerOrgId, baseline.body.ticketId);
      const before = await prisma.ticketRoutingState.findUniqueOrThrow({
        where: { ticketId: baseline.body.ticketId },
      });

      await setTierPolicy('PRIORITY', { ackMinutes: 5, escalationMinutes: 10 });
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ supportTier: 'PRIORITY' })
        .expect(200);

      const priority = await raiseThroughWidget(token, { title: 'Priority timing' });
      await router.route(providerOrgId, priority.body.ticketId);
      const after = await prisma.ticketRoutingState.findUniqueOrThrow({
        where: { ticketId: priority.body.ticketId },
      });

      const minutes = (state: { routedAt: Date | null; acknowledgeDueAt: Date | null }) =>
        Math.round(
          ((state.acknowledgeDueAt?.getTime() ?? 0) - (state.routedAt?.getTime() ?? 0)) / 60_000,
        );
      expect(minutes(before)).toBe(60);
      expect(minutes(after)).toBe(5);
      // Only *when*, never *who*: the trail is still interpretable against policy version 1.
      expect(after.policyVersion).toBe(before.policyVersion);
    });

    it('selects the tier’s SLA policy, above the client’s and the default', async () => {
      const token = await mintSession({ externalUserId: 'sla-user' });
      const before = await raiseThroughWidget(token, { title: 'SLA before' });
      const withoutTier = await prisma.ticketSla.findUnique({
        where: { ticketId: before.body.ticketId },
      });

      await setTierPolicy('ENTERPRISE', { slaPolicyId });
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ supportTier: 'ENTERPRISE' })
        .expect(200);

      // The tier change reapplies open tickets, exactly as an SLA policy edit does.
      const reapplied = await prisma.ticketSla.findUnique({
        where: { ticketId: before.body.ticketId },
      });
      expect(reapplied?.policyId).toBe(slaPolicyId);
      expect(withoutTier?.policyId).not.toBe(slaPolicyId);

      const after = await raiseThroughWidget(token, { title: 'SLA after' });
      const fresh = await prisma.ticketSla.findUnique({ where: { ticketId: after.body.ticketId } });
      expect(fresh?.policyId).toBe(slaPolicyId);
    });

    it('files a ticket at the tier’s minimum priority, and never below the reporter’s', async () => {
      await setTierPolicy('PRIORITY', { minimumPriority: 'HIGH' });
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ supportTier: 'PRIORITY' })
        .expect(200);

      const token = await mintSession({ externalUserId: 'priority-user' });
      const raised = await raiseThroughWidget(token, { priority: 'LOW' });
      const critical = await raiseThroughWidget(token, { priority: 'CRITICAL' });

      const [lifted, kept] = await Promise.all([
        prisma.ticket.findUniqueOrThrow({ where: { id: raised.body.ticketId } }),
        prisma.ticket.findUniqueOrThrow({ where: { id: critical.body.ticketId } }),
      ]);
      expect(lifted.priority).toBe('HIGH');
      expect(kept.priority).toBe('CRITICAL');
    });

    it('records a tier change as its own audit action', async () => {
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ supportTier: 'ENTERPRISE' })
        .expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { entityId: productId, action: 'product.tier_changed' },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry).not.toBeNull();
      expect(entry?.after).toMatchObject({ to: 'ENTERPRISE' });
    });

    it('tells the widget in words why a call is not on offer', async () => {
      await setTierPolicy('BASIC', { callsEnabled: false });
      await api()
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', bearer(pm))
        .send({ supportTier: 'BASIC', ivrEnabled: true })
        .expect(200);

      const token = await mintSession({ externalUserId: 'call-user' });
      const config = await asWidget('get', '/config', token).expect(200);
      expect(config.body.canRequestCall).toBe(false);
      expect(config.body.callUnavailableReason).toContain('basic tier');
      // Still open for tickets: the two gates are separate answers.
      expect(config.body.canRaiseTicket).toBe(true);
    });

    it('is editable only with support-tier:manage, and never across tenants', async () => {
      await api()
        .put('/api/v1/support-tiers/BASIC')
        .set('Authorization', bearer(developer))
        .send({ admissionEnabled: false })
        .expect(403);
      await api()
        .put('/api/v1/support-tiers/BASIC')
        .set('Authorization', bearer(clientAdmin))
        .send({ admissionEnabled: false })
        .expect(403);
      await api()
        .put('/api/v1/support-tiers/BASIC')
        .set('Authorization', bearer(pm))
        .send({ slaPolicyId: '00000000-0000-4000-8000-000000000000' })
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Cross-cutting
  // -------------------------------------------------------------------------------------------

  describe('the widget and the server ingress agree', () => {
    it('returns the same client-safe shape from both, with no internal field in either', async () => {
      const token = await mintSession({ externalUserId: 'shape-user' });
      const raised = await raiseThroughWidget(token);

      const viaWidget = await asWidget('get', `/tickets/${raised.body.ticketId}`, token).expect(
        200,
      );
      const viaServer = await api()
        .get(`/api/v1/support/tickets/${raised.body.ticketId}`)
        .set('Authorization', `Bearer ${credential}`)
        .expect(200);

      expect(Object.keys(viaWidget.body).sort()).toEqual(Object.keys(viaServer.body).sort());
      expect(viaWidget.body).not.toHaveProperty('assignedTo');
      // The client-visible name for a new ticket, not the internal enum it is stored under.
      expect(viaWidget.body.status).toBe(CLIENT_VISIBLE_STATUS.RECEIVED);
    });

    /**
     * How Ashniva routes a ticket is Ashniva's business.
     *
     * The internal vocabulary has states that only describe the inside of the service —
     * AUTO_ASSIGNED, ACKNOWLEDGED, ESCALATED, REVIEW — and they were reaching a customer's own
     * product and its end users on every status poll, and inside the body of every outbound
     * callback. The portal has always mapped through `toClientVisibleTicketStatus`; the widget,
     * the server ingress and the callbacks did not.
     */
    it('never names an internal status to a product, its users or its webhook', async () => {
      const token = await mintSession({ externalUserId: 'status-user' });
      const raised = await raiseThroughWidget(token, { title: 'Routed behind the scenes' });
      const ticketId = raised.body.ticketId as string;
      await settledDeliveries();
      transport.reset();

      // An internal-only state: the router reaches AUTO_ASSIGNED, and the client vocabulary has
      // no such word — a client is told the ticket is assigned, not how it got there.
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TICKET_STATUS.AUTO_ASSIGNED },
      });

      const viaWidget = await asWidget('get', `/tickets/${ticketId}`, token).expect(200);
      const viaServer = await api()
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${credential}`)
        .expect(200);
      expect(viaWidget.body.status).toBe(CLIENT_VISIBLE_STATUS.ASSIGNED);
      expect(viaServer.body.status).toBe(CLIENT_VISIBLE_STATUS.ASSIGNED);

      // And the same object embedded in the callback the customer's server receives.
      await emitter.ticketStatusChanged(providerOrgId, ticketId, TICKET_STATUS.AUTO_ASSIGNED);
      await settledDeliveries();
      const mine = transport.delivered.filter(
        (delivery) => JSON.parse(delivery.body).ticket?.ticketId === ticketId,
      );
      expect(mine.length).toBeGreaterThan(0);
      for (const delivery of mine) {
        expect(JSON.parse(delivery.body).ticket.status).toBe(CLIENT_VISIBLE_STATUS.ASSIGNED);
        // On the raw bytes, because the claim is about the payload rather than one field of it.
        expect(delivery.body).not.toContain(TICKET_STATUS.AUTO_ASSIGNED);
      }
    });
  });
});
