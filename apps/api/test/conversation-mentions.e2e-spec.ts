import type { INestApplication } from '@nestjs/common';
import { CONVERSATION_KIND, MAX_MENTIONABLE_LIMIT } from '@ashniva/types';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Who may be mentioned, and what happens to a name that may not.
 *
 * The composer has always said "type @ to mention somebody" and the server has never had an
 * opinion about who that somebody could be: a mention was a user id typed into a body, and the
 * only thing between a forged one and a notification was that the notification path happened to
 * intersect it with the delivery audience. That was a property of one file rather than a rule, and
 * it left the forged id in the stored message for every renderer to resolve.
 *
 * Two things are asserted here and they are two halves of one guarantee: the picker offers exactly
 * the conversation's own audience, and the send path refuses anything else. A picker that is
 * narrower than the send check is merely a hidden control; a send check narrower than the picker
 * offers people the message will silently fail to reach.
 */
describe('Conversation mentions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let director: Session;
  let pm: Session;
  let lead: Session;
  let devA: Session;
  let devB: Session;
  let tester: Session;
  /**
   * A colleague in the same tenant who is on no project of this fixture.
   *
   * Deliberately somebody real and internal rather than a client or another tenant: those are
   * refused by the tenant scope long before a mention is considered, so they would prove nothing
   * about the mention check. This person could be messaged, could be assigned work, and simply is
   * not in this conversation.
   */
  let outsider: Session;

  let providerOrgId: string;
  let projectId: string;
  let taskId: string;
  let channelId: string;
  let taskConversationId: string;

  const createdTaskIds: string[] = [];

  const api = () => request(app.getHttpServer());

  function open(session: Session, body: Record<string, unknown>) {
    return api().post('/api/v1/conversations').set('Authorization', bearer(session)).send(body);
  }

  function send(session: Session, id: string, body: Record<string, unknown>) {
    return api()
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Authorization', bearer(session))
      .send(body);
  }

  function mentionable(session: Session, id: string, query = '') {
    return api()
      .get(`/api/v1/conversations/${id}/mentionable${query}`)
      .set('Authorization', bearer(session));
  }

  const mentionsOf = (userId: string, entityId: string) =>
    prisma.notification.count({
      where: { userId, entityId, type: 'CONVERSATION_MENTION' },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    [director, pm, lead, devA, devB, tester, outsider] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.developer2),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.support),
    ]);

    const org = await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } });
    providerOrgId = org.id;

    const stamp = Date.now().toString().slice(-6);
    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: `MEN${stamp}`,
        name: 'Mention fixture',
        description: 'Created by conversation-mentions.e2e-spec.ts',
        type: 'MONTHLY_CONTRACT',
        status: 'ACTIVE',
        managerUserId: pm.body.user.id,
        leadUserId: lead.body.user.id,
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    projectId = project.id;

    await prisma.projectMember.createMany({
      data: [
        { projectId, userId: pm.body.user.id, role: 'MANAGER' },
        { projectId, userId: lead.body.user.id, role: 'LEAD' },
        { projectId, userId: devA.body.user.id, role: 'DEVELOPER' },
        { projectId, userId: devB.body.user.id, role: 'DEVELOPER' },
        { projectId, userId: tester.body.user.id, role: 'TESTER' },
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
        projectId,
        number: counter.value,
        title: 'Mention fixture task',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        createdById: pm.body.user.id,
        assignedToId: devA.body.user.id,
      },
      select: { id: true },
    });
    taskId = task.id;
    createdTaskIds.push(taskId);

    channelId = (await open(devA, { kind: CONVERSATION_KIND.PROJECT, projectId }).expect(200)).body
      .id;
    taskConversationId = (await open(devA, { kind: CONVERSATION_KIND.TASK, taskId }).expect(200))
      .body.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: {
        entityType: 'conversation',
        entityId: { in: [channelId, taskConversationId].filter(Boolean) },
      },
    });
    await prisma.message.deleteMany({ where: { projectId } });
    await prisma.conversationMember.deleteMany({ where: { conversation: { projectId } } });
    await prisma.conversation.deleteMany({ where: { projectId } });
    await prisma.taskStatusHistory.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await app.close();
  });

  // ---------------------------------------------------------------------------------------------
  // GET /conversations/:id/mentionable
  // ---------------------------------------------------------------------------------------------

  describe('the mentionable audience', () => {
    it('offers the project channel’s own members, and never the whole company', async () => {
      const page = await mentionable(devA, channelId, '?limit=25').expect(200);
      const ids = page.body.items.map((person: { userId: string }) => person.userId);

      expect(ids).toEqual(expect.arrayContaining([pm.body.user.id, lead.body.user.id]));
      // The person on no project of this fixture. There is a directory endpoint in this product
      // and this is deliberately not it.
      expect(ids).not.toContain(outsider.body.user.id);
      // Nobody is offered themselves: mentioning yourself notifies nobody.
      expect(ids).not.toContain(devA.body.user.id);
    });

    it('offers a task thread only the people with a place on the task', async () => {
      const page = await mentionable(devA, taskConversationId, '?limit=25').expect(200);
      const ids = page.body.items.map((person: { userId: string }) => person.userId);

      // The manager and the lead of the project are in it; another developer on the same project
      // is not, because the task is not theirs.
      expect(ids).toEqual(expect.arrayContaining([pm.body.user.id, lead.body.user.id]));
      expect(ids).not.toContain(devB.body.user.id);
      expect(ids).not.toContain(tester.body.user.id);
      expect(ids).not.toContain(outsider.body.user.id);
    });

    it('carries a name, an email, a role and the reason each person is reachable', async () => {
      const page = await mentionable(devA, channelId, '?limit=25').expect(200);
      const manager = page.body.items.find(
        (person: { userId: string }) => person.userId === pm.body.user.id,
      );

      expect(manager.name).toBe(pm.body.user.name);
      expect(manager.email).toBe(pm.body.user.email);
      expect(manager.roleName).toBeTruthy();
      expect(manager.contextLabel).toContain('MEN');
    });

    it('searches on name and on email', async () => {
      const term = pm.body.user.email.slice(0, 4);
      const byEmail = await mentionable(
        devA,
        channelId,
        `?q=${encodeURIComponent(term)}&limit=25`,
      ).expect(200);
      expect(byEmail.body.items.map((person: { userId: string }) => person.userId)).toContain(
        pm.body.user.id,
      );

      const nothing = await mentionable(devA, channelId, '?q=zzzznobody&limit=25').expect(200);
      expect(nothing.body.items).toEqual([]);
    });

    it('a search term cannot widen the audience', async () => {
      // The search runs *inside* the audience, so naming somebody outside it precisely still
      // returns nothing. A picker whose search hit a user table would answer differently.
      const page = await mentionable(
        devA,
        taskConversationId,
        `?q=${encodeURIComponent(outsider.body.user.email)}&limit=25`,
      ).expect(200);
      expect(page.body.items).toEqual([]);
    });

    it('pages rather than returning the whole audience', async () => {
      const first = await mentionable(devA, channelId, '?limit=1').expect(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.nextCursor).toBe(first.body.items[0].userId);

      const second = await mentionable(
        devA,
        channelId,
        `?limit=1&cursor=${first.body.nextCursor}`,
      ).expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.items[0].userId).not.toBe(first.body.items[0].userId);
    });

    it('refuses a limit above the cap rather than honouring it', async () => {
      await mentionable(devA, channelId, `?limit=${MAX_MENTIONABLE_LIMIT + 1}`).expect(400);
    });

    it('is refused to somebody with no place in the conversation', async () => {
      expect((await mentionable(devB, taskConversationId)).status).toBe(404);
      expect((await mentionable(outsider, channelId)).status).toBe(403);
    });

    it('hands an inspector an empty list rather than a roster', async () => {
      // Oversight is a grant to read what people said, not a directory of who they are. The
      // inspector can read the thread; there is nobody in it for them to address.
      const page = await mentionable(director, taskConversationId).expect(200);
      expect(page.body.items).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Validation on send
  // ---------------------------------------------------------------------------------------------

  describe('sending a mention', () => {
    it('notifies a permitted person exactly once', async () => {
      const before = await mentionsOf(lead.body.user.id, channelId);
      await send(devA, channelId, {
        body: `@[${lead.body.user.id}] can you look at ${randomUUID()}?`,
      }).expect(201);

      expect(await mentionsOf(lead.body.user.id, channelId)).toBe(before + 1);
    });

    it('refuses a forged id — one that names a real employee outside the thread', async () => {
      const before = await mentionsOf(outsider.body.user.id, channelId);
      const refused = await send(devA, channelId, {
        body: `@[${outsider.body.user.id}] come and look`,
      });

      expect(refused.status).toBe(400);
      expect(refused.body.message).toBe(
        'You cannot mention somebody who is not in this conversation',
      );
      expect(await mentionsOf(outsider.body.user.id, channelId)).toBe(before);
      // Nothing stored, so nothing for a renderer to resolve later.
      expect(
        await prisma.message.count({
          where: { conversationId: channelId, body: { contains: outsider.body.user.id } },
        }),
      ).toBe(0);
    });

    it('refuses a forged id in a task thread, including a project colleague', async () => {
      // devB is on the project and would have been in the *channel's* audience. In the task's
      // thread they are not, and the send path has to agree with the picker about that.
      const refused = await send(devA, taskConversationId, {
        body: `@[${devB.body.user.id}] have a look`,
      });
      expect(refused.status).toBe(400);
      expect(await mentionsOf(devB.body.user.id, taskConversationId)).toBe(0);
    });

    it('refuses an id that is not a user at all', async () => {
      const refused = await send(devA, channelId, { body: `@[${randomUUID()}] hello` });
      expect(refused.status).toBe(400);
    });

    it('records the refused ids in the audit trail', async () => {
      await send(devA, channelId, { body: `@[${outsider.body.user.id}] again` }).expect(400);

      const rows = await prisma.auditLog.findMany({
        where: {
          action: 'conversation.access_denied',
          actorUserId: devA.body.user.id,
          entityId: channelId,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      const after = rows[0]?.after as { attempted?: string; userIds?: string[] };
      expect(after?.attempted).toBe('MENTION');
      expect(after?.userIds).toEqual([outsider.body.user.id]);
    });

    it('lets somebody quote themselves', async () => {
      // The sender is in their own conversation's audience even though the picker does not offer
      // them, so a self-mention is not a forgery.
      await send(devA, channelId, { body: `@[${devA.body.user.id}] note to self` }).expect(201);
    });

    it('refuses an edit that introduces a mention a send would have refused', async () => {
      const posted = await send(devA, channelId, { body: 'Nothing to see here' }).expect(201);
      const refused = await api()
        .patch(`/api/v1/conversations/${channelId}/messages/${posted.body.id}`)
        .set('Authorization', bearer(devA))
        .send({ body: `@[${outsider.body.user.id}] look now` });

      expect(refused.status).toBe(400);
      const unchanged = await prisma.message.findUniqueOrThrow({ where: { id: posted.body.id } });
      expect(unchanged.body).toBe('Nothing to see here');
      expect(unchanged.editedAt).toBeNull();
    });

    it('offers only names the send path will accept', async () => {
      // The property the two halves exist for, asserted against each other rather than against a
      // list written out by hand: every name the picker gives is one a message may carry.
      const page = await mentionable(devA, taskConversationId, '?limit=25').expect(200);
      expect(page.body.items.length).toBeGreaterThan(0);
      for (const person of page.body.items as Array<{ userId: string }>) {
        await send(devA, taskConversationId, {
          body: `@[${person.userId}] ${randomUUID()}`,
        }).expect(201);
      }
    });
  });
});
