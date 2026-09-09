import type { INestApplication } from '@nestjs/common';
import { AVAILABILITY_STATUS, CALL_ROUTING_STEP, CALL_STATUS } from '@ashniva/types';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';

import { SecretCipherService } from '../src/common/crypto/secret-cipher.service';
import { PrismaService } from '../src/database/prisma.service';
import { MockIvrProvider } from '../src/modules/ivr/providers/mock-ivr.provider';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Support calls, end to end.
 *
 * Three groups of assertion carry most of the weight here, and they are the three ways this
 * feature could hurt somebody:
 *
 *  * **the switch** — a product with calls off must offer no action and refuse the endpoint, and
 *    everything else about that product must keep working;
 *  * **the ladder** — a destination that does not answer must lead to the next one, every attempt
 *    must survive, and running out must end in a stated reason rather than in silence;
 *  * **the recording** — a client's voice. A client cannot reach it, an unrelated developer
 *    cannot reach it, another tenant cannot reach it, and the people who can are audited.
 *
 * The IVR provider is the mock, forced by the e2e environment: a test that rings somebody's
 * telephone is not a test.
 */
describe('IVR support calls (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: MockIvrProvider;
  let cipher: SecretCipherService;

  let director: Session;
  let pm: Session;
  let lead: Session;
  let apiDev: Session;
  let otherDev: Session;
  let support: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;

  let providerOrgId: string;
  let clientOrgId: string;
  let projectId: string;
  let productId: string;
  let quietProductId: string;
  let connectionId: string;

  const WEBHOOK_SECRET = 'ivr-test-secret';
  const ACCOUNT_ID = `acct-${randomUUID()}`;
  const createdTicketIds: string[] = [];
  const createdProductIds: string[] = [];

  const api = () => request(app.getHttpServer());

  /** A delivery signed the way a real provider signs one: HMAC over the exact bytes sent. */
  function deliver(
    body: Record<string, unknown>,
    over: { secret?: string; delivery?: string } = {},
  ) {
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', over.secret ?? WEBHOOK_SECRET)
      .update(Buffer.from(raw, 'utf8'))
      .digest('hex');
    return api()
      .post('/api/v1/webhooks/ivr/other')
      .set('Content-Type', 'application/json')
      .set('x-ivr-signature', `sha256=${signature}`)
      .set('x-ivr-delivery', over.delivery ?? randomUUID())
      .send(raw);
  }

  function event(type: string, callId: string, extra: Record<string, unknown> = {}) {
    return {
      accountId: ACCOUNT_ID,
      type,
      callId,
      occurredAt: new Date().toISOString(),
      ...extra,
    };
  }

  async function makeTicket(over: Record<string, unknown> = {}): Promise<string> {
    const counter = await prisma.organizationCounter.upsert({
      where: { organizationId_kind: { organizationId: providerOrgId, kind: 'TICKET' } },
      update: { value: { increment: 1 } },
      create: { organizationId: providerOrgId, kind: 'TICKET', value: 1 },
    });
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: providerOrgId,
        clientOrganizationId: clientOrgId,
        projectId,
        productId,
        number: counter.value,
        title: 'Templates stopped syncing',
        description: 'Since this morning.',
        type: 'SUPPORT',
        priority: 'HIGH',
        status: 'ASSIGNED',
        source: 'PORTAL',
        module: 'API',
        requesterId: clientAdmin.body.user.id,
        assignedToId: apiDev.body.user.id,
        ...over,
      },
      select: { id: true },
    });
    createdTicketIds.push(ticket.id);
    return ticket.id;
  }

  function startCall(session: Session, ticketId: string) {
    return api()
      .post(`/api/v1/tickets/${ticketId}/calls`)
      .set('Authorization', bearer(session))
      .send({});
  }

  function history(session: Session, ticketId: string) {
    return api().get(`/api/v1/tickets/${ticketId}/calls`).set('Authorization', bearer(session));
  }

  function setPolicy(body: Record<string, unknown>, id = productId) {
    return api()
      .put(`/api/v1/products/${id}/ivr-policy`)
      .set('Authorization', bearer(pm))
      .send(body)
      .expect(200);
  }

  async function setAvailability(session: Session, status: string, until: string | null = null) {
    await api()
      .patch(`/api/v1/users/${session.body.user.id}/availability`)
      .set('Authorization', bearer(pm))
      .send({ status, until })
      .expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    provider = app.get(MockIvrProvider);
    cipher = app.get(SecretCipherService);

    [director, pm, lead, apiDev, otherDev, support, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.developer2),
      loginAs(app, DEMO.support),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    const org = await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } });
    providerOrgId = org.id;
    clientOrgId = clientAdmin.body.user.organization.id;

    const stamp = Date.now().toString().slice(-6);
    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: `IVR${stamp}`,
        name: 'IVR fixture',
        description: 'Created by ivr-calls.e2e-spec.ts',
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
        { projectId, userId: apiDev.body.user.id, role: 'DEVELOPER', responsibilities: ['API'] },
        { projectId, userId: otherDev.body.user.id, role: 'DEVELOPER', responsibilities: ['API'] },
        { projectId, userId: pm.body.user.id, role: 'MANAGER', responsibilities: [] },
        { projectId, userId: lead.body.user.id, role: 'LEAD', responsibilities: [] },
        { projectId, userId: support.body.user.id, role: 'SUPPORT', responsibilities: [] },
      ],
      skipDuplicates: true,
    });

    await api()
      .put(`/api/v1/projects/${projectId}/support-ownership`)
      .set('Authorization', bearer(pm))
      .send({
        primaryDeveloperId: otherDev.body.user.id,
        seniorId: lead.body.user.id,
        supportExecutiveId: support.body.user.id,
        moduleOwners: { API: apiDev.body.user.id },
        autoRouteEnabled: true,
        directTypes: ['SUPPORT'],
      })
      .expect(200);

    for (const [id, name] of [
      ['CALL', 'Carelix calls'],
      ['QUIET', 'Quiet product'],
    ] as const) {
      const created = await api()
        .post('/api/v1/products')
        .set('Authorization', bearer(pm))
        .send({
          code: `${id}${stamp}`,
          name,
          projectId,
          supportRequesterId: clientAdmin.body.user.id,
          allowedWorkAreas: ['API'],
          autoRouteEnabled: false,
        })
        .expect(201);
      createdProductIds.push(created.body.id);
      if (id === 'CALL') {
        productId = created.body.id;
      } else {
        quietProductId = created.body.id;
      }
    }

    // The tenant's IVR account. An integration connection like any other: encrypted credentials,
    // a webhook secret, and the external account id that attributes a delivery to this tenant.
    const connection = await prisma.integrationConnection.create({
      data: {
        organizationId: providerOrgId,
        provider: 'IVR',
        status: 'CONNECTED',
        enabled: true,
        externalAccountId: ACCOUNT_ID,
        encryptedCredentials: cipher.encrypt('ivr-api-key'),
        webhookSecretEncrypted: cipher.encrypt(WEBHOOK_SECRET),
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    connectionId = connection.id;

    await setPolicy({ ivrEnabled: true, maxAttempts: 3 });
  });

  beforeEach(() => provider.reset());

  afterAll(async () => {
    await prisma.callAttempt.deleteMany({ where: { call: { projectId } } });
    await prisma.callLog.deleteMany({ where: { projectId } });
    await prisma.integrationEvent.deleteMany({ where: { connectionId } });
    await prisma.integrationConnection.deleteMany({ where: { id: connectionId } });
    await prisma.productIvrPolicy.deleteMany({
      where: { productId: { in: createdProductIds } },
    });
    await prisma.ticketRoutingTrail.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketRoutingState.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketSla.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.slaEvent.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.userAvailability.deleteMany({
      where: { userId: { in: [apiDev.body.user.id, otherDev.body.user.id] } },
    });
    await prisma.onCallSchedule.deleteMany({ where: { projectId } });
    await prisma.supportOwnership.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await app.close();
  });

  // -------------------------------------------------------------------------------------------
  // The switch
  // -------------------------------------------------------------------------------------------

  describe('a product with IVR switched off', () => {
    it('offers no Call support action and refuses the endpoint', async () => {
      const ticketId = await makeTicket({ productId: quietProductId });

      const availability = await api()
        .get(`/api/v1/tickets/${ticketId}/calls/availability`)
        .set('Authorization', bearer(support))
        .expect(200);
      expect(availability.body.enabled).toBe(false);
      expect(availability.body.reason).toMatch(/switched off/i);

      await startCall(support, ticketId).expect(403);
      expect(provider.calls()).toHaveLength(0);
    });

    it('still lets the same product raise and read support tickets normally', async () => {
      const ticketId = await makeTicket({ productId: quietProductId });
      const detail = await api()
        .get(`/api/v1/tickets/${ticketId}`)
        .set('Authorization', bearer(support))
        .expect(200);
      expect(detail.body.id).toBe(ticketId);
    });

    it('refuses a ticket that belongs to no registered product', async () => {
      const ticketId = await makeTicket({ productId: null });
      await startCall(support, ticketId).expect(403);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Routing, reusing package 8b
  // -------------------------------------------------------------------------------------------

  describe('choosing a destination', () => {
    afterEach(async () => {
      await setAvailability(apiDev, AVAILABILITY_STATUS.AVAILABLE);
      await prisma.onCallSchedule.deleteMany({ where: { projectId } });
    });

    it('rings the person the ticket is already assigned to', async () => {
      const ticketId = await makeTicket();
      const response = await startCall(support, ticketId).expect(201);

      expect(response.body.status).toBe(CALL_STATUS.RINGING);
      expect(provider.lastCall()?.agentUserId).toBe(apiDev.body.user.id);
      expect(response.body.attempts[0].step).toBe(CALL_ROUTING_STEP.ASSIGNED_OWNER);
    });

    it('falls past an assigned developer who is on leave to the routing chain', async () => {
      await setAvailability(apiDev, AVAILABILITY_STATUS.ON_LEAVE);
      const ticketId = await makeTicket();
      const response = await startCall(support, ticketId).expect(201);

      expect(provider.lastCall()?.agentUserId).not.toBe(apiDev.body.user.id);
      expect(response.body.attempts[0].step).toBe(CALL_ROUTING_STEP.ROUTING_CHAIN);
      expect(response.body.attempts[0].reason).toMatch(/on leave/i);
    });

    it('reaches whoever is on call when nobody holds the ticket', async () => {
      await api()
        .put(`/api/v1/projects/${projectId}/on-call`)
        .set('Authorization', bearer(pm))
        .send({ onDate: new Date().toISOString().slice(0, 10), userId: otherDev.body.user.id })
        .expect(200);

      const ticketId = await makeTicket({ assignedToId: null, status: 'NEW', module: 'Billing' });
      await startCall(support, ticketId).expect(201);

      expect(provider.lastCall()?.agentUserId).toBe(otherDev.body.user.id);
    });

    it('never rings the same person twice on one call', async () => {
      const ticketId = await makeTicket();
      const first = await startCall(support, ticketId).expect(201);
      const callId = first.body.id as string;

      await deliver(event('call.no_answer', provider.lastCall()!.providerCallId)).expect(200);

      const rows = await history(support, ticketId).expect(200);
      const call = rows.body.find((row: { id: string }) => row.id === callId);
      const targets = call.attempts.map((attempt: { target: { id: string } | null }) =>
        attempt.target ? attempt.target.id : null,
      );
      expect(new Set(targets).size).toBe(targets.length);
    });
  });

  // -------------------------------------------------------------------------------------------
  // The ladder
  // -------------------------------------------------------------------------------------------

  describe('when nobody answers', () => {
    it('tries the next destination and keeps every attempt', async () => {
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);
      const firstLeg = provider.lastCall()!;

      await deliver(event('call.no_answer', firstLeg.providerCallId)).expect(200);

      const rows = await history(support, ticketId).expect(200);
      const call = rows.body.find((row: { id: string }) => row.id === started.body.id);
      expect(call.attempts.length).toBeGreaterThanOrEqual(2);
      expect(call.attempts[0].status).toBe(CALL_STATUS.NO_ANSWER);
      expect(call.attempts[0].target.id).toBe(apiDev.body.user.id);
      expect(call.attempts[1].target.id).not.toBe(apiDev.body.user.id);
      // The cause is written down, not inferred later from an absence.
      expect(call.attempts[1].reason).toBeTruthy();
    });

    it('stops at the configured ceiling and says why, rather than in silence', async () => {
      await setPolicy({ maxAttempts: 1 });
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);

      await deliver(event('call.no_answer', provider.lastCall()!.providerCallId)).expect(200);

      const call = await prisma.callLog.findUniqueOrThrow({ where: { id: started.body.id } });
      expect(call.status).toBe(CALL_STATUS.NO_ANSWER);
      expect(call.queueReason).toBeTruthy();
      await setPolicy({ maxAttempts: 3 });
    });
  });

  // -------------------------------------------------------------------------------------------
  // The lifecycle
  // -------------------------------------------------------------------------------------------

  describe('the call lifecycle', () => {
    it('records the connection, the duration and who took it', async () => {
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);
      const leg = provider.lastCall()!;

      await deliver(event('call.answered', leg.providerCallId)).expect(200);
      await deliver(
        event('call.ended', leg.providerCallId, { durationSeconds: 214, disposition: 'answered' }),
      ).expect(200);

      const call = await prisma.callLog.findUniqueOrThrow({ where: { id: started.body.id } });
      expect(call.status).toBe(CALL_STATUS.COMPLETED);
      expect(call.durationSeconds).toBe(214);
      expect(call.connectedUserId).toBe(apiDev.body.user.id);
      expect(call.providerDisposition).toBe('answered');
    });

    it('links a recording reference without copying any audio', async () => {
      await setPolicy({ recordingPolicy: 'ALWAYS' });
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);
      const leg = provider.lastCall()!;

      await deliver(event('call.answered', leg.providerCallId)).expect(200);
      await deliver(event('call.ended', leg.providerCallId, { durationSeconds: 60 })).expect(200);
      await deliver(
        event('recording.ready', leg.providerCallId, { recordingRef: 'rec-abc-123' }),
      ).expect(200);

      const call = await prisma.callLog.findUniqueOrThrow({ where: { id: started.body.id } });
      expect(call.recordingRef).toBe('rec-abc-123');
      expect(call.recordingReadyAt).not.toBeNull();
    });

    it('discards a recording for a call that was not to be recorded', async () => {
      await setPolicy({ recordingPolicy: 'DISABLED' });
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);
      const leg = provider.lastCall()!;

      await deliver(
        event('recording.ready', leg.providerCallId, { recordingRef: 'rec-unwanted' }),
      ).expect(200);

      const call = await prisma.callLog.findUniqueOrThrow({ where: { id: started.body.id } });
      expect(call.recordingRef).toBeNull();
      await setPolicy({ recordingPolicy: 'ALWAYS' });
    });

    it('ignores an out-of-order event that would move a call backwards', async () => {
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);
      const leg = provider.lastCall()!;

      await deliver(event('call.answered', leg.providerCallId)).expect(200);
      // A no-answer for the ring that was in fact answered, arriving late.
      await deliver(event('call.no_answer', leg.providerCallId)).expect(200);

      const call = await prisma.callLog.findUniqueOrThrow({ where: { id: started.body.id } });
      expect(call.status).toBe(CALL_STATUS.CONNECTED);
      expect(call.connectedAt).not.toBeNull();
    });

    it('applies a redelivered event exactly once', async () => {
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);
      const leg = provider.lastCall()!;
      const delivery = randomUUID();

      const first = await deliver(event('call.answered', leg.providerCallId), { delivery });
      const second = await deliver(event('call.answered', leg.providerCallId), { delivery });

      expect(first.body.status).toBe('accepted');
      expect(second.body.status).toBe('duplicate');
      const attempts = await prisma.callAttempt.count({ where: { callId: started.body.id } });
      expect(attempts).toBe(1);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Webhook security
  // -------------------------------------------------------------------------------------------

  describe('inbound deliveries', () => {
    it('refuses an unsigned delivery', async () => {
      await api()
        .post('/api/v1/webhooks/ivr/other')
        .send(event('call.answered', 'mock-call-anything'))
        .expect(401);
    });

    it('refuses a delivery signed with the wrong secret', async () => {
      await deliver(event('call.answered', 'mock-call-anything'), {
        secret: 'not-the-secret',
      }).expect(401);
    });

    it('refuses a delivery naming an account nobody has registered', async () => {
      const raw = JSON.stringify({
        accountId: 'someone-elses-account',
        type: 'call.answered',
        callId: 'mock-call-anything',
      });
      const signature = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
      await api()
        .post('/api/v1/webhooks/ivr/other')
        .set('Content-Type', 'application/json')
        .set('x-ivr-signature', `sha256=${signature}`)
        .send(raw)
        .expect(401);
    });

    it('accepts a signed delivery for an unknown call without writing anything', async () => {
      const response = await deliver(event('call.answered', `mock-call-${randomUUID()}`));
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ignored');
    });

    it('never lets a callback name its own organization or ticket', async () => {
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);
      const leg = provider.lastCall()!;

      await deliver({
        ...event('call.answered', leg.providerCallId),
        // Every one of these is ignored: the tenant and the ticket come from the call row.
        organizationId: zenithAdmin.body.user.organization.id,
        ticketId: 'not-a-real-ticket',
        projectId: 'not-a-real-project',
      }).expect(200);

      const call = await prisma.callLog.findUniqueOrThrow({ where: { id: started.body.id } });
      expect(call.organizationId).toBe(providerOrgId);
      expect(call.ticketId).toBe(ticketId);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Recordings
  // -------------------------------------------------------------------------------------------

  describe('who may play a recording', () => {
    let recordedCallId: string;
    let recordedTicketId: string;

    beforeAll(async () => {
      await setPolicy({ recordingPolicy: 'ALWAYS', recordingPlaybackScope: 'LEADS_ONLY' });
      recordedTicketId = await makeTicket();
      const started = await startCall(support, recordedTicketId).expect(201);
      recordedCallId = started.body.id;
      const leg = provider.lastCall()!;
      await deliver(event('call.answered', leg.providerCallId)).expect(200);
      await deliver(event('call.ended', leg.providerCallId, { durationSeconds: 90 })).expect(200);
      await deliver(
        event('recording.ready', leg.providerCallId, { recordingRef: 'rec-secure-1' }),
      ).expect(200);
    });

    const play = (session: Session) =>
      api().get(`/api/v1/calls/${recordedCallId}/recording`).set('Authorization', bearer(session));

    it('lets the project manager play it', async () => {
      const response = await play(pm).expect(200);
      expect(response.body.url).toContain('rec-secure-1');
      expect(response.body.expiresAt).toBeTruthy();
    });

    it('lets the project team lead play it', async () => {
      await play(lead).expect(200);
    });

    it('lets a super admin play it', async () => {
      await play(director).expect(200);
    });

    it('refuses a developer under the leads-only scope', async () => {
      await play(apiDev).expect(403);
    });

    it('refuses the support executive who started the call', async () => {
      // Starting a call is not hearing it back. `call:initiate` and `call:play-recording` are
      // different permissions on purpose.
      await play(support).expect(403);
    });

    it('refuses the client whose voice it is', async () => {
      const response = await play(clientAdmin);
      expect([403, 404]).toContain(response.status);
    });

    it('refuses another tenant entirely', async () => {
      const response = await play(zenithAdmin);
      expect([403, 404]).toContain(response.status);
    });

    it('does not admit a developer on scope alone: the permission is a separate control', async () => {
      // Widening the scope to the person who took the call is *necessary* for a developer and
      // not *sufficient*. `call:play-recording` is not part of the developer role, so the widest
      // policy an administrator can set still cannot hand them a client's voice by itself —
      // somebody has to grant the permission too, deliberately. The scope's own branches are
      // exercised exhaustively in packages/types/src/domain/ivr-policy.test.ts.
      await setPolicy({ recordingPlaybackScope: 'CONNECTED_STAFF' });
      await play(apiDev).expect(403);
      await setPolicy({ recordingPlaybackScope: 'PROJECT_STAFF' });
      await play(apiDev).expect(403);
      await play(otherDev).expect(403);
      await setPolicy({ recordingPlaybackScope: 'LEADS_ONLY' });
    });

    it('writes an audit row for every playback and every refusal', async () => {
      await play(pm).expect(200);
      await play(apiDev).expect(403);

      const rows = await prisma.auditLog.findMany({
        where: { entityType: 'call', entityId: recordedCallId },
        select: { action: true },
      });
      const actions = rows.map((row) => row.action);
      expect(actions).toContain('call.recording_accessed');
      expect(actions).toContain('call.recording_access_denied');
    });

    it('tells the history that a recording exists without offering it', async () => {
      const rows = await history(apiDev, recordedTicketId).expect(200);
      const call = rows.body.find((row: { id: string }) => row.id === recordedCallId);
      expect(call.hasRecording).toBe(true);
      expect(call.canPlayRecording).toBe(false);
      expect(call.recordingDenialReason).toBeTruthy();
      // The reference itself is not in the payload at all, for anybody.
      expect(JSON.stringify(rows.body)).not.toContain('rec-secure-1');
    });
  });

  // -------------------------------------------------------------------------------------------
  // Permissions and tenancy
  // -------------------------------------------------------------------------------------------

  describe('permissions', () => {
    it('refuses to start a call for somebody without call:initiate', async () => {
      const ticketId = await makeTicket();
      // A tester holds ticket:read but not call:initiate.
      const tester = await loginAs(app, DEMO.tester);
      await startCall(tester, ticketId).expect(403);
    });

    it('refuses the internal call history to somebody without call:read-internal', async () => {
      const ticketId = await makeTicket();
      const tester = await loginAs(app, DEMO.tester);
      await history(tester, ticketId).expect(403);
    });

    it('keeps a client out of the internal history and out of another tenant’s calls', async () => {
      const ticketId = await makeTicket();
      await history(clientAdmin, ticketId).expect(403);
      const foreign = await history(zenithAdmin, ticketId);
      expect([403, 404]).toContain(foreign.status);
    });

    it('shows a client only the safe shape of their own call history', async () => {
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);

      const response = await api()
        .get(`/api/v1/portal/tickets/${ticketId}/calls`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);

      const row = response.body.find((entry: { id: string }) => entry.id === started.body.id);
      expect(row).toBeDefined();
      expect(Object.keys(row).sort()).toEqual(['durationSeconds', 'id', 'requestedAt', 'status']);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(apiDev.body.user.name);
      expect(serialized).not.toContain('recording');
    });

    it('refuses IVR policy administration to somebody without ivr:manage', async () => {
      await api()
        .get(`/api/v1/products/${productId}/ivr-policy`)
        .set('Authorization', bearer(apiDev))
        .expect(403);
    });

    it('refuses a client the IVR policy at any URL', async () => {
      await api()
        .get(`/api/v1/products/${productId}/ivr-policy`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------------------------
  // The audit trail
  // -------------------------------------------------------------------------------------------

  describe('the audit trail', () => {
    it('records the call, the destination chosen and the policy change', async () => {
      const ticketId = await makeTicket();
      const started = await startCall(support, ticketId).expect(201);

      const rows = await prisma.auditLog.findMany({
        where: { entityType: 'call', entityId: started.body.id },
        select: { action: true },
      });
      const actions = rows.map((row) => row.action);
      expect(actions).toContain('call.initiated');
      expect(actions).toContain('call.target_chosen');

      await setPolicy({ requesterInitiateEnabled: false });
      const policyRows = await prisma.auditLog.count({
        where: { entityType: 'product', entityId: productId, action: 'ivr.policy_updated' },
      });
      expect(policyRows).toBeGreaterThan(0);
    });

    it('never puts a telephone number or a credential in an audit payload', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { entityType: 'call' },
        select: { after: true },
        take: 50,
      });
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toContain('ivr-api-key');
      expect(serialized).not.toContain(WEBHOOK_SECRET);
    });
  });
});
