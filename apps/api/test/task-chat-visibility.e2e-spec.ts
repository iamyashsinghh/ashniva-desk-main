import type { INestApplication } from '@nestjs/common';
import { CONVERSATION_KIND } from '@ashniva/types';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { RealtimeService } from '../src/infrastructure/realtime/realtime.service';
import { CommunicationGateway } from '../src/modules/communication/communication.gateway';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Who is in a task's conversation, and who is refused it.
 *
 * UAT found a developer being shown the task conversations of tasks that were not theirs. The
 * cause was that a `TASK` conversation was judged on project membership alone — the same fact that
 * decides a project channel — so everybody on the project was in every task's thread.
 *
 * The assertions that carry the weight here are the negative ones, and the point of the file is
 * that there are *seven* of them for one unrelated person: the list, the search the list feeds, the
 * conversation itself, its message history, the websocket subscription, the websocket *delivery*,
 * and the notification. A control that exists on the list and not on the socket is not a control,
 * so every surface is asserted separately rather than one being taken as evidence for the rest.
 *
 * The fixture is one project with six people on it and one task that belongs to two of them:
 *
 *  * `devA` — the task's assignee.
 *  * `tester` — holds a `TestingAssignment` on it, and is named nowhere on the task row itself.
 *  * `pm` — `projects.manager_user_id`.
 *  * `lead` — `projects.lead_user_id`.
 *  * `devB` — **a project member and nothing else**, which is the defect made into a person.
 *  * `support` — leads a team `devA` is on, and is not on the project at all.
 *  * `director` — the super admin, who reaches everything through oversight and nothing without it.
 */
describe('Task conversation visibility (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: CommunicationGateway;

  let director: Session;
  let pm: Session;
  let lead: Session;
  let devA: Session;
  let devB: Session;
  let tester: Session;
  let teamLead: Session;

  let providerOrgId: string;
  let projectId: string;
  let teamId: string;
  /** The task devA is assigned and tester was asked to test. */
  let taskId: string;
  /** A second task on the same project, assigned to nobody the assertions care about. */
  let otherTaskId: string;
  let conversationId: string;
  let otherConversationId: string;

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

  function readMessages(session: Session, id: string) {
    return api().get(`/api/v1/conversations/${id}/messages`).set('Authorization', bearer(session));
  }

  function listConversations(session: Session) {
    return api().get('/api/v1/conversations?limit=100').set('Authorization', bearer(session));
  }

  /** A socket that records what it was asked to join, so a silent join cannot pass. */
  function socketFor(session: Session) {
    const joined: string[] = [];
    const socket = {
      handshake: { auth: { token: session.accessToken } },
      join: (room: string) => {
        joined.push(room);
        return Promise.resolve();
      },
      leave: () => Promise.resolve(),
    };
    return { joined, socket: socket as unknown as Socket };
  }

  async function newTask(data: {
    assignedToId?: string;
    createdById: string;
    title: string;
  }): Promise<string> {
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
        title: data.title,
        description: 'Created by task-chat-visibility.e2e-spec.ts',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        createdById: data.createdById,
        ...(data.assignedToId ? { assignedToId: data.assignedToId } : {}),
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);
    return task.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    gateway = app.get(CommunicationGateway);

    [director, pm, lead, devA, devB, tester, teamLead] = await Promise.all([
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
        code: `TCV${stamp}`,
        name: 'Task chat visibility fixture',
        description: 'Created by task-chat-visibility.e2e-spec.ts',
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
        // The person the whole file is about: on the project, on none of its tasks.
        { projectId, userId: devB.body.user.id, role: 'DEVELOPER' },
        { projectId, userId: tester.body.user.id, role: 'TESTER' },
        // A team lead reaches their people's work whether or not they are on the project, so this
        // one deliberately is on it — the team clause has to hold on its own, and would be
        // indistinguishable from the project clause if the two always came together.
        { projectId, userId: teamLead.body.user.id, role: 'DEVELOPER' },
      ],
      skipDuplicates: true,
    });

    const team = await prisma.team.create({
      data: {
        organizationId: providerOrgId,
        name: `Task chat fixture team ${stamp}`,
        leadUserId: teamLead.body.user.id,
      },
      select: { id: true },
    });
    teamId = team.id;
    await prisma.teamMember.create({ data: { teamId, userId: devA.body.user.id } });

    taskId = await newTask({
      assignedToId: devA.body.user.id,
      createdById: pm.body.user.id,
      title: 'Fix the export job',
    });
    otherTaskId = await newTask({
      createdById: pm.body.user.id,
      title: 'Nobody in this file is on this one',
    });

    // The tester's place on the task is an assignment row rather than `tasks.tester_id`, because
    // that is the relation the QA queue actually uses and the one a naive predicate misses.
    await prisma.testingAssignment.create({
      data: {
        organizationId: providerOrgId,
        projectId,
        kind: 'QA',
        taskId,
        assignedToUserId: tester.body.user.id,
        assignedById: pm.body.user.id,
      },
    });

    conversationId = (await open(devA, { kind: CONVERSATION_KIND.TASK, taskId }).expect(200)).body
      .id;
    otherConversationId = (
      await open(pm, { kind: CONVERSATION_KIND.TASK, taskId: otherTaskId }).expect(200)
    ).body.id;
    await send(devA, conversationId, { body: 'Pushed the first cut of the export fix' }).expect(
      201,
    );
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: {
        entityType: 'conversation',
        entityId: { in: [conversationId, otherConversationId].filter(Boolean) },
      },
    });
    await prisma.message.deleteMany({ where: { projectId } });
    await prisma.conversationMember.deleteMany({ where: { conversation: { projectId } } });
    await prisma.conversation.deleteMany({ where: { projectId } });
    await prisma.testingAssignment.deleteMany({ where: { projectId } });
    await prisma.taskStatusHistory.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.teamMember.deleteMany({ where: { teamId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await app.close();
  });

  // ---------------------------------------------------------------------------------------------
  // The people a task admits
  // ---------------------------------------------------------------------------------------------

  describe('a place on the work', () => {
    it('lets the assignee list, open and read their own task’s conversation', async () => {
      const listed = await listConversations(devA).expect(200);
      expect(listed.body.map((row: { id: string }) => row.id)).toContain(conversationId);

      await api()
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', bearer(devA))
        .expect(200);
      const history = await readMessages(devA, conversationId).expect(200);
      expect(history.body.items.at(-1).body).toBe('Pushed the first cut of the export fix');
    });

    it('lets the tester in through a testing assignment alone', async () => {
      // Nothing on the task row names them: not `tester_id`, not `assigned_to_id`. The assignment
      // is the whole of their relationship, and it is the one a predicate written from the task's
      // own columns would miss.
      const task = await prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { testerId: true, assignedToId: true, reviewerId: true },
      });
      expect(task.testerId).toBeNull();

      await readMessages(tester, conversationId).expect(200);
    });

    it('lets the project’s manager and lead in', async () => {
      await readMessages(pm, conversationId).expect(200);
      await readMessages(lead, conversationId).expect(200);
    });

    it('lets a team lead reach the work of somebody on their team', async () => {
      await readMessages(teamLead, conversationId).expect(200);

      // And the reach ends with the team: `otherTask` belongs to nobody on it.
      expect((await readMessages(teamLead, otherConversationId)).status).toBe(404);
    });

    it('drops the team lead the moment their person leaves the team', async () => {
      await prisma.teamMember.deleteMany({ where: { teamId, userId: devA.body.user.id } });
      try {
        expect((await readMessages(teamLead, conversationId)).status).toBe(404);
      } finally {
        await prisma.teamMember.create({ data: { teamId, userId: devA.body.user.id } });
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The person with no place on the work — seven surfaces, seven assertions
  // ---------------------------------------------------------------------------------------------

  describe('a project member with no relationship to the task', () => {
    it('is not offered the conversation in the list', async () => {
      const listed = await listConversations(devB).expect(200);
      const ids = listed.body.map((row: { id: string }) => row.id);
      expect(ids).not.toContain(conversationId);
      expect(ids).not.toContain(otherConversationId);
    });

    it('cannot find it by search either, because search is the list', async () => {
      // The conversation search box filters the page the list endpoint returned — there is no
      // second query behind it — so a row the list withholds is a row no search term can reach.
      // Asserted against the *title text* the search matches on, at the widest limit the endpoint
      // takes, so this is not merely a restatement of the test above.
      const listed = await listConversations(devB).expect(200);
      const titles = JSON.stringify(listed.body);
      expect(titles).not.toContain('Fix the export job');
    });

    it('gets 404 on the conversation itself, not 403', async () => {
      // 404 rather than 403 on purpose: a task conversation exists because somebody opened one on
      // a particular piece of work, so "you may not read this" would tell a colleague that this
      // task has a discussion and roughly when it started.
      const detail = await api()
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', bearer(devB));
      expect(detail.status).toBe(404);
    });

    it('gets 404 on the message history', async () => {
      const history = await readMessages(devB, conversationId);
      expect(history.status).toBe(404);
      expect(history.body.items).toBeUndefined();
    });

    it('cannot post into it', async () => {
      expect((await send(devB, conversationId, { body: 'Hello?' })).status).toBe(404);
    });

    it('cannot open it into existence through POST /conversations either', async () => {
      // The create path resolves the project from the task and asks the same question, so the
      // idempotent "open" is not a way round the read refusal.
      expect((await open(devB, { kind: CONVERSATION_KIND.TASK, taskId })).status).toBe(404);
    });

    it('is refused the websocket subscription, and joined to nothing', async () => {
      const { socket, joined } = socketFor(devB);
      const ack = await gateway.subscribe(socket, { conversationId });

      expect(ack.ok).toBe(false);
      expect(ack.reason).toBe('NOT_ON_TASK');
      expect(joined).toEqual([]);
    });

    it('is not in the emit audience when somebody posts', async () => {
      const emit = jest.spyOn(app.get(RealtimeService), 'emitToUsers');
      try {
        emit.mockClear();
        await send(devA, conversationId, { body: `fanout-${randomUUID()}` }).expect(201);

        const delivered = emit.mock.calls.flatMap(([userIds]) => [...userIds]);
        // The message did go out — a fan-out that reached nobody would pass the next line for the
        // wrong reason.
        expect(delivered).toContain(pm.body.user.id);
        expect(delivered).not.toContain(devB.body.user.id);
      } finally {
        emit.mockRestore();
      }
    });

    it('is notified nothing, and their unread count does not move', async () => {
      const mentions = () =>
        prisma.notification.count({
          where: { userId: devB.body.user.id, entityId: conversationId },
        });
      const before = await mentions();
      await send(devA, conversationId, { body: 'Another line nobody outside should hear' }).expect(
        201,
      );

      expect(await mentions()).toBe(before);
      // And no unread badge: the conversation is not in their list, so it contributes no count.
      const unread = await api()
        .get('/api/v1/conversations?limit=100&unreadOnly=true')
        .set('Authorization', bearer(devB))
        .expect(200);
      expect(unread.body.map((row: { id: string }) => row.id)).not.toContain(conversationId);
    });

    it('still has the project’s own channel, which is what they are actually entitled to', async () => {
      // The narrowing is of task chat and of nothing else. A member of the project is still a
      // member of the project, and a fix that took the project channel away with the task threads
      // would have replaced one wrong answer with another.
      const channel = await open(devB, {
        kind: CONVERSATION_KIND.PROJECT,
        projectId,
      }).expect(200);
      await send(devB, channel.body.id, { body: 'Morning' }).expect(201);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Oversight
  // ---------------------------------------------------------------------------------------------

  describe('the super admin', () => {
    it('does not get task conversations in their ordinary list', async () => {
      // Oversight is a separate surface with its own audit trail. Widening the everyday list with
      // it would turn an audited inspection into ordinary reading.
      const listed = await listConversations(director).expect(200);
      expect(listed.body.map((row: { id: string }) => row.id)).not.toContain(conversationId);
    });

    it('reaches every task conversation through the oversight endpoint', async () => {
      const oversight = await api()
        .get('/api/v1/communication/oversight/conversations?limit=100')
        .set('Authorization', bearer(director))
        .expect(200);
      const ids = oversight.body.map((row: { id: string }) => row.id);
      expect(ids).toContain(conversationId);
      expect(ids).toContain(otherConversationId);
    });

    it('reads the thread, and the read is audited as an inspection', async () => {
      const before = await prisma.auditLog.count({
        where: { action: 'conversation.inspected', entityId: conversationId },
      });
      await readMessages(director, conversationId).expect(200);
      expect(
        await prisma.auditLog.count({
          where: { action: 'conversation.inspected', entityId: conversationId },
        }),
      ).toBe(before + 1);
    });

    it('may not post into a thread they only oversee', async () => {
      const refused = await send(director, conversationId, { body: 'Adding my own view' });
      expect(refused.status).toBe(403);
      expect(refused.body.message).toBe('Oversight access is read-only');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Refusals are recorded
  // ---------------------------------------------------------------------------------------------

  it('audits the refusal rather than only returning it', async () => {
    const before = await prisma.auditLog.count({
      where: {
        action: 'conversation.access_denied',
        actorUserId: devB.body.user.id,
        organizationId: providerOrgId,
      },
    });
    await readMessages(devB, conversationId).expect(404);

    const rows = await prisma.auditLog.findMany({
      where: {
        action: 'conversation.access_denied',
        actorUserId: devB.body.user.id,
        organizationId: providerOrgId,
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'conversation.access_denied',
          actorUserId: devB.body.user.id,
          organizationId: providerOrgId,
        },
      }),
    ).toBe(before + 1);
    // The 404 hides the thread from the caller; it must not hide the attempt from the audit trail.
    expect((rows[0]?.after as { reason?: string })?.reason).toBe('NOT_ON_TASK');
    expect((rows[0]?.after as { taskId?: string })?.taskId).toBe(taskId);
  });
});
