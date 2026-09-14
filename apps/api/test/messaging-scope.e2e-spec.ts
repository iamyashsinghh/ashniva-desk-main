import type { INestApplication } from '@nestjs/common';
import {
  COMMUNICATION_ACTION,
  CONVERSATION_KIND,
  PROJECT_MEMBER_ROLE,
  ROLE_KEYS,
  type AuthenticatedUser,
} from '@ashniva/types';
import argon2 from 'argon2';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { CommunicationPolicyService } from '../src/modules/communication/communication-policy.service';
import { ConversationsRepository } from '../src/modules/communication/conversations.repository';
import { ConversationsService } from '../src/modules/communication/conversations.service';
import { anchorKeyFor, directKeyFor } from '../src/modules/communication/communication.mapper';
import {
  bearer,
  createTestApp,
  DEMO,
  loginAs,
  SEED_PASSWORD,
  type Session,
} from './helpers/test-app';

/**
 * Scope-based direct messaging and group chat.
 *
 * The assertions that carry the weight are, as in `communication.e2e-spec.ts`, the negative ones —
 * and here they are negative about a *wider* surface, which is why this file exists separately:
 *
 *  * **An admin may message anybody — and still may not write in a project thread they are
 *    not on.** A manager and a lead reach the people their projects and teams name, in
 *    private and in the project group. A developer has an empty directory and posts only in
 *    that group.
 *  * **A group's member list is authorization**, so adding a client is refused by the API, and
 *    being removed takes access away on the next request.
 *  * **Clients reach none of it**, at every route.
 */
describe('Scope messaging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let director: Session;
  let pm: Session;
  let lead: Session;
  let devA: Session;
  let clientAdmin: Session;
  /** A manager whose only management relation is this suite's own project. */
  let boss: Session;
  /** An internal colleague on no project and no team: nobody's derived reach reaches them. */
  let outsider: Session;

  let providerOrgId: string;
  let scopedProjectId: string;
  let bossUserId: string;
  let outsiderUserId: string;
  let taskId: string;
  let ticketId: string;

  const stamp = Date.now().toString().slice(-6);
  const BOSS_EMAIL = `msgscope-boss-${stamp}@example.com`;
  const OUTSIDER_EMAIL = `msgscope-outsider-${stamp}@example.com`;
  const createdConversationIds: string[] = [];

  const api = () => request(app.getHttpServer());

  const directory = (session: Session) =>
    api().get('/api/v1/conversations/directory').set('Authorization', bearer(session));

  const openDirect = (session: Session, userId: string) =>
    api()
      .post('/api/v1/conversations/direct')
      .set('Authorization', bearer(session))
      .send({ userId });

  const createGroup = (session: Session, body: Record<string, unknown>) =>
    api().post('/api/v1/conversations/groups').set('Authorization', bearer(session)).send(body);

  const readMessages = (session: Session, conversationId: string) =>
    api()
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', bearer(session));

  const send = (session: Session, conversationId: string, body: string) =>
    api()
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', bearer(session))
      .send({ body });

  async function createInternalUser(email: string, name: string, roleKey: string): Promise<string> {
    const role = await prisma.role.findFirstOrThrow({
      where: { key: roleKey, organizationId: null, isSystem: true },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id }),
        status: 'ACTIVE',
        memberships: { create: { organizationId: providerOrgId, roleId: role.id } },
      },
      select: { id: true },
    });
    return user.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    [director, pm, lead, devA, clientAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
    ]);
    providerOrgId = (await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } })).id;

    bossUserId = await createInternalUser(BOSS_EMAIL, 'Scope Boss', ROLE_KEYS.PROJECT_MANAGER);
    outsiderUserId = await createInternalUser(
      OUTSIDER_EMAIL,
      'Scope Outsider',
      ROLE_KEYS.DEVELOPER,
    );
    [boss, outsider] = await Promise.all([loginAs(app, BOSS_EMAIL), loginAs(app, OUTSIDER_EMAIL)]);

    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: `MSG${stamp}`,
        name: 'Scope messaging fixture',
        description: 'Created by messaging-scope.e2e-spec.ts',
        type: 'MONTHLY_CONTRACT',
        status: 'ACTIVE',
        // The whole of `boss`'s reach: this one project, and the developer on it.
        managerUserId: bossUserId,
        createdById: bossUserId,
      },
      select: { id: true },
    });
    scopedProjectId = project.id;
    const task = await prisma.task.create({
      data: {
        organizationId: providerOrgId,
        projectId: scopedProjectId,
        number: Number(stamp),
        title: 'Scope fixture task',
        description: 'Created by messaging-scope.e2e-spec.ts',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        createdById: bossUserId,
        assignedToId: devA.body.user.id,
      },
      select: { id: true },
    });
    taskId = task.id;
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: providerOrgId,
        clientOrganizationId: clientAdmin.body.user.organization.id,
        projectId: scopedProjectId,
        number: Number(stamp),
        title: 'Scope fixture ticket',
        description: 'Created by messaging-scope.e2e-spec.ts',
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
    await prisma.projectMember.createMany({
      data: [
        { projectId: scopedProjectId, userId: bossUserId, role: PROJECT_MEMBER_ROLE.MANAGER },
        {
          projectId: scopedProjectId,
          userId: devA.body.user.id,
          role: PROJECT_MEMBER_ROLE.DEVELOPER,
        },
      ],
      skipDuplicates: true,
    });

    // Calling on, so the ability/endpoint agreement below turns on the conversation's kind rather
    // than on the organization's switch.
    await api()
      .put('/api/v1/communication/settings')
      .set('Authorization', bearer(pm))
      .send({ chatEnabled: true, callingEnabled: true })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.callParticipant.deleteMany({
      where: { call: { conversationId: { in: createdConversationIds } } },
    });
    await prisma.callAttempt.deleteMany({
      where: { call: { conversationId: { in: createdConversationIds } } },
    });
    await prisma.callLog.deleteMany({
      where: { conversationId: { in: createdConversationIds } },
    });
    await prisma.message.deleteMany({ where: { conversationId: { in: createdConversationIds } } });
    await prisma.conversationMember.deleteMany({
      where: { conversationId: { in: createdConversationIds } },
    });
    await prisma.conversation.deleteMany({ where: { id: { in: createdConversationIds } } });
    await prisma.conversation.deleteMany({
      where: {
        OR: [{ projectId: scopedProjectId }, { createdById: { in: [bossUserId, outsiderUserId] } }],
      },
    });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId } });
    await prisma.ticketSla.deleteMany({ where: { ticketId } });
    await prisma.slaEvent.deleteMany({ where: { ticketId } });
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.taskStatusHistory.deleteMany({ where: { taskId } });
    await prisma.task.deleteMany({ where: { id: taskId } });
    await prisma.projectMember.deleteMany({ where: { projectId: scopedProjectId } });
    await prisma.project.deleteMany({ where: { id: scopedProjectId } });
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: [bossUserId, outsiderUserId] } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [bossUserId, outsiderUserId] } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { userId: { in: [bossUserId, outsiderUserId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [bossUserId, outsiderUserId] } } });
    await app.close();
  });

  async function track(response: { body: { id: string } }): Promise<string> {
    createdConversationIds.push(response.body.id);
    return response.body.id;
  }

  // -------------------------------------------------------------------------------------------
  // Who reaches whom
  // -------------------------------------------------------------------------------------------

  describe('the directory', () => {
    it('gives a developer an empty directory, because they do not open private chats', async () => {
      const response = await directory(devA).expect(200);

      expect(response.body).toEqual([]);
    });

    it('gives a manager the people on the projects they manage, and says why', async () => {
      const response = await directory(boss).expect(200);
      const entry = response.body.find((row: { id: string }) => row.id === devA.body.user.id) as
        { reason: string } | undefined;

      expect(entry?.reason).toContain('which you manage');
      expect(response.body.map((row: { id: string }) => row.id)).not.toContain(outsiderUserId);
    });

    it('gives a team lead their team, the projects they lead, and the managers above them', async () => {
      const response = await directory(lead).expect(200);
      const ids = response.body.map((row: { id: string }) => row.id);

      // The seeded Web Team is led by `lead` and holds the developer; the seeded projects they
      // lead are managed by `pm`.
      expect(ids).toContain(devA.body.user.id);
      expect(ids).toContain(pm.body.user.id);
      expect(ids).not.toContain(outsiderUserId);
    });

    it('gives a super admin the whole tenant, and no client', async () => {
      const response = await directory(director).expect(200);
      const ids = response.body.map((row: { id: string }) => row.id);

      expect(ids).toContain(outsiderUserId);
      expect(ids).toContain(devA.body.user.id);
      // A client user is a member of a client organization, so no query here can name them.
      expect(ids).not.toContain(clientAdmin.body.user.id);
    });

    it('refuses a client', async () => {
      await directory(clientAdmin).expect(403);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Direct messages
  // -------------------------------------------------------------------------------------------

  describe('a scope direct message', () => {
    it('lets a manager open one with somebody on a project they manage, once', async () => {
      const first = await openDirect(boss, devA.body.user.id).expect(200);
      await track(first);
      const again = await openDirect(boss, devA.body.user.id).expect(200);

      // One row per pair for the whole organization — the pair is the whole anchor — where a
      // project-anchored DIRECT is one per pair per shared project.
      expect(again.body.id).toBe(first.body.id);
      expect(first.body.project).toBeNull();
      expect(first.body.kind).toBe(CONVERSATION_KIND.SCOPE_DIRECT);

      await send(boss, first.body.id, 'Can you take a look at the closing report?').expect(201);
      const seen = await readMessages(boss, first.body.id).expect(200);
      expect(seen.body.items).toHaveLength(1);
      await readMessages(devA, first.body.id).expect(403);

      const listed = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(
        listed.body.some(
          (row: { id: string; kind: string }) =>
            row.id === first.body.id || row.kind === CONVERSATION_KIND.SCOPE_DIRECT,
        ),
      ).toBe(false);
    });

    it('refuses a developer a private chat, even with a teammate', async () => {
      await openDirect(devA, pm.body.user.id).expect(403);
      await openDirect(devA, outsiderUserId).expect(403);
    });

    it('refuses a manager somebody they do not manage', async () => {
      await openDirect(boss, outsiderUserId).expect(403);
    });

    it('lets a super admin reach anybody in the tenant', async () => {
      const response = await openDirect(director, outsiderUserId).expect(200);
      await track(response);

      await send(director, response.body.id, 'Welcome aboard').expect(201);
      const seen = await readMessages(director, response.body.id).expect(200);
      expect(seen.body.items).toHaveLength(1);
      await readMessages(outsider, response.body.id).expect(403);
    });

    it('refuses a client, and refuses a conversation with yourself', async () => {
      await openDirect(clientAdmin, devA.body.user.id).expect(403);
      await openDirect(boss, bossUserId).expect(400);
    });

    it('closes when the relation that opened it goes', async () => {
      const response = await openDirect(boss, devA.body.user.id).expect(200);
      await track(response);
      const conversationId = response.body.id as string;
      await readMessages(boss, conversationId).expect(200);

      const before = await prisma.conversationMember.count({ where: { conversationId } });
      await prisma.projectMember.deleteMany({
        where: { projectId: scopedProjectId, userId: devA.body.user.id },
      });
      try {
        await readMessages(boss, conversationId).expect(403);
        await send(boss, conversationId, 'Still there?').expect(403);
        await readMessages(devA, conversationId).expect(403);
        expect(await prisma.conversationMember.count({ where: { conversationId } })).toBe(before);
      } finally {
        await prisma.projectMember.create({
          data: {
            projectId: scopedProjectId,
            userId: devA.body.user.id,
            role: PROJECT_MEMBER_ROLE.DEVELOPER,
          },
        });
      }
    });
  });

  // -------------------------------------------------------------------------------------------
  // Groups
  // -------------------------------------------------------------------------------------------

  describe('a group', () => {
    async function group(): Promise<string> {
      const response = await createGroup(boss, {
        title: `Closing squad ${stamp}`,
        memberIds: [devA.body.user.id],
      }).expect(201);
      return track(response);
    }

    it('is created by somebody with everybody in it inside their reach', async () => {
      const id = await group();
      const detail = await api()
        .get(`/api/v1/conversations/${id}`)
        .set('Authorization', bearer(boss))
        .expect(200);

      expect(detail.body.kind).toBe(CONVERSATION_KIND.GROUP);
      expect(detail.body.project).toBeNull();
      expect(detail.body.abilities).toMatchObject({
        canManage: true,
        canLeave: true,
        canPost: true,
      });
      const owner = detail.body.participants.find(
        (member: { id: string }) => member.id === bossUserId,
      );
      expect(owner.memberRole).toBe('OWNER');
    });

    it('refuses one containing a client', async () => {
      await createGroup(boss, {
        title: 'Not allowed',
        memberIds: [devA.body.user.id, clientAdmin.body.user.id],
      }).expect(403);
      expect(await prisma.conversation.count({ where: { title: 'Not allowed' } })).toBe(0);
    });

    it('refuses one containing somebody outside the creator’s reach', async () => {
      await createGroup(boss, {
        title: 'Not allowed outsider',
        memberIds: [devA.body.user.id, outsiderUserId],
      }).expect(403);
    });

    it('refuses a developer creating a group at all, even with a teammate', async () => {
      await createGroup(devA, { title: 'Devs only', memberIds: [outsiderUserId] }).expect(403);
      await createGroup(devA, { title: 'With a teammate', memberIds: [pm.body.user.id] }).expect(
        403,
      );
    });

    it('refuses adding a client, in the API', async () => {
      const id = await group();

      await api()
        .post(`/api/v1/conversations/${id}/members`)
        .set('Authorization', bearer(boss))
        .send({ userId: clientAdmin.body.user.id })
        .expect(403);
      const members = await api()
        .get(`/api/v1/conversations/${id}/members`)
        .set('Authorization', bearer(boss))
        .expect(200);
      expect(members.body.map((row: { id: string }) => row.id)).not.toContain(
        clientAdmin.body.user.id,
      );
    });

    it('refuses an ordinary member changing who is in it or what it is called', async () => {
      const id = await group();

      await api()
        .post(`/api/v1/conversations/${id}/members`)
        .set('Authorization', bearer(devA))
        .send({ userId: pm.body.user.id })
        .expect(403);
      await api()
        .patch(`/api/v1/conversations/${id}`)
        .set('Authorization', bearer(devA))
        .send({ title: 'Renamed by a member' })
        .expect(403);
    });

    it('lets its owner rename it, which used to be impossible', async () => {
      const id = await group();

      const renamed = await api()
        .patch(`/api/v1/conversations/${id}`)
        .set('Authorization', bearer(boss))
        .send({ title: `Renamed ${stamp}` })
        .expect(200);
      expect(renamed.body.title).toBe(`Renamed ${stamp}`);
    });

    it('takes access away the moment somebody is removed, and keeps the record that they were in it', async () => {
      const id = await group();
      await send(boss, id, 'Before the removal').expect(201);
      await readMessages(devA, id).expect(200);

      await api()
        .delete(`/api/v1/conversations/${id}/members/${devA.body.user.id}`)
        .set('Authorization', bearer(boss))
        .expect(200);

      await readMessages(devA, id).expect(403);
      await send(devA, id, 'Still here?').expect(403);
      const row = await prisma.conversationMember.findFirstOrThrow({
        where: { conversationId: id, userId: devA.body.user.id },
      });
      // A tombstone, not a deletion: the thread still renders who said what.
      expect(row.leftAt).not.toBeNull();
    });

    it('lets somebody leave, and refuses to remove the owner', async () => {
      const id = await group();

      await api()
        .delete(`/api/v1/conversations/${id}/members/${bossUserId}`)
        .set('Authorization', bearer(boss))
        .expect(400);
      await api()
        .post(`/api/v1/conversations/${id}/leave`)
        .set('Authorization', bearer(devA))
        .expect(204);
      await readMessages(devA, id).expect(403);
    });

    it('keeps a removed member out of the conversation list without deleting anything', async () => {
      const id = await group();
      await api()
        .delete(`/api/v1/conversations/${id}/members/${devA.body.user.id}`)
        .set('Authorization', bearer(boss))
        .expect(200);

      const listed = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      expect(listed.body.map((row: { id: string }) => row.id)).not.toContain(id);
    });

    it('refuses a client every route', async () => {
      const id = await group();
      const answers = await Promise.all([
        api().get(`/api/v1/conversations/${id}`).set('Authorization', bearer(clientAdmin)),
        api().get(`/api/v1/conversations/${id}/members`).set('Authorization', bearer(clientAdmin)),
        api()
          .post(`/api/v1/conversations/${id}/members`)
          .set('Authorization', bearer(clientAdmin))
          .send({ userId: devA.body.user.id }),
        api().post(`/api/v1/conversations/${id}/leave`).set('Authorization', bearer(clientAdmin)),
      ]);
      for (const answer of answers) {
        expect([403, 404]).toContain(answer.status);
      }
    });
  });

  describe('a project team group', () => {
    it('is named after the project and includes everybody on its team', async () => {
      await api()
        .get(`/api/v1/projects/${scopedProjectId}`)
        .set('Authorization', bearer(boss))
        .expect(200);

      const listed = await api()
        .get('/api/v1/conversations')
        .set('Authorization', bearer(devA))
        .expect(200);
      const group = listed.body.find(
        (row: { kind: string; title: string }) =>
          row.kind === CONVERSATION_KIND.GROUP && row.title === 'Scope messaging fixture',
      ) as { id: string } | undefined;

      expect(group).toBeDefined();
      createdConversationIds.push(group!.id);

      const detail = await api()
        .get(`/api/v1/conversations/${group!.id}`)
        .set('Authorization', bearer(devA))
        .expect(200);
      const ids = detail.body.participants.map((member: { id: string }) => member.id);
      expect(ids).toContain(bossUserId);
      expect(ids).toContain(devA.body.user.id);

      await send(devA, group!.id, 'Hello team').expect(201);
      const seen = await readMessages(boss, group!.id).expect(200);
      expect(seen.body.items.some((row: { body: string }) => row.body === 'Hello team')).toBe(
        true,
      );
    });
  });

  // -------------------------------------------------------------------------------------------
  // Oversight, which was widened in exactly one place
  // -------------------------------------------------------------------------------------------

  describe('a super admin', () => {
    it('may start a scope conversation but still may not write in a project thread they are not on', async () => {
      const group = await createGroup(director, {
        title: `Admin group ${stamp}`,
        memberIds: [outsiderUserId],
      }).expect(201);
      await track(group);
      await send(director, group.body.id, 'Made by an administrator').expect(201);

      // The lift is scope-only. A project channel of a project the director is not on is exactly
      // as closed to them as it was: they read it through oversight and write nothing.
      const projectThread = await api()
        .post('/api/v1/conversations')
        .set('Authorization', bearer(boss))
        .send({ kind: CONVERSATION_KIND.PROJECT, projectId: scopedProjectId })
        .expect(200);
      await track(projectThread);

      await readMessages(director, projectThread.body.id).expect(200);
      const refusal = await send(director, projectThread.body.id, 'Oversight writing').expect(403);
      expect(refusal.body.message).toBe('Oversight access is read-only');
    });

    it('reads a group they are not in, and may not post into it or add to it', async () => {
      const group = await createGroup(boss, {
        title: `Private squad ${stamp}`,
        memberIds: [devA.body.user.id],
      }).expect(201);
      await track(group);
      await send(boss, group.body.id, 'Internal chatter').expect(201);

      await readMessages(director, group.body.id).expect(200);
      await send(director, group.body.id, 'Joining in').expect(403);
      await api()
        .post(`/api/v1/conversations/${group.body.id}/members`)
        .set('Authorization', bearer(director))
        .send({ userId: outsiderUserId })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------------------------
  // What the abilities promise, and what the endpoints actually do
  // -------------------------------------------------------------------------------------------

  /**
   * `abilities` exists so a client never has to work out for itself whether a control will be
   * accepted. The moment one of them disagrees with its endpoint the whole idea is worse than
   * useless: a hidden control is a feature the user cannot find, and an offered one that fails is
   * a bug report.
   *
   * `canCall` disagreed. `scopeDecision` reached its `CALL` branch and allowed it, while
   * `POST /conversations/:id/calls` refuses any conversation with no project, so a group offered a
   * call button that always failed. Nothing was insecure — the endpoint is the control — but both
   * clients had to ask about `project` themselves to know what to draw.
   *
   * The assertion below pins the *agreement* rather than the value, for every kind. A future change
   * that makes one side right and the other wrong fails here whichever side moves, which asserting
   * `canCall === false` for a group would not have done.
   */
  describe('abilities and endpoints agree', () => {
    async function abilitiesOf(session: Session, conversationId: string) {
      const detail = await api()
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', bearer(session))
        .expect(200);
      return detail.body.abilities as { canCall: boolean; canPost: boolean; reason: string | null };
    }

    /** Every kind, built by the endpoints that build them, with somebody to call where that means anything. */
    async function everyKind(): Promise<Array<{ kind: string; id: string; withUserId?: string }>> {
      const project = await api()
        .post('/api/v1/conversations')
        .set('Authorization', bearer(boss))
        .send({ kind: CONVERSATION_KIND.PROJECT, projectId: scopedProjectId })
        .expect(200);
      const task = await api()
        .post('/api/v1/conversations')
        .set('Authorization', bearer(boss))
        .send({ kind: CONVERSATION_KIND.TASK, taskId })
        .expect(200);
      const ticket = await api()
        .post('/api/v1/conversations')
        .set('Authorization', bearer(boss))
        .send({ kind: CONVERSATION_KIND.TICKET, ticketId })
        .expect(200);
      const direct = await api()
        .post('/api/v1/conversations')
        .set('Authorization', bearer(boss))
        .send({
          kind: CONVERSATION_KIND.DIRECT,
          projectId: scopedProjectId,
          withUserId: devA.body.user.id,
        })
        .expect(200);
      const scopeDirect = await openDirect(boss, devA.body.user.id).expect(200);
      const group = await createGroup(boss, {
        title: `Agreement group ${stamp}`,
        memberIds: [devA.body.user.id],
      }).expect(201);

      for (const response of [project, task, ticket, direct, scopeDirect, group]) {
        createdConversationIds.push(response.body.id);
      }
      return [
        // The three derived kinds have many people in them, so the endpoint asks *who* to ring.
        { kind: CONVERSATION_KIND.PROJECT, id: project.body.id, withUserId: devA.body.user.id },
        { kind: CONVERSATION_KIND.TASK, id: task.body.id, withUserId: devA.body.user.id },
        { kind: CONVERSATION_KIND.TICKET, id: ticket.body.id, withUserId: devA.body.user.id },
        // A pair names its own counterpart.
        { kind: CONVERSATION_KIND.DIRECT, id: direct.body.id },
        { kind: CONVERSATION_KIND.SCOPE_DIRECT, id: scopeDirect.body.id },
        { kind: CONVERSATION_KIND.GROUP, id: group.body.id },
      ];
    }

    it('offers a call exactly where the call endpoint would place one', async () => {
      const conversations = await everyKind();
      const compared: Array<{ kind: string; canCall: boolean; endpointAccepts: boolean }> = [];

      for (const conversation of conversations) {
        const { canCall } = await abilitiesOf(boss, conversation.id);
        // The endpoint's own answer, taken by actually asking it. The IVR provider is the mock —
        // the test harness forces it — so a permitted call reaches a recorded intent and no
        // telephone.
        const placed = await api()
          .post(`/api/v1/conversations/${conversation.id}/calls`)
          .set('Authorization', bearer(boss))
          .send(conversation.withUserId ? { withUserId: conversation.withUserId } : {});
        compared.push({
          kind: conversation.kind,
          canCall,
          endpointAccepts: placed.status < 400,
        });
      }

      // The property: for every kind, the ability and the endpoint say the same thing.
      for (const row of compared) {
        expect({ kind: row.kind, canCall: row.canCall }).toEqual({
          kind: row.kind,
          canCall: row.endpointAccepts,
        });
      }
      // And the answers are not all the same, so the agreement above is not vacuous.
      expect(compared.filter((row) => row.canCall)).toHaveLength(4);
      expect(
        compared
          .filter((row) => !row.canCall)
          .map((row) => row.kind)
          .sort(),
      ).toEqual([CONVERSATION_KIND.GROUP, CONVERSATION_KIND.SCOPE_DIRECT].sort());
    });

    it('does not put the missing call under the composer of a group', async () => {
      // `reason` is the one line a screen shows beneath the composer. "Calls are placed from a
      // project conversation" is true of every group for ever, and is about a control a group does
      // not have rather than about this person — so posting being fine has to read as fine.
      const group = await createGroup(boss, {
        title: `Composer group ${stamp}`,
        memberIds: [devA.body.user.id],
      }).expect(201);
      createdConversationIds.push(group.body.id);

      const abilities = await abilitiesOf(boss, group.body.id);
      expect(abilities).toMatchObject({ canPost: true, canCall: false, reason: null });
    });
  });

  // -------------------------------------------------------------------------------------------
  // The cost of a list
  // -------------------------------------------------------------------------------------------

  /**
   * The two endpoints this change makes busier used to ask the database once per row.
   *
   * `filterVisible` called `policy.decide` in an awaited loop, and `decide` is a settings read
   * plus two membership reads plus, for some pairs, two more — so a page of fifty conversations
   * was a couple of hundred sequential round trips before anything had been mapped. The contacts
   * endpoint was worse: up to five hundred candidates, each costing a decision *and* a lookup for
   * an existing thread.
   *
   * The measurement is deliberately of both shapes against the same rows, in the same request, so
   * the numbers are comparable rather than remembered: the loop is still exactly what `decide`
   * does, so counting it is counting the old implementation.
   */
  describe('the cost of a list', () => {
    let conversationsService: ConversationsService;
    let policy: CommunicationPolicyService;
    let repository: ConversationsRepository;

    beforeAll(async () => {
      conversationsService = app.get(ConversationsService);
      policy = app.get(CommunicationPolicyService);
      repository = app.get(ConversationsRepository);

      // A page with something on it, and a mix of both branches: a project channel, several
      // project-anchored direct conversations (each of which costs a counterpart lookup) and the
      // scope conversations the tests above left behind.
      await prisma.projectMember.createMany({
        data: [
          { projectId: scopedProjectId, userId: pm.body.user.id, role: PROJECT_MEMBER_ROLE.LEAD },
          {
            projectId: scopedProjectId,
            userId: lead.body.user.id,
            role: PROJECT_MEMBER_ROLE.LEAD,
          },
          {
            projectId: scopedProjectId,
            userId: director.body.user.id,
            role: PROJECT_MEMBER_ROLE.MANAGER,
          },
        ],
        skipDuplicates: true,
      });
      const opened = [
        await api()
          .post('/api/v1/conversations')
          .set('Authorization', bearer(boss))
          .send({ kind: CONVERSATION_KIND.PROJECT, projectId: scopedProjectId })
          .expect(200),
      ];
      for (const other of [devA, pm, lead, director]) {
        opened.push(
          await api()
            .post('/api/v1/conversations')
            .set('Authorization', bearer(boss))
            .send({
              kind: CONVERSATION_KIND.DIRECT,
              projectId: scopedProjectId,
              withUserId: other.body.user.id,
            })
            .expect(200),
        );
      }
      for (const response of opened) {
        createdConversationIds.push(response.body.id);
      }
    });

    /** Counts the SQL statements Prisma issues through the pool while `run` is awaited. */
    async function queries(run: () => Promise<unknown>): Promise<number> {
      const spy = jest.spyOn(prisma.pool, 'query');
      spy.mockClear();
      try {
        await run();
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    }

    /** The `AuthenticatedUser` the guard would have built for this session. */
    function actorFor(session: Session): AuthenticatedUser {
      return {
        userId: session.body.user.id,
        organizationId: session.body.user.organization.id,
        roleKey: session.body.user.roleKey,
        permissions: [...session.body.user.permissions],
        isServiceProvider: session.body.user.organization.isServiceProvider,
      };
    }

    it('decides a whole page of conversations in a fixed number of queries', async () => {
      const actor = actorFor(boss);
      const rows = await repository.listFor(providerOrgId, actor.userId, { limit: 50 });
      expect(rows.length).toBeGreaterThan(3);

      // What `filterVisible` used to be, line for line: `policy.decide` per row, awaited. It is
      // still exactly what `decide` does, so counting it counts the old implementation.
      const oneAtATime = await queries(async () => {
        for (const row of rows) {
          await policy.decide(
            actor,
            COMMUNICATION_ACTION.READ,
            conversationsService.contextOf(row, actor.userId),
          );
        }
      });
      const batched = await queries(() => conversationsService.filterVisible(actor, rows));

      // The old shape costs at least a round trip a row — the settings read alone guarantees that,
      // before either membership lookup — so its cost is the length of the page. The batched one
      // costs a handful for the whole page however long it is, and the gap widens with every
      // conversation somebody is in. The `does not grow` test below pins the flatness itself; this
      // one pins the gap.
      //
      // The ceiling moved from twelve to fifteen when task conversations stopped being decided on
      // project membership alone. Three statements were added, all of them for the whole page and
      // none of them per row: two resolve the caller's task-chat scope (the teams they lead, the
      // projects they manage or lead) and one asks which of the page's tasks that scope admits.
      // They are paid only when the page actually holds a task conversation, and `GET
      // /conversations` pays all three exactly once for the *whole request* rather than twice: it
      // resolves the scope to build its page with — the predicate has to be in the query, or a
      // project's unrelated task threads would fill the page — and hands the same snapshot on to
      // this decision instead of letting it resolve a second one. Measured end to end, the
      // endpoint went from nineteen statements to twenty-two at fifteen rows, and stays there at
      // any page size.
      //
      // It moved again, fifteen to eighteen, when a manager's reach started including the people
      // on teams they sit on as well as the ones they manage. That is three more statements for
      // the whole page (the caller's own project and team memberships, then the other members of
      // those), still none per row.
      expect(oneAtATime).toBeGreaterThanOrEqual(rows.length);
      expect(batched).toBeLessThanOrEqual(18);
      expect(batched * 2).toBeLessThan(oneAtATime);
    });

    it('does not grow when the page does', async () => {
      const actor = actorFor(boss);
      const rows = await repository.listFor(providerOrgId, actor.userId, { limit: 50 });
      const twice = [...rows, ...rows];

      const forOne = await queries(() => conversationsService.filterVisible(actor, rows));
      const forAll = await queries(() => conversationsService.filterVisible(actor, twice));

      expect(forAll).toBe(forOne);
    });

    it('answers the contacts endpoint in a fixed number of queries', async () => {
      const actor = actorFor(pm);
      const response = await api()
        .get('/api/v1/conversations/contacts')
        .set('Authorization', bearer(pm))
        .expect(200);
      const contacts = response.body as Array<{ id: string; projectId: string }>;
      expect(contacts.length).toBeGreaterThan(3);

      // What the endpoint used to do per candidate: a policy decision, and a lookup for an
      // existing thread. Over a candidate limit of five hundred, on the screen's default view.
      const oneAtATime = await queries(async () => {
        for (const contact of contacts) {
          await policy.decide(actor, COMMUNICATION_ACTION.CREATE, {
            projectId: contact.projectId,
            withUserId: contact.id,
          });
          await repository.findByAnchor(
            providerOrgId,
            anchorKeyFor({
              kind: CONVERSATION_KIND.DIRECT,
              projectId: contact.projectId,
              directKey: directKeyFor(actor.userId, contact.id),
            }),
          );
        }
      });
      const whole = await queries(() =>
        api().get('/api/v1/conversations/contacts').set('Authorization', bearer(pm)).expect(200),
      );

      // And the batched figure counts a whole HTTP request, authentication and all.
      expect(oneAtATime).toBeGreaterThanOrEqual(contacts.length * 3);
      expect(whole * 2).toBeLessThan(oneAtATime);
    });
  });
});
