import type { INestApplication } from '@nestjs/common';
import {
  CONVERSATION_KIND,
  INTERNAL_CALL_FALLBACK,
  MESSAGE_EDIT_WINDOW_MINUTES,
  PERMISSIONS,
} from '@ashniva/types';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { RealtimeService } from '../src/infrastructure/realtime/realtime.service';
import { CommunicationGateway } from '../src/modules/communication/communication.gateway';
import { ConversationsRepository } from '../src/modules/communication/conversations.repository';
import { MockIvrProvider } from '../src/modules/ivr/providers/mock-ivr.provider';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Project-scoped internal communication.
 *
 * The assertions that carry the weight are the negative ones, and there are three families:
 *
 *  * **Cross-project.** A developer on one project must not reach a developer on another — not by
 *    creating a conversation, not by reading one, not by posting into one, and not by calling.
 *    Four separate assertions, because an implementation that gets three right and the fourth
 *    wrong is the likely one.
 *  * **Membership removal.** Access must disappear when somebody leaves a project, **with no row
 *    deleted**, which is what proves the permission is computed rather than stored.
 *  * **Clients.** Every endpoint, every time. An internal conversation has no client form.
 */
describe('Internal communication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: MockIvrProvider;

  let director: Session;
  let pm: Session;
  let lead: Session;
  let devA: Session;
  let devB: Session;
  let tester: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;

  let providerOrgId: string;
  let clientOrgId: string;
  /** The project everyone in the happy path shares. */
  let projectA: string;
  /** A second project with only `devB` on it, for the cross-project assertions. */
  let projectB: string;
  let taskId: string;
  let ticketId: string;

  const createdConversationIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdTicketIds: string[] = [];

  const api = () => request(app.getHttpServer());

  function open(session: Session, body: Record<string, unknown>) {
    return api().post('/api/v1/conversations').set('Authorization', bearer(session)).send(body);
  }

  function send(session: Session, conversationId: string, body: Record<string, unknown>) {
    return api()
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', bearer(session))
      .send(body);
  }

  function read(session: Session, conversationId: string) {
    return api()
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', bearer(session));
  }

  function setSettings(body: Record<string, unknown>) {
    return api()
      .put('/api/v1/communication/settings')
      .set('Authorization', bearer(pm))
      .send(body)
      .expect(200);
  }

  async function openAndTrack(session: Session, body: Record<string, unknown>): Promise<string> {
    const response = await open(session, body).expect(200);
    createdConversationIds.push(response.body.id);
    return response.body.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    provider = app.get(MockIvrProvider);

    [director, pm, lead, devA, devB, tester, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.developer2),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    const org = await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } });
    providerOrgId = org.id;
    clientOrgId = clientAdmin.body.user.organization.id;

    const stamp = Date.now().toString().slice(-6);
    const [a, b] = await Promise.all([
      prisma.project.create({
        data: {
          organizationId: providerOrgId,
          code: `CMA${stamp}`,
          name: 'Communication fixture A',
          description: 'Created by communication.e2e-spec.ts',
          type: 'MONTHLY_CONTRACT',
          status: 'ACTIVE',
          clientOrganizationId: clientOrgId,
          createdById: pm.body.user.id,
        },
        select: { id: true },
      }),
      prisma.project.create({
        data: {
          organizationId: providerOrgId,
          code: `CMB${stamp}`,
          name: 'Communication fixture B',
          description: 'Created by communication.e2e-spec.ts',
          type: 'MONTHLY_CONTRACT',
          status: 'ACTIVE',
          clientOrganizationId: clientOrgId,
          createdById: pm.body.user.id,
        },
        select: { id: true },
      }),
    ]);
    projectA = a.id;
    projectB = b.id;

    await prisma.projectMember.createMany({
      data: [
        { projectId: projectA, userId: pm.body.user.id, role: 'MANAGER' },
        { projectId: projectA, userId: lead.body.user.id, role: 'LEAD' },
        { projectId: projectA, userId: devA.body.user.id, role: 'DEVELOPER' },
        { projectId: projectA, userId: tester.body.user.id, role: 'TESTER' },
        // devB is on B and nowhere else, which is the whole cross-project fixture.
        { projectId: projectB, userId: devB.body.user.id, role: 'DEVELOPER' },
        { projectId: projectB, userId: pm.body.user.id, role: 'MANAGER' },
      ],
      skipDuplicates: true,
    });

    const counter = await prisma.organizationCounter.upsert({
      where: { organizationId_kind: { organizationId: providerOrgId, kind: 'TASK' } },
      update: { value: { increment: 1 } },
      create: { organizationId: providerOrgId, kind: 'TASK', value: 1 },
    });
    const task = await prisma.task.create({
      data: {
        organizationId: providerOrgId,
        projectId: projectA,
        number: counter.value,
        title: 'Fix the template sync',
        description: 'Created by communication.e2e-spec.ts',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        createdById: pm.body.user.id,
        assignedToId: devA.body.user.id,
        // This is what makes the developer↔tester pairing real rather than merely role-shaped.
        testerId: tester.body.user.id,
      },
      select: { id: true },
    });
    taskId = task.id;
    createdTaskIds.push(taskId);

    const ticketCounter = await prisma.organizationCounter.upsert({
      where: { organizationId_kind: { organizationId: providerOrgId, kind: 'TICKET' } },
      update: { value: { increment: 1 } },
      create: { organizationId: providerOrgId, kind: 'TICKET', value: 1 },
    });
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: providerOrgId,
        clientOrganizationId: clientOrgId,
        projectId: projectA,
        number: ticketCounter.value,
        title: 'Templates stopped syncing',
        description: 'Created by communication.e2e-spec.ts',
        type: 'SUPPORT',
        priority: 'HIGH',
        status: 'ASSIGNED',
        source: 'PORTAL',
        requesterId: clientAdmin.body.user.id,
        assignedToId: devA.body.user.id,
      },
      select: { id: true },
    });
    ticketId = ticket.id;
    createdTicketIds.push(ticketId);

    // Calling on, so the call assertions exercise the policy rather than the switch. The switch
    // gets its own test, which turns it off and back on.
    await setSettings({ chatEnabled: true, callingEnabled: true });
  });

  beforeEach(() => provider.reset());

  afterAll(async () => {
    await prisma.callParticipant.deleteMany({
      where: { call: { projectId: { in: [projectA, projectB] } } },
    });
    await prisma.callAttempt.deleteMany({
      where: { call: { projectId: { in: [projectA, projectB] } } },
    });
    await prisma.callLog.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
    await prisma.notification.deleteMany({
      where: { entityType: 'conversation', entityId: { in: createdConversationIds } },
    });
    await prisma.messageRevision.deleteMany({
      where: { message: { projectId: { in: [projectA, projectB] } } },
    });
    await prisma.file.deleteMany({
      where: { message: { projectId: { in: [projectA, projectB] } } },
    });
    await prisma.message.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
    await prisma.conversationMember.deleteMany({
      where: { conversation: { projectId: { in: [projectA, projectB] } } },
    });
    await prisma.conversation.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
    await prisma.communicationSettings.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticketSla.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.slaEvent.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await prisma.taskStatusHistory.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.projectMember.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
    await app.close();
  });

  // -------------------------------------------------------------------------------------------
  // Allowed communication
  // -------------------------------------------------------------------------------------------

  describe('people who share a project', () => {
    it('lets a developer open a direct conversation with the project lead', async () => {
      const id = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });
      const sent = await send(devA, id, { body: 'Is the fix ready to review?' }).expect(201);
      expect(sent.body.body).toBe('Is the fix ready to review?');

      const seen = await read(lead, id).expect(200);
      expect(seen.body.items.at(-1).body).toBe('Is the fix ready to review?');
    });

    it('lets the manager reach their own project team', async () => {
      const id = await openAndTrack(pm, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: devA.body.user.id,
      });
      await send(pm, id, { body: 'How is the sync work going?' }).expect(201);
    });

    it('lets a tester reach the developer whose work they test', async () => {
      const id = await openAndTrack(tester, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: devA.body.user.id,
      });
      await send(tester, id, { body: 'Which build should I test?' }).expect(201);
    });

    it('refuses a tester reaching a developer they share no work with', async () => {
      // Same project, roles that pair — but no task or ticket between them, which is exactly the
      // distinction the requirement draws.
      await prisma.projectMember.create({
        data: { projectId: projectA, userId: devB.body.user.id, role: 'DEVELOPER' },
      });
      const response = await open(tester, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: devB.body.user.id,
      });
      expect(response.status).toBe(403);
      await prisma.projectMember.deleteMany({
        where: { projectId: projectA, userId: devB.body.user.id },
      });
    });

    it('refuses a developer reaching another developer, pairing not being role-blind', async () => {
      await prisma.projectMember.create({
        data: { projectId: projectA, userId: devB.body.user.id, role: 'DEVELOPER' },
      });
      await open(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: devB.body.user.id,
      }).expect(403);
      await prisma.projectMember.deleteMany({
        where: { projectId: projectA, userId: devB.body.user.id },
      });
    });
  });

  // -------------------------------------------------------------------------------------------
  // Cross-project isolation
  // -------------------------------------------------------------------------------------------

  describe('people who share no project', () => {
    let projectBChannel: string;

    beforeAll(async () => {
      projectBChannel = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      await send(devB, projectBChannel, { body: 'Notes for project B only' }).expect(201);
    });

    it('cannot start a conversation with somebody on another project', async () => {
      await open(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectB,
        withUserId: devB.body.user.id,
      }).expect(403);
    });

    it('cannot read the other project’s channel', async () => {
      await read(devA, projectBChannel).expect(403);
    });

    it('cannot post into the other project’s channel', async () => {
      await send(devA, projectBChannel, { body: 'Hello' }).expect(403);
    });

    it('cannot call somebody on the other project', async () => {
      await api()
        .post(`/api/v1/conversations/${projectBChannel}/calls`)
        .set('Authorization', bearer(devA))
        .send({ withUserId: devB.body.user.id })
        .expect(403);
      expect(provider.calls()).toHaveLength(0);
    });

    it('does not list the other project’s conversation', async () => {
      const response = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(response.body.some((row: { id: string }) => row.id === projectBChannel)).toBe(false);
    });

    it('does not offer them as a contact', async () => {
      const response = await api()
        .get('/api/v1/conversations/contacts')
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(response.body.some((row: { id: string }) => row.id === devB.body.user.id)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------------------------
  // The websocket subscription
  // -------------------------------------------------------------------------------------------

  /**
   * Subscribing is authorized, and a refusal says why.
   *
   * The handler is called directly with a stand-in socket rather than over a real connection: the
   * transport is Socket.IO's and is not what could be wrong here. Everything that decides the
   * answer *is* real — the handshake token is verified by the token service, the membership is
   * read from the database, and the same policy the HTTP routes use makes the decision — so a
   * mistake in the authorization shows up here, which a mocked policy could never do.
   *
   * The second half of the property is asserted elsewhere: an authorized subscription is not a
   * standing grant, because messages go to per-user rooms computed at send time (see "when
   * somebody leaves a project").
   */
  describe('the websocket subscription', () => {
    let gateway: CommunicationGateway;
    let channelA: string;

    /** A socket that records what it was asked to join, so a silent join cannot pass. */
    function socketFor(session: Session | null) {
      const joined: string[] = [];
      const socket = {
        handshake: { auth: session ? { token: session.accessToken } : {} },
        join: (room: string) => {
          joined.push(room);
          return Promise.resolve();
        },
        leave: () => Promise.resolve(),
      };
      // The handler reads three members of `Socket`; the cast says so rather than pretending this
      // stand-in is a whole Socket.IO connection.
      return { joined, socket: socket as unknown as Socket };
    }

    beforeAll(async () => {
      gateway = app.get(CommunicationGateway);
      channelA = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
    });

    it('admits somebody the project admits', async () => {
      const { socket, joined } = socketFor(devA);
      const ack = await gateway.subscribe(socket, { conversationId: channelA });

      expect(ack).toEqual({ ok: true, conversationId: channelA, reason: null });
      expect(joined).toEqual([`conversation:${channelA}`]);
    });

    it('refuses a developer from another project, and joins them to nothing', async () => {
      const { socket, joined } = socketFor(devB);
      const ack = await gateway.subscribe(socket, { conversationId: channelA });

      expect(ack.ok).toBe(false);
      expect(ack.reason).toBe('NOT_ON_PROJECT');
      expect(joined).toEqual([]);
    });

    it('refuses a client', async () => {
      const { socket, joined } = socketFor(clientAdmin);
      const ack = await gateway.subscribe(socket, { conversationId: channelA });

      expect(ack.ok).toBe(false);
      expect(joined).toEqual([]);
    });

    it('refuses another tenant without saying whether the conversation exists', async () => {
      const { socket, joined } = socketFor(zenithAdmin);
      const ack = await gateway.subscribe(socket, { conversationId: channelA });

      // The same reason a stranger's id gets, so a subscribe cannot be used to probe for ids.
      expect(ack).toEqual({ ok: false, conversationId: channelA, reason: 'NOT_ON_PROJECT' });
      expect(joined).toEqual([]);
    });

    it('refuses a socket with no token at all', async () => {
      const { socket, joined } = socketFor(null);
      const ack = await gateway.subscribe(socket, { conversationId: channelA });

      expect(ack.ok).toBe(false);
      expect(joined).toEqual([]);
    });

    it('refuses a resubscribe once somebody has left the project', async () => {
      // The reconnect case: a socket that was welcome five minutes ago asks again. Nothing about
      // the conversation changed and no member row was touched — only the project membership.
      await prisma.projectMember.deleteMany({
        where: { projectId: projectA, userId: devA.body.user.id },
      });
      try {
        const { socket, joined } = socketFor(devA);
        const ack = await gateway.subscribe(socket, { conversationId: channelA });

        expect(ack.ok).toBe(false);
        expect(joined).toEqual([]);
      } finally {
        await prisma.projectMember.create({
          data: { projectId: projectA, userId: devA.body.user.id, role: 'DEVELOPER' },
        });
      }
    });
  });

  /**
   * Who the fan-out actually reaches.
   *
   * A subscription is refused where it should be, but a subscription is not what delivery rests
   * on: every event goes to per-user rooms, which every connected socket is already in. So the
   * audience is the control, and it has to agree with the endpoint. A tenant may build a custom
   * role without `conversation:participate` and still put that person on a project — the read
   * endpoint answers 403, and a fan-out that asked only about project membership would hand the
   * same person every message body over their socket.
   */
  describe('the realtime audience', () => {
    it('leaves out a project member whose role does not grant conversation:participate', async () => {
      const participate = await prisma.permission.findUniqueOrThrow({
        where: { key: PERMISSIONS.CONVERSATION_PARTICIPATE },
        select: { id: true },
      });
      const membership = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: providerOrgId, user: { email: DEMO.support } },
        select: { id: true, roleId: true, userId: true },
      });
      // Their own role, minus the one permission. Everything else about them stays as it was, so
      // the only thing the assertions below can be reacting to is that permission.
      const granted = await prisma.rolePermission.findMany({
        where: { roleId: membership.roleId, permissionId: { not: participate.id } },
        select: { permissionId: true },
      });
      const role = await prisma.role.create({
        data: {
          organizationId: providerOrgId,
          key: `comm-no-participate-${Date.now()}`,
          name: 'Communication fixture — reads nothing',
          isSystem: false,
          audience: 'INTERNAL',
          permissions: { create: granted },
        },
        select: { id: true },
      });
      await prisma.organizationMembership.update({
        where: { id: membership.id },
        data: { roleId: role.id },
      });
      await prisma.projectMember.create({
        data: { projectId: projectA, userId: membership.userId, role: 'DEVELOPER' },
      });
      const emit = jest.spyOn(app.get(RealtimeService), 'emitToUsers');

      try {
        const onlooker = await loginAs(app, DEMO.support);
        const conversationId = await openAndTrack(devA, {
          kind: CONVERSATION_KIND.PROJECT,
          projectId: projectA,
        });
        // The answer the fan-out has to agree with.
        await read(onlooker, conversationId).expect(403);

        emit.mockClear();
        const body = `audience-${randomUUID()}`;
        await send(devA, conversationId, { body }).expect(201);

        const delivered = emit.mock.calls.flatMap(([userIds]) => [...userIds]);
        // The message did go out — a fan-out that reached nobody would pass the next assertion
        // for the wrong reason.
        expect(delivered).toContain(lead.body.user.id);
        expect(delivered).not.toContain(membership.userId);

        // And the composer is not offered a name the send path would drop.
        const audience = await api()
          .get(`/api/v1/conversations/${conversationId}/audience`)
          .set('Authorization', bearer(devA))
          .expect(200);
        expect(audience.body.map((member: { id: string }) => member.id)).not.toContain(
          membership.userId,
        );
      } finally {
        emit.mockRestore();
        await prisma.projectMember.deleteMany({
          where: { projectId: projectA, userId: membership.userId },
        });
        await prisma.organizationMembership.update({
          where: { id: membership.id },
          data: { roleId: membership.roleId },
        });
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        await prisma.role.delete({ where: { id: role.id } });
      }
    });
  });

  // -------------------------------------------------------------------------------------------
  // Task and ticket threads
  // -------------------------------------------------------------------------------------------

  describe('work-linked conversations', () => {
    it('opens one thread per task, however many people open it at once', async () => {
      // Genuinely concurrent, because the interesting path is the one where both inserts race:
      // the loser catches the unique violation on the anchor and re-reads rather than creating a
      // second thread nobody would ever see. Run sequentially this test would pass without that
      // branch existing at all.
      const [first, second, third] = await Promise.all([
        open(devA, { kind: CONVERSATION_KIND.TASK, taskId }),
        open(tester, { kind: CONVERSATION_KIND.TASK, taskId }),
        open(lead, { kind: CONVERSATION_KIND.TASK, taskId }),
      ]);

      for (const response of [first, second, third]) {
        expect(response.status).toBe(200);
        createdConversationIds.push(response.body.id);
      }
      expect(second.body.id).toBe(first.body.id);
      expect(third.body.id).toBe(first.body.id);
      expect(await prisma.conversation.count({ where: { taskId, kind: 'TASK' } })).toBe(1);

      await send(devA, first.body.id, { body: 'Pushed the fix' }).expect(201);
      await send(tester, first.body.id, { body: 'Testing it now' }).expect(201);
    });

    it('takes the project from the task, not from the caller', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.TASK, taskId });
      const detail = await api()
        .get(`/api/v1/conversations/${id}`)
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(detail.body.project.id).toBe(projectA);
    });

    it('lets internal staff use a ticket’s internal thread', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.TICKET, ticketId });
      await send(devA, id, { body: 'The client’s log shows a 502 from the sync worker' }).expect(
        201,
      );
    });

    it('keeps the client out of the ticket’s internal thread', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.TICKET, ticketId });
      // 404, not 403: a conversation belongs to the provider organization, so the tenant scope
      // refuses a client before the policy is even consulted. That is the stronger answer —
      // they cannot establish that the thread exists — and the policy would refuse them too.
      expect([403, 404]).toContain((await read(clientAdmin, id)).status);
      expect([403, 404]).toContain(
        (await send(clientAdmin, id, { body: 'Can I see this?' })).status,
      );
    });
  });

  // -------------------------------------------------------------------------------------------
  // Clients and other tenants
  // -------------------------------------------------------------------------------------------

  describe('client isolation', () => {
    it('refuses a client every conversation endpoint', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      // The list and the directory refuse outright rather than answering with an empty array:
      // "there is nothing here for you" and "this is not yours to ask" are different statements.
      await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .get('/api/v1/conversations/contacts')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      // Anything addressing one conversation is refused by the tenant scope first, which answers
      // 404 so a client cannot learn that an id exists.
      for (const response of [
        await api().get(`/api/v1/conversations/${id}`).set('Authorization', bearer(clientAdmin)),
        await read(clientAdmin, id),
        await open(clientAdmin, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA }),
      ]) {
        expect([403, 404]).toContain(response.status);
      }
    });

    it('answers 404 rather than 403 for an id that is not theirs to know about', async () => {
      // Enumeration: a stranger's conversation and one that does not exist must be
      // indistinguishable.
      const invented = randomUUID();
      const real = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      const inventedResponse = await api()
        .get(`/api/v1/conversations/${invented}`)
        .set('Authorization', bearer(devA));
      expect(inventedResponse.status).toBe(404);
      // A real conversation on a project they are not on answers 403, not 404 — they are a member
      // of the tenant, so the row exists for them; what they lack is the project.
      const realResponse = await api()
        .get(`/api/v1/conversations/${real}`)
        .set('Authorization', bearer(devA));
      expect(realResponse.status).toBe(403);
    });

    it('refuses another tenant entirely', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const response = await api()
        .get(`/api/v1/conversations/${id}`)
        .set('Authorization', bearer(zenithAdmin));
      expect([403, 404]).toContain(response.status);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Membership removal — the property a stored participant list cannot give
  // -------------------------------------------------------------------------------------------

  describe('when somebody leaves a project', () => {
    it('loses access immediately, with no row deleted', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await send(devA, id, { body: 'Before' }).expect(201);
      await read(devA, id).expect(200);

      const membersBefore = await prisma.conversationMember.count({
        where: { conversationId: id },
      });
      await prisma.projectMember.deleteMany({
        where: { projectId: projectA, userId: devA.body.user.id },
      });

      // The same request, a moment later, on the same conversation with the same member row.
      await read(devA, id).expect(403);
      await send(devA, id, { body: 'After' }).expect(403);
      const membersAfter = await prisma.conversationMember.count({ where: { conversationId: id } });
      expect(membersAfter).toBe(membersBefore);

      // And it comes back when the membership does, which proves it is the membership doing it.
      await prisma.projectMember.create({
        data: { projectId: projectA, userId: devA.body.user.id, role: 'DEVELOPER' },
      });
      await read(devA, id).expect(200);
    });

    it('drops the conversation out of their list without deleting anything', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await prisma.projectMember.deleteMany({
        where: { projectId: projectA, userId: devA.body.user.id },
      });
      const response = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(response.body.some((row: { id: string }) => row.id === id)).toBe(false);
      expect(await prisma.conversation.count({ where: { id } })).toBe(1);

      await prisma.projectMember.create({
        data: { projectId: projectA, userId: devA.body.user.id, role: 'DEVELOPER' },
      });
    });
  });

  // -------------------------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------------------------

  describe('sending', () => {
    it('posts a retried message exactly once', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const clientMessageId = randomUUID();
      const first = await send(devA, id, { body: 'Only once', clientMessageId }).expect(201);
      const second = await send(devA, id, { body: 'Only once', clientMessageId }).expect(201);

      expect(second.body.id).toBe(first.body.id);
      const count = await prisma.message.count({
        where: { conversationId: id, clientMessageId },
      });
      expect(count).toBe(1);
    });

    it('refuses an empty message and one that is too long', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await send(devA, id, { body: '' }).expect(400);
      await send(devA, id, { body: 'x'.repeat(4001) }).expect(400);
    });

    it('refuses a whitespace-only message, and writes no row for it', async () => {
      // The send half of the same defect as the edit path: `@MinLength(1)` measured the raw string
      // while the service stored `dto.body.trim()`, so `'   '` validated at length one and landed
      // as a row of length zero. Worse here than on an edit, in one way — an edit at least leaves
      // the prior wording in `message_revisions`, while this made an empty message out of nothing.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const before = await prisma.message.count({ where: { conversationId: id } });

      await send(devA, id, { body: '   ' }).expect(400);
      await send(devA, id, { body: '\n\t ' }).expect(400);

      expect(await prisma.message.count({ where: { conversationId: id } })).toBe(before);
    });

    it('accepts a padded message and stores it trimmed', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const posted = await send(devA, id, { body: '  Padded but real  ' }).expect(201);

      expect(posted.body.body).toBe('Padded but real');
      const row = await prisma.message.findUniqueOrThrow({ where: { id: posted.body.id } });
      expect(row.body).toBe('Padded but real');
    });

    // ---------------------------------------------------------------------------------------
    // A message that is a file — the dead Send button both composers offered
    // ---------------------------------------------------------------------------------------

    /** Uploads one file the way both apps do: unparented, adopted by the send. */
    async function uploadFile(session: Session, filename: string) {
      const file = await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(session))
        .attach('file', Buffer.from('%PDF-1.4 evidence'), {
          filename,
          contentType: 'application/pdf',
        })
        .expect(201);
      return file.body.id as string;
    }

    it('sends a message that is only a file, however the empty body is spelled', async () => {
      // This test used to assert the opposite — that all three forms were refused — and it is
      // rewritten rather than deleted, because the behaviour it pinned was the defect. Both
      // composers offer Send with a file and no text (web's guard is
      // `trimmed.length > 0 || attachments.files.length > 0`, mobile's is the same shape), and both
      // then send `body: ''`, so that button posted a request the API always refused.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });

      // `''` is what both apps actually send; `'  '` and an absent body are the other two spellings
      // of "no words", and all three now mean the same thing.
      for (const payload of [{ body: '' }, { body: '   ' }, {}]) {
        const fileId = await uploadFile(devA, 'evidence.pdf');
        const posted = await send(devA, id, { ...payload, attachmentIds: [fileId] }).expect(201);
        expect(posted.body.body).toBe('');
        expect(posted.body.attachments).toHaveLength(1);
        const row = await prisma.message.findUniqueOrThrow({ where: { id: posted.body.id } });
        expect(row.body).toBe('');
      }
    });

    it('describes a wordless message by its files in the list and in the notification', async () => {
      // The preview and the notification line are one function now, so they cannot drift. The
      // sender is deliberately not in the string: the notification puts them in its title and the
      // conversation list draws them as the row heading.
      const id = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });

      const one = await uploadFile(devA, 'quarterly-report.pdf');
      await send(devA, id, { body: '', attachmentIds: [one] }).expect(201);

      const listed = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(lead))
        .expect(200);
      const row = listed.body.find((entry: { id: string }) => entry.id === id);
      expect(row.lastMessagePreview).toBe('Sent quarterly-report.pdf');
      expect(row.lastMessagePreview).not.toBe('');

      const notification = await prisma.notification.findFirst({
        where: { entityType: 'conversation', entityId: id, type: 'CONVERSATION_MESSAGE' },
        orderBy: { createdAt: 'desc' },
      });
      // The same string the list shows, from the same function.
      expect(notification?.body).toBe('Sent quarterly-report.pdf');

      // Several, and it counts rather than listing names nobody can read in one line.
      const many = [
        await uploadFile(devA, 'one.pdf'),
        await uploadFile(devA, 'two.pdf'),
        await uploadFile(devA, 'three.pdf'),
      ];
      await send(devA, id, { body: '', attachmentIds: many }).expect(201);

      const after = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(lead))
        .expect(200);
      expect(after.body.find((entry: { id: string }) => entry.id === id).lastMessagePreview).toBe(
        'Sent 3 files',
      );
    });

    it('still prefers the words when a message has both', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const fileId = await uploadFile(devA, 'evidence.pdf');
      await send(devA, id, { body: 'Here it is', attachmentIds: [fileId] }).expect(201);

      const listed = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(listed.body.find((entry: { id: string }) => entry.id === id).lastMessagePreview).toBe(
        'Here it is',
      );
    });

    it('keeps an attachment name out of the list once the message is withdrawn', async () => {
      // Withdrawing used to cost the list nothing to think about, because a preview was words the
      // tombstone had already removed. Now it can be a file name, so it is worth asserting that the
      // name goes with the message: `ConversationsRepository.previews` selects `deletedAt: null`,
      // so the list falls back to the last surviving message rather than describing the dead one.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await send(devA, id, { body: 'Said before the file' }).expect(201);
      const fileId = await uploadFile(devA, 'confidential-terms.pdf');
      const posted = await send(devA, id, { body: '', attachmentIds: [fileId] }).expect(201);

      const during = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(during.body.find((entry: { id: string }) => entry.id === id).lastMessagePreview).toBe(
        'Sent confidential-terms.pdf',
      );

      await api()
        .delete(`/api/v1/conversations/${id}/messages/${posted.body.id}`)
        .set('Authorization', bearer(director))
        .expect(200);

      const after = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      const preview = after.body.find(
        (entry: { id: string }) => entry.id === id,
      ).lastMessagePreview;
      expect(preview).toBe('Said before the file');
      expect(preview).not.toContain('confidential-terms');
    });

    it('refuses a message carrying neither words nor a file, and says which case that is', async () => {
      // The rule the removed `@MinLength(1)` used to approximate: "a message must carry
      // something", not "anything goes".
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const before = await prisma.message.count({ where: { conversationId: id } });

      for (const payload of [{ body: '' }, { body: '   ' }, {}, { body: '', attachmentIds: [] }]) {
        const refused = await send(devA, id, payload).expect(400);
        expect(JSON.stringify(refused.body)).toContain('A message needs words, or a file');
      }
      expect(await prisma.message.count({ where: { conversationId: id } })).toBe(before);
    });

    // ---------------------------------------------------------------------------------------
    // Attachments that cannot be adopted — the silent drop, and the blank message behind it
    // ---------------------------------------------------------------------------------------

    it('refuses a file that is not the sender’s to attach, and writes nothing', async () => {
      // Adoption is a filtered `updateMany` and its count used to be discarded, so a file that did
      // not match was dropped in silence: the message posted, the attachment did not. Once a
      // message could *be* a file, the same drop wrote a row with neither words nor attachments —
      // straight past "a message needs words, or a file" — and handed the list an empty preview
      // and the notification an empty line.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });

      // Each case's precondition is asserted before it is used. A setup that quietly failed would
      // make every one of these refusals pass for the wrong reason.
      const unknown = randomUUID();
      expect(await prisma.file.findUnique({ where: { id: unknown } })).toBeNull();

      const someoneElses = await uploadFile(lead, 'their-upload.pdf');
      const theirs = await prisma.file.findUniqueOrThrow({ where: { id: someoneElses } });
      expect(theirs.uploadedById).toBe(lead.body.user.id);
      expect(theirs.uploadedById).not.toBe(devA.body.user.id);
      expect(theirs.messageId).toBeNull();

      const onATask = await uploadFile(devA, 'already-on-a-task.pdf');
      await prisma.file.update({ where: { id: onATask }, data: { taskId } });
      expect((await prisma.file.findUniqueOrThrow({ where: { id: onATask } })).taskId).toBe(taskId);

      const before = await prisma.message.count({ where: { conversationId: id } });
      for (const attachmentId of [unknown, someoneElses, onATask]) {
        // Both with words and without: the first used to post the message and lose the file, the
        // second used to post a blank message.
        for (const payload of [{ body: 'with words' }, { body: '' }]) {
          const refused = await send(devA, id, {
            ...payload,
            attachmentIds: [attachmentId],
          }).expect(400);
          expect(JSON.stringify(refused.body)).toContain('could not be attached');
        }
      }
      expect(await prisma.message.count({ where: { conversationId: id } })).toBe(before);

      // The control, and the point of it: with the refusals above passing, a suite that had broken
      // the upload helper would look exactly the same. A real file still posts.
      const mine = await uploadFile(devA, 'mine.pdf');
      const posted = await send(devA, id, { body: '', attachmentIds: [mine] }).expect(201);
      expect(posted.body.attachments).toHaveLength(1);
      expect(await prisma.message.count({ where: { conversationId: id } })).toBe(before + 1);

      // And nothing was taken from the files that were refused.
      expect((await prisma.file.findUniqueOrThrow({ where: { id: someoneElses } })).messageId).toBe(
        null,
      );
      expect((await prisma.file.findUniqueOrThrow({ where: { id: onATask } })).taskId).toBe(taskId);
    });

    it('does not silently drop a file re-sent after a send that already landed', async () => {
      // The sequence that reaches this through the shipped UIs: a send lands but its response is
      // lost, the composer keeps the attachment strip, and the next send re-presents a file id
      // that is now owned by the first message. It used to post without the file and say nothing.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const fileId = await uploadFile(devA, 'evidence.pdf');

      const first = await send(devA, id, { body: 'first send', attachmentIds: [fileId] }).expect(
        201,
      );
      expect(first.body.attachments).toHaveLength(1);
      // The precondition for the second send: the file really is owned by the first message now.
      expect((await prisma.file.findUniqueOrThrow({ where: { id: fileId } })).messageId).toBe(
        first.body.id,
      );

      const second = await send(devA, id, {
        body: 'second send',
        attachmentIds: [fileId],
      }).expect(400);
      expect(JSON.stringify(second.body)).toContain('could not be attached');
      // Refused rather than posted without its file, and the first message keeps what it had.
      expect(
        await prisma.message.count({ where: { conversationId: id, body: 'second send' } }),
      ).toBe(0);
      expect((await prisma.file.findUniqueOrThrow({ where: { id: fileId } })).messageId).toBe(
        first.body.id,
      );
    });

    it('sends the same file id named twice as one attachment rather than refusing it', async () => {
      // The count check would otherwise read "two requested, one adopted" and refuse a file that
      // did in fact attach.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const fileId = await uploadFile(devA, 'twice.pdf');

      const posted = await send(devA, id, {
        body: '',
        attachmentIds: [fileId, fileId],
      }).expect(201);
      expect(posted.body.attachments).toHaveLength(1);
    });

    it('keeps an attachment name inside the internal boundary', async () => {
      // A file name carries information, so the preview that quotes one is only as safe as the
      // surface it appears on. That surface is `GET /conversations`, which refuses a client
      // outright — the policy's first check is `isInternal`, before any query runs — and
      // `lastMessagePreview` is built in exactly one place with no client shape. Asserted here
      // rather than argued, now that the preview can carry a name.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const fileId = await uploadFile(devA, 'internal-pricing.pdf');
      await send(devA, id, { body: '', attachmentIds: [fileId] }).expect(201);

      await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      const detail = await api()
        .get(`/api/v1/conversations/${id}`)
        .set('Authorization', bearer(clientAdmin));
      expect([403, 404]).toContain(detail.status);
      expect(JSON.stringify(detail.body)).not.toContain('internal-pricing');

      // And the file itself is INTERNAL the moment it is adopted, whatever it was uploaded as.
      const stored = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
      expect(stored.visibility).toBe('INTERNAL');
    });

    it('refuses an unknown field rather than ignoring it', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await send(devA, id, { body: 'Hello', senderId: pm.body.user.id }).expect(400);
    });

    it('stops posting when chat is switched off, but not reading', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await send(devA, id, { body: 'Before the switch' }).expect(201);
      await setSettings({ chatEnabled: false });

      await send(devA, id, { body: 'After the switch' }).expect(403);
      await read(devA, id).expect(200);

      await setSettings({ chatEnabled: true });
    });

    it('reads a page of the size asked for, from a query string', async () => {
      // `limit` is `@IsInt()` with no `@Type(() => Number)`, which is correct only because the
      // global pipe converts implicitly against the reflected type. That is a property of a
      // shared setting somebody could change, so it is asserted rather than assumed.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      for (const line of ['one', 'two', 'three']) {
        await send(devA, id, { body: line }).expect(201);
      }
      const page = await read(devA, id).query({ limit: 2 }).expect(200);

      expect(page.body.items).toHaveLength(2);
      expect(page.body.nextCursor).not.toBeNull();
      // And a limit outside the range is still refused, so the conversion has not swallowed the
      // validator along with the string.
      await read(devA, id).query({ limit: 0 }).expect(400);
      await read(devA, id).query({ limit: 'lots' }).expect(400);
    });

    it('reads `unreadOnly=false` as false rather than as the string being truthy', async () => {
      // `Boolean('false')` is `true`, so implicit conversion alone turned this filter on when it
      // was explicitly asked to be off. The conversation just created is read, so it must appear.
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await send(pm, id, { body: 'Something to read' }).expect(201);
      await api()
        .post(`/api/v1/conversations/${id}/read`)
        .set('Authorization', bearer(devA))
        .expect(204);

      const listed = await api()
        .get('/api/v1/conversations')
        .query({ unreadOnly: 'false' })
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(listed.body.some((row: { id: string }) => row.id === id)).toBe(true);

      const unreadOnly = await api()
        .get('/api/v1/conversations')
        .query({ unreadOnly: 'true' })
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(unreadOnly.body.some((row: { id: string }) => row.id === id)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Editing — the sender, inside the window, while they could still post here
  // -------------------------------------------------------------------------------------------

  describe('editing a message', () => {
    async function postedBy(session: Session, body: string) {
      const conversationId = await openAndTrack(session, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const message = await send(session, conversationId, { body }).expect(201);
      return { conversationId, messageId: message.body.id as string };
    }

    const edit = (session: Session, conversationId: string, messageId: string, body: string) =>
      api()
        .patch(`/api/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', bearer(session))
        .send({ body });

    /** Moves a message back in time, which is the only way to test a window in one run. */
    const age = (messageId: string, minutes: number) =>
      prisma.message.update({
        where: { id: messageId },
        data: { createdAt: new Date(Date.now() - minutes * 60_000) },
      });

    it('lets the sender rewrite their own message and stamps it edited', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Pushed teh fix');
      const response = await edit(devA, conversationId, messageId, 'Pushed the fix').expect(200);

      expect(response.body.body).toBe('Pushed the fix');
      expect(response.body.editedAt).not.toBeNull();
      const thread = await read(devA, conversationId).expect(200);
      expect(
        thread.body.items.some((message: { body: string }) => message.body === 'Pushed the fix'),
      ).toBe(true);
    });

    it('refuses a whitespace-only edit and leaves the message as it was', async () => {
      // A self-withdraw by the back door: emptying your own message through the endpoint whose
      // DELETE two lines away refuses to withdraw anything. `@MinLength(1)` used to measure the
      // untrimmed string while the service stored the trimmed one, so `'   '` was one character
      // to the validator and zero in the row.
      const { conversationId, messageId } = await postedBy(devA, 'Said in the open');
      await edit(devA, conversationId, messageId, '   ').expect(400);

      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.body).toBe('Said in the open');
      expect(row.editedAt).toBeNull();
      expect(await prisma.messageRevision.count({ where: { messageId } })).toBe(0);
    });

    it('refuses an empty edit', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Still here');
      await edit(devA, conversationId, messageId, '').expect(400);

      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.body).toBe('Still here');
    });

    it('accepts a padded edit and stores it trimmed', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Before');
      const response = await edit(devA, conversationId, messageId, '  After  ').expect(200);

      expect(response.body.body).toBe('After');
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.body).toBe('After');
    });

    it('refuses somebody who did not write it', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Mine');
      // The lead shares the project and may post here; what they may not do is speak in
      // somebody else's name.
      await edit(lead, conversationId, messageId, 'Not mine').expect(403);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.body).toBe('Mine');
    });

    it('refuses an administrator with oversight, who may remove but never rewrite', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Mine');
      await edit(director, conversationId, messageId, 'Rewritten by the director').expect(403);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.body).toBe('Mine');
    });

    it('refuses a developer who has been removed from the project, with no row deleted', async () => {
      // The property the whole package rests on, applied to history: losing the relationship
      // loses the ability to rewrite the record of it.
      const { conversationId, messageId } = await postedBy(devA, 'Before I left');
      await prisma.projectMember.deleteMany({
        where: { projectId: projectA, userId: devA.body.user.id },
      });
      try {
        await edit(devA, conversationId, messageId, 'After I left').expect(403);
        const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
        expect(row.body).toBe('Before I left');
        expect(row.editedAt).toBeNull();
      } finally {
        await prisma.projectMember.create({
          data: { projectId: projectA, userId: devA.body.user.id, role: 'DEVELOPER' },
        });
      }
      // And it comes back with the membership, which proves it was the membership doing it.
      await edit(devA, conversationId, messageId, 'Back on the project').expect(200);
    });

    it('refuses an edit once the window has closed', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Long ago');
      await age(messageId, MESSAGE_EDIT_WINDOW_MINUTES + 1);

      await edit(devA, conversationId, messageId, 'Rewriting history').expect(403);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.body).toBe('Long ago');
    });

    it('still allows the last minute of the window', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Just in time');
      await age(messageId, MESSAGE_EDIT_WINDOW_MINUTES);

      await edit(devA, conversationId, messageId, 'Corrected').expect(200);
    });

    it('refuses to rewrite a system note', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });
      await api()
        .post(`/api/v1/conversations/${conversationId}/calls`)
        .set('Authorization', bearer(devA))
        .send({})
        .expect(201);
      const thread = await read(devA, conversationId).expect(200);
      const systemMessage = thread.body.items.find(
        (message: { systemKind: string | null }) => message.systemKind !== null,
      );

      await edit(devA, conversationId, systemMessage.id, 'A call was not started').expect(403);
    });

    it('keeps what the message said before, and shows it only to oversight', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'The original wording');
      await edit(devA, conversationId, messageId, 'The replacement wording').expect(200);

      const revisions = () =>
        `/api/v1/conversations/${conversationId}/messages/${messageId}/revisions`;
      const seen = await api().get(revisions()).set('Authorization', bearer(director)).expect(200);
      expect(seen.body).toHaveLength(1);
      expect(seen.body[0].body).toBe('The original wording');
      expect(seen.body[0].editedBy.id).toBe(devA.body.user.id);

      // Not to the sender, and not to the rest of the thread: the revision is a safeguard, not a
      // way to read a typo somebody corrected before anybody saw it.
      await api().get(revisions()).set('Authorization', bearer(devA)).expect(403);
      await api().get(revisions()).set('Authorization', bearer(lead)).expect(403);
    });

    it('writes no revision and no audit row for a save that changed nothing', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Unchanged');
      await edit(devA, conversationId, messageId, 'Unchanged').expect(200);

      expect(await prisma.messageRevision.count({ where: { messageId } })).toBe(0);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.editedAt).toBeNull();
    });

    it('never copies either body into the audit trail', async () => {
      const { conversationId, messageId } = await postedBy(devA, `old-${randomUUID()}`);
      const replacement = `new-${randomUUID()}`;
      await edit(devA, conversationId, messageId, replacement).expect(200);

      const rows = await prisma.auditLog.findMany({
        where: { action: 'conversation.message_edited' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { after: true },
      });
      expect(JSON.stringify(rows)).toContain(messageId);
      expect(JSON.stringify(rows)).not.toContain(replacement);
      expect(JSON.stringify(rows)).not.toContain('old-');
    });

    it('reports on each message whether this caller may change it', async () => {
      const { conversationId, messageId } = await postedBy(devA, 'Mine to edit');
      const mine = await read(devA, conversationId).expect(200);
      const theirs = await read(lead, conversationId).expect(200);

      const find = (page: { body: { items: { id: string }[] } }) =>
        page.body.items.find((message) => message.id === messageId) as unknown as {
          canEdit: boolean;
          canDelete: boolean;
        };
      // `canDelete` is false for the sender now, and that is the inversion this release makes:
      // there is no ordinary user delete, so the control the screen would draw from this is not
      // drawn for anybody without oversight.
      expect(find(mine)).toMatchObject({ canEdit: true, canDelete: false });
      expect(find(theirs)).toMatchObject({ canEdit: false, canDelete: false });

      // The one caller for whom it is true is the one the endpoint would accept.
      const inspector = await read(director, conversationId).expect(200);
      expect(find(inspector)).toMatchObject({ canEdit: false, canDelete: true });

      // And it goes false where the endpoint would refuse, rather than staying true until pressed.
      await age(messageId, MESSAGE_EDIT_WINDOW_MINUTES + 1);
      const later = await read(devA, conversationId).expect(200);
      expect(find(later)).toMatchObject({ canEdit: false, canDelete: false });
    });
  });

  // -------------------------------------------------------------------------------------------
  // Two writers, one message
  // -------------------------------------------------------------------------------------------

  /**
   * What happens when the row moves between the decision and the write.
   *
   * The policy judges a message read a moment earlier, so a second tab, or an inspector taking
   * something down, reaches the write with the same starting row. These go through the repository
   * rather than through two racing HTTP requests, because a race that has to be *won* to fail is
   * a test that passes on a slow day: handing the same stale row to the second call is exactly
   * what two tabs produce, and it fails deterministically when the write is not conditional.
   */
  describe('a message that changed underneath the write', () => {
    let repository: ConversationsRepository;

    async function posted(body: string) {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const message = await send(devA, conversationId, { body }).expect(201);
      return { conversationId, messageId: message.body.id as string };
    }

    beforeAll(() => {
      repository = app.get(ConversationsRepository);
    });

    it('keeps one revision per edit that actually landed, and refuses the stale one', async () => {
      const { conversationId, messageId } = await posted('The original wording');
      const stale = await repository.messageById(conversationId, messageId);
      if (!stale) {
        throw new Error('The message that was just posted could not be read back');
      }

      expect(
        await repository.editMessage(stale, 'The first tab', devA.body.user.id),
      ).not.toBeNull();
      // The second tab, holding the row as it was before the first tab saved.
      expect(await repository.editMessage(stale, 'The second tab', devA.body.user.id)).toBeNull();

      const revisions = await prisma.messageRevision.findMany({
        where: { messageId },
        select: { body: true },
      });
      // One revision, holding the one body that was ever replaced. Two would mean the record
      // claims the original was overwritten twice and says nothing about "The first tab".
      expect(revisions).toEqual([{ body: 'The original wording' }]);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.body).toBe('The first tab');
    });

    it('does not write words onto a message that has been withdrawn', async () => {
      const { conversationId, messageId } = await posted('Still here for now');
      const stale = await repository.messageById(conversationId, messageId);
      if (!stale) {
        throw new Error('The message that was just posted could not be read back');
      }
      await repository.softDeleteMessage(stale);

      expect(await repository.editMessage(stale, 'After the tombstone', devA.body.user.id)).toBe(
        null,
      );
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.editedAt).toBeNull();
      expect(row.body).toBe('Still here for now');
      expect(await prisma.messageRevision.count({ where: { messageId } })).toBe(0);
    });

    it('lets only one of two withdrawals claim the removal', async () => {
      const { conversationId, messageId } = await posted('Taken down once');
      const stale = await repository.messageById(conversationId, messageId);
      if (!stale) {
        throw new Error('The message that was just posted could not be read back');
      }

      const first = await repository.softDeleteMessage(stale);
      expect(first).not.toBeNull();
      expect(await repository.softDeleteMessage(stale)).toBeNull();

      // The second call moved nothing, so the record still says when it was actually withdrawn.
      const row = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
      expect(row.deletedAt?.toISOString()).toBe(first?.deletedAt?.toISOString());
    });
  });

  // -------------------------------------------------------------------------------------------
  // Deletion — soft, and it takes the attachments with it
  // -------------------------------------------------------------------------------------------

  describe('withdrawing a message', () => {
    const remove = (session: Session, conversationId: string, messageId: string) =>
      api()
        .delete(`/api/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', bearer(session));

    async function withAttachment(session: Session, body: string) {
      const conversationId = await openAndTrack(session, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const file = await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(session))
        .attach('file', Buffer.from('%PDF-1.4 evidence'), {
          filename: 'evidence.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const message = await send(session, conversationId, {
        body,
        attachmentIds: [file.body.id],
      }).expect(201);
      return {
        conversationId,
        messageId: message.body.id as string,
        fileId: file.body.id as string,
      };
    }

    it('takes the body and the attachments out of the read path, keeping the message’s place', async () => {
      const { conversationId, messageId, fileId } = await withAttachment(devA, 'Secret wording');
      const before = await read(devA, conversationId).expect(200);
      const countBefore = before.body.items.length;
      expect(
        before.body.items.find((message: { id: string }) => message.id === messageId).attachments,
      ).toHaveLength(1);

      // The sender may not take it back any more. The tombstone, the attachment cascade and the
      // audit row are all still here — they just belong to the administrative path now.
      await remove(devA, conversationId, messageId).expect(403);
      await remove(director, conversationId, messageId).expect(200);

      const after = await read(devA, conversationId).expect(200);
      const tombstone = after.body.items.find(
        (message: { id: string }) => message.id === messageId,
      );
      expect(after.body.items).toHaveLength(countBefore);
      expect(tombstone.body).toBe('');
      expect(tombstone.attachments).toEqual([]);
      expect(tombstone.deletedAt).not.toBeNull();
      // The row is still there; only its content is gone.
      expect(await prisma.message.count({ where: { id: messageId } })).toBe(1);

      // And the file is unreachable through the module that would otherwise hand out the bytes.
      await api()
        .get(`/api/v1/files/${fileId}/download`)
        .set('Authorization', bearer(devA))
        .expect(404);
    });

    it('shows the conversation list a tombstone rather than the deleted words', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const secret = `preview-${randomUUID()}`;
      const message = await send(devA, conversationId, { body: secret }).expect(201);
      await remove(director, conversationId, message.body.id).expect(200);

      const listed = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      const row = listed.body.find((entry: { id: string }) => entry.id === conversationId);
      expect(row.lastMessagePreview ?? '').not.toContain(secret);
    });

    it('refuses somebody who did not write it and holds no oversight', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const message = await send(devA, conversationId, { body: 'Mine' }).expect(201);

      await remove(lead, conversationId, message.body.id).expect(403);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.body.id } });
      expect(row.deletedAt).toBeNull();
    });

    it('lets an administrator with oversight remove anybody’s, and records that it did', async () => {
      const conversationId = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      const message = await send(devB, conversationId, { body: 'Out of order' }).expect(201);

      // The director is on neither project: oversight is the only thing admitting them, and this
      // is the single write it admits.
      await remove(director, conversationId, message.body.id).expect(200);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.body.id } });
      expect(row.deletedAt).not.toBeNull();

      const audited = await prisma.auditLog.findMany({
        where: {
          action: 'conversation.message_deleted',
          actorUserId: director.body.user.id,
          entityId: conversationId,
        },
        select: { after: true },
      });
      expect(audited).toHaveLength(1);
      expect(JSON.stringify(audited[0]?.after)).toContain('"viaOversight":true');
      // The words themselves are not in the record of their removal.
      expect(JSON.stringify(audited[0]?.after)).not.toContain('Out of order');
    });

    it('refuses to withdraw the same message twice', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const message = await send(devA, conversationId, { body: 'Once' }).expect(201);
      await remove(director, conversationId, message.body.id).expect(200);
      await remove(director, conversationId, message.body.id).expect(403);
    });

    /**
     * The inversion, stated on its own.
     *
     * The requirement is explicit that there is no normal user delete. What replaces it is not
     * "nobody may remove anything" — that would leave an organization unable to take down a
     * message somebody should not have sent — but the administrative redaction, which is
     * permission-gated and separately audited, and which the tests above exercise.
     */
    it('refuses the sender their own message, however new, and says why', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const message = await send(devA, conversationId, { body: 'Just sent' }).expect(201);

      const refusal = await remove(devA, conversationId, message.body.id).expect(403);
      expect(refusal.body.message).toContain('withdrawn');
      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.body.id } });
      expect(row.deletedAt).toBeNull();

      // And a manager on the project, who is not the sender, gets the very same answer: the
      // refusal says nothing about whose message it is.
      const bystander = await remove(pm, conversationId, message.body.id).expect(403);
      expect(bystander.body.message).toBe(refusal.body.message);
    });

    it('refuses a message id belonging to another conversation, without confirming it exists', async () => {
      const mine = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const theirs = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      const message = await send(devB, theirs, { body: 'Project B only' }).expect(201);

      await remove(devA, mine, message.body.id).expect(404);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.body.id } });
      expect(row.deletedAt).toBeNull();
    });

    it('refuses a client', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const message = await send(devA, conversationId, { body: 'Internal' }).expect(201);
      const response = await remove(clientAdmin, conversationId, message.body.id);
      expect([403, 404]).toContain(response.status);
    });

    /**
     * The refusal must not be a way to read a thread one answer at a time.
     *
     * Four ids of four different kinds, named by somebody who is not on that project. If the
     * message is fetched before the read is decided, they come back distinguishable — 404 for an
     * id that is not in the thread, "this message cannot be changed" for a system note or a
     * tombstone, "only the person who wrote it" for a live message — which is three facts about a
     * conversation they were never admitted to, and a way to confirm an id exists.
     */
    it('answers a stranger identically whatever kind of message they name', async () => {
      const theirs = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      const live = await send(devB, theirs, { body: 'Project B, live' }).expect(201);
      const withdrawn = await send(devB, theirs, { body: 'Project B, withdrawn' }).expect(201);
      await remove(director, theirs, withdrawn.body.id).expect(200);
      const note = await prisma.message.create({
        data: {
          organizationId: providerOrgId,
          conversationId: theirs,
          projectId: projectB,
          senderId: null,
          systemKind: 'CALL_STARTED',
          body: 'A call was started',
        },
        select: { id: true },
      });

      const ids = [live.body.id as string, withdrawn.body.id as string, note.id, randomUUID()];
      const answers = await Promise.all(
        ids.flatMap((id) => [
          remove(devA, theirs, id),
          api()
            .patch(`/api/v1/conversations/${theirs}/messages/${id}`)
            .set('Authorization', bearer(devA))
            .send({ body: 'Rewritten by a stranger' }),
        ]),
      );

      const distinct = new Set(
        answers.map((answer) => `${answer.status} ${answer.body.message as string}`),
      );
      expect([...distinct]).toEqual(['403 You are not on this project']);
      // And nothing was touched on the way to being refused.
      const untouched = await prisma.message.findUniqueOrThrow({ where: { id: live.body.id } });
      expect({ body: untouched.body, editedAt: untouched.editedAt }).toEqual({
        body: 'Project B, live',
        editedAt: null,
      });
    });
  });

  // -------------------------------------------------------------------------------------------
  // Mentions — the one thing that turns a shared thread into a direct address
  // -------------------------------------------------------------------------------------------

  describe('mentioning somebody', () => {
    const mentionsFor = (userId: string) =>
      prisma.notification.count({
        where: { userId, type: 'CONVERSATION_MENTION' },
      });

    it('notifies somebody already entitled to receive the message', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const before = await mentionsFor(lead.body.user.id);
      await send(devA, conversationId, {
        body: `@[${lead.body.user.id}] can you review this?`,
      }).expect(201);

      expect(await mentionsFor(lead.body.user.id)).toBe(before + 1);
    });

    /**
     * Rewritten deliberately, and the assertion is stronger than the one it replaces.
     *
     * These two used to assert that naming somebody outside the audience was *accepted* (201) and
     * simply notified nobody. That was true of the notification path — it intersects the ids in
     * the body with the delivery audience — but it was a property of that one file rather than a
     * rule, and it left the forged id sitting in the stored body for every renderer that resolves
     * mentions to look up. The rule now is that the server refuses the message: `400`, an audit
     * row naming the ids that were refused, no notification, and nothing written.
     *
     * The thing these tests were protecting — "a mention is never a way to reach somebody outside
     * the thread" — is still asserted, and now in the place it is actually decided.
     */
    it('refuses a message naming somebody who cannot read the conversation', async () => {
      // devB is on project B and nowhere near this thread. Naming an id must not be a way to
      // reach somebody the audience would never have included.
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const before = await mentionsFor(devB.body.user.id);
      const refused = await send(devA, conversationId, {
        body: `@[${devB.body.user.id}] look at this`,
      });

      expect(refused.status).toBe(400);
      expect(await mentionsFor(devB.body.user.id)).toBe(before);
      // Refused before the row was written, so the forged id never reaches the messages table.
      expect(
        await prisma.message.count({
          where: { conversationId, body: { contains: devB.body.user.id } },
        }),
      ).toBe(0);
    });

    it('stops accepting a mention of somebody the moment they leave the project', async () => {
      const conversationId = await openAndTrack(pm, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      await prisma.projectMember.deleteMany({
        where: { projectId: projectA, userId: devA.body.user.id },
      });
      try {
        const before = await mentionsFor(devA.body.user.id);
        const refused = await send(pm, conversationId, {
          body: `@[${devA.body.user.id}] still there?`,
        });
        expect(refused.status).toBe(400);
        expect(await mentionsFor(devA.body.user.id)).toBe(before);
      } finally {
        await prisma.projectMember.create({
          data: { projectId: projectA, userId: devA.body.user.id, role: 'DEVELOPER' },
        });
      }
    });

    it('keeps the uuid out of the conversation list’s preview', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      await send(devA, conversationId, { body: `@[${lead.body.user.id}] standup at ten` }).expect(
        201,
      );

      const listed = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      const row = listed.body.find((entry: { id: string }) => entry.id === conversationId);
      expect(row.lastMessagePreview).toBe('@someone standup at ten');
    });

    it('offers the composer exactly the people the conversation reaches', async () => {
      const conversationId = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectA,
      });
      const audience = await api()
        .get(`/api/v1/conversations/${conversationId}/audience`)
        .set('Authorization', bearer(devA))
        .expect(200);

      const ids = audience.body.map((person: { id: string }) => person.id);
      expect(ids).toContain(lead.body.user.id);
      expect(ids).not.toContain(devB.body.user.id);
      expect(ids).not.toContain(clientAdmin.body.user.id);
    });

    it('does not hand a project’s roster to an inspector who is not on it', async () => {
      const conversationId = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      const audience = await api()
        .get(`/api/v1/conversations/${conversationId}/audience`)
        .set('Authorization', bearer(director))
        .expect(200);

      // Oversight is a read grant on the thread, not a directory of the people in it: there is
      // nobody here for an inspector to address.
      expect(audience.body).toEqual([]);
    });

    it('refuses the audience to somebody on another project', async () => {
      const conversationId = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      await api()
        .get(`/api/v1/conversations/${conversationId}/audience`)
        .set('Authorization', bearer(devA))
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Calling
  // -------------------------------------------------------------------------------------------

  describe('calling from a conversation', () => {
    it('places a call to the person the conversation is with', async () => {
      const id = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });
      const response = await api()
        .post(`/api/v1/conversations/${id}/calls`)
        .set('Authorization', bearer(devA))
        .send({})
        .expect(201);

      expect(provider.lastCall()?.agentUserId).toBe(lead.body.user.id);
      expect(response.body.participants).toHaveLength(2);
      const call = await prisma.callLog.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(call.kind).toBe('INTERNAL');
      expect(call.conversationId).toBe(id);
      expect(call.projectId).toBe(projectA);
    });

    it('writes the call into the thread', async () => {
      const id = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });
      await api()
        .post(`/api/v1/conversations/${id}/calls`)
        .set('Authorization', bearer(devA))
        .send({})
        .expect(201);

      const messages = await read(devA, id).expect(200);
      expect(
        messages.body.items.some(
          (message: { systemKind: string | null }) => message.systemKind === 'CALL_STARTED',
        ),
      ).toBe(true);
    });

    it('never redirects an internal call to the support chain', async () => {
      await setSettings({ internalCallFallback: INTERNAL_CALL_FALLBACK.NONE });
      const id = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });
      const started = await api()
        .post(`/api/v1/conversations/${id}/calls`)
        .set('Authorization', bearer(devA))
        .send({})
        .expect(201);

      const attempts = await prisma.callAttempt.findMany({
        where: { callId: started.body.id },
        select: { targetUserId: true },
      });
      // Exactly one destination, and it is the person the call was for. No support owner, no
      // on-call developer, nobody the caller did not choose.
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.targetUserId).toBe(lead.body.user.id);
    });

    it('refuses a call when calling is switched off, while messages keep working', async () => {
      await setSettings({ callingEnabled: false });
      const id = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });
      await api()
        .post(`/api/v1/conversations/${id}/calls`)
        .set('Authorization', bearer(devA))
        .send({})
        .expect(403);
      // The switch is about telephony, not about talking.
      await send(devA, id, { body: 'Messaging still works' }).expect(201);
      await setSettings({ callingEnabled: true });
    });

    it('will not choose whose telephone rings in a group thread', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      await api()
        .post(`/api/v1/conversations/${id}/calls`)
        .set('Authorization', bearer(devA))
        .send({})
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Recordings
  // -------------------------------------------------------------------------------------------

  describe('who may play an internal recording', () => {
    let callId: string;

    beforeAll(async () => {
      await setSettings({ callingEnabled: true, recordingPolicy: 'ALWAYS' });
      const id = await openAndTrack(devA, {
        kind: CONVERSATION_KIND.DIRECT,
        projectId: projectA,
        withUserId: lead.body.user.id,
      });
      const started = await api()
        .post(`/api/v1/conversations/${id}/calls`)
        .set('Authorization', bearer(devA))
        .send({})
        .expect(201);
      callId = started.body.id;
      await prisma.callLog.update({
        where: { id: callId },
        data: {
          recordingRef: 'rec-internal-1',
          recordingReadyAt: new Date(),
          connectedUserId: lead.body.user.id,
          status: 'COMPLETED',
        },
      });
    });

    const play = (session: Session) =>
      api()
        .get(`/api/v1/conversations/calls/${callId}/recording`)
        .set('Authorization', bearer(session));

    it('lets the project manager play it', async () => {
      const response = await play(pm).expect(200);
      expect(response.body.url).toContain('rec-internal-1');
    });

    it('lets a super admin play it', async () => {
      await play(director).expect(200);
    });

    it('refuses the developer who was on the call', async () => {
      // The heart of requirement eleven: participating is not a reason to be able to listen back.
      await play(devA).expect(403);
    });

    it('refuses the tester, who was never on it', async () => {
      await play(tester).expect(403);
    });

    it('refuses the client', async () => {
      const response = await play(clientAdmin);
      expect([403, 404]).toContain(response.status);
    });

    it('refuses another tenant', async () => {
      const response = await play(zenithAdmin);
      expect([403, 404]).toContain(response.status);
    });

    it('audits every playback and every refusal', async () => {
      await play(pm).expect(200);
      await play(devA).expect(403);
      const rows = await prisma.auditLog.findMany({
        where: { entityType: 'call', entityId: callId },
        select: { action: true },
      });
      const actions = rows.map((row) => row.action);
      expect(actions).toContain('call.recording_accessed');
      expect(actions).toContain('call.recording_access_denied');
    });
  });

  // -------------------------------------------------------------------------------------------
  // Oversight
  // -------------------------------------------------------------------------------------------

  describe('super-admin oversight', () => {
    it('reads a conversation the inspector is not part of, and records that it did', async () => {
      const id = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      await send(devB, id, { body: 'Private to project B' }).expect(201);

      const before = await prisma.auditLog.count({
        where: { action: 'conversation.inspected', entityId: id },
      });
      const response = await read(director, id).expect(200);
      expect(
        response.body.items.some((m: { body: string }) => m.body === 'Private to project B'),
      ).toBe(true);
      const after = await prisma.auditLog.count({
        where: { action: 'conversation.inspected', entityId: id },
      });
      expect(after).toBeGreaterThan(before);
    });

    it('is read-only: an inspector cannot post into somebody else’s conversation', async () => {
      const id = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      // The director is on neither project. Oversight lets them read and nothing more.
      await send(director, id, { body: 'Adding my thoughts' }).expect(403);
    });

    it('refuses oversight to somebody without the permission', async () => {
      await api()
        .get('/api/v1/communication/oversight/conversations')
        .set('Authorization', bearer(devA))
        .expect(403);
    });

    it('lists conversations across the organization and audits the listing', async () => {
      const response = await api()
        .get('/api/v1/communication/oversight/conversations')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(response.body.length).toBeGreaterThan(0);
      const audited = await prisma.auditLog.count({
        where: { action: 'conversation.inspected', actorUserId: director.body.user.id },
      });
      expect(audited).toBeGreaterThan(0);
    });

    it('does not reach another tenant', async () => {
      const response = await api()
        .get('/api/v1/communication/oversight/conversations')
        .set('Authorization', bearer(zenithAdmin));
      expect([403, 404]).toContain(response.status);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Settings and audit
  // -------------------------------------------------------------------------------------------

  describe('settings and the audit trail', () => {
    it('refuses the settings screen to somebody without the permission', async () => {
      await api()
        .get('/api/v1/communication/settings')
        .set('Authorization', bearer(devA))
        .expect(403);
    });

    it('records a refused access with its reason', async () => {
      const id = await openAndTrack(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId: projectB,
      });
      await read(devA, id).expect(403);
      const rows = await prisma.auditLog.findMany({
        where: { action: 'conversation.access_denied', actorUserId: devA.body.user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { after: true },
      });
      expect(JSON.stringify(rows[0]?.after)).toContain('NOT_ON_PROJECT');
    });

    it('never copies a message body into an audit payload', async () => {
      const id = await openAndTrack(devA, { kind: CONVERSATION_KIND.PROJECT, projectId: projectA });
      const secret = `do-not-audit-${randomUUID()}`;
      await send(devA, id, { body: secret }).expect(201);

      const rows = await prisma.auditLog.findMany({
        where: { entityType: 'conversation' },
        select: { after: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(JSON.stringify(rows)).not.toContain(secret);
    });
  });
});
