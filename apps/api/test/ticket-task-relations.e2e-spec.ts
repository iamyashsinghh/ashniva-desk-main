import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Duplicate and related tickets and tasks, end to end.
 *
 * Four properties are worth proving against a real database rather than a unit test.
 *
 * The first is the rule the feature exists for: **nothing is destroyed**. Marking a ticket a
 * duplicate is a pointer plus a status, so both tickets keep every reply, attachment, SLA record
 * and audit entry they had — asserted by count *and* by id, before and after, and again after the
 * link is removed.
 *
 * The second is the boundary between two clients. Two clients can legitimately report the same
 * fault, and neither may learn that the other's ticket exists — not through the relations panel,
 * not through the activity trail, not through the note on the closure.
 *
 * The third is the shape of the graph: no self links, no chains, no cycles.
 *
 * The fourth is that the write is gated and audited.
 */
describe('Duplicate and related tickets and tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let support: Session;
  let developer: Session;
  let pm: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;

  let providerOrgId: string;
  let acmeId: string;
  let zenithId: string;
  let projectId: string;
  let nextTaskNumber = 940_000;

  const api = () => request(app.getHttpServer());
  const stamp = Date.now().toString().slice(-6);

  /**
   * Support raises on the client's behalf, naming the client's own person as the requester.
   *
   * The requester matters here: they are who is told that their ticket is being tracked somewhere
   * else, and a fixture that left support as the requester would have proved nothing about the
   * notification.
   */
  const raise = async (clientOrganizationId: string, title: string): Promise<string> => {
    const response = await api()
      .post('/api/v1/tickets')
      .set('Authorization', bearer(support))
      .send({
        title,
        description: 'Nothing prints; the log shows ERR_PRN_TIMEOUT.',
        projectId,
        module: 'Billing',
        productVersion: '3.1.4',
        clientOrganizationId,
        requesterId:
          clientOrganizationId === acmeId ? clientAdmin.body.user.id : zenithAdmin.body.user.id,
      })
      .expect(201);
    return response.body.id as string;
  };

  const relations = (ticketId: string, session: Session) =>
    api().get(`/api/v1/tickets/${ticketId}/relations`).set('Authorization', bearer(session));

  const link = (ticketId: string, body: Record<string, unknown>, session = support) =>
    api()
      .post(`/api/v1/tickets/${ticketId}/relations`)
      .set('Authorization', bearer(session))
      .send(body);

  const unlink = (ticketId: string, relationId: string, session = support) =>
    api()
      .delete(`/api/v1/tickets/${ticketId}/relations/${relationId}`)
      .set('Authorization', bearer(session));

  /** Everything hanging off a ticket that a destructive merge would move away. */
  async function snapshot(ticketId: string) {
    const [comments, files, sla, history, audits] = await Promise.all([
      prisma.comment.findMany({
        where: { ticketId },
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
      prisma.file.findMany({ where: { ticketId }, select: { id: true }, orderBy: { id: 'asc' } }),
      // `ticket_sla` is keyed on the ticket, so the row itself is the identity: the clocks and
      // the policy behind them must survive the link exactly as they were.
      prisma.ticketSla.findMany({
        where: { ticketId },
        select: { ticketId: true, policyId: true, clockStartedAt: true },
      }),
      prisma.ticketStatusHistory.findMany({
        where: { ticketId },
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
      prisma.auditLog.findMany({
        where: { entityType: 'ticket', entityId: ticketId },
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return {
      comments: comments.map((row) => row.id),
      files: files.map((row) => row.id),
      sla: sla.map((row) => `${row.ticketId}:${row.policyId}:${row.clockStartedAt.toISOString()}`),
      history: history.map((row) => row.id),
      audits: audits.map((row) => row.id),
    };
  }

  /**
   * Everything in `before` is still there.
   *
   * Deliberately not an equality: linking *adds* a status-history row and audit entries, and it is
   * meant to. What must never happen is a row disappearing.
   */
  function assertNothingLost(before: Awaited<ReturnType<typeof snapshot>>, after: typeof before) {
    expect(after.comments).toEqual(expect.arrayContaining(before.comments));
    expect(after.comments).toHaveLength(before.comments.length);
    expect(after.files).toEqual(expect.arrayContaining(before.files));
    expect(after.files).toHaveLength(before.files.length);
    expect(after.sla).toEqual(expect.arrayContaining(before.sla));
    expect(after.sla).toHaveLength(before.sla.length);
    expect(after.history).toEqual(expect.arrayContaining(before.history));
    expect(after.audits).toEqual(expect.arrayContaining(before.audits));
  }

  async function attach(ticketId: string, name: string): Promise<void> {
    await prisma.file.create({
      data: {
        organizationId: providerOrgId,
        ticketId,
        name,
        contentType: 'text/plain',
        sizeBytes: 12,
        storageKey: `${providerOrgId}/${stamp}/${name}-${Math.random().toString(36).slice(2)}`,
        visibility: 'CLIENT',
        uploadedById: support.body.user.id,
      },
    });
  }

  function createTask(title: string): Promise<string> {
    return createTaskIn(projectId, title);
  }

  async function createTaskIn(project: string, title: string): Promise<string> {
    const task = await prisma.task.create({
      data: {
        organizationId: providerOrgId,
        projectId: project,
        title,
        description: 'relations e2e fixture',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        createdById: pm.body.user.id,
        number: (nextTaskNumber += 1),
        clientVisible: false,
      },
      select: { id: true },
    });
    return task.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [support, developer, pm, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.support),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    const organizations = await prisma.organization.findMany({
      where: { slug: { in: ['ashniva', 'acme-retail', 'zenith-logistics'] } },
      select: { id: true, slug: true },
    });
    providerOrgId = organizations.find((row) => row.slug === 'ashniva')?.id ?? '';
    acmeId = organizations.find((row) => row.slug === 'acme-retail')?.id ?? '';
    zenithId = organizations.find((row) => row.slug === 'zenith-logistics')?.id ?? '';
    expect(providerOrgId && acmeId && zenithId).toBeTruthy();

    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: `REL${stamp}`,
        name: 'Relations fixture',
        description: 'Created by ticket-task-relations.e2e-spec.ts',
        type: 'INTERNAL_WORK',
        status: 'ACTIVE',
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    projectId = project.id;

    /**
     * The developer is a member of the fixture project, and the line is load-bearing.
     *
     * The scope tests below run against the real `TaskVisibilityService`, bound at `TASK_SCOPE`.
     * That rule grants a project to its manager, its lead and its *members*, and to nobody else —
     * so without this row the developer is out of scope for `REL<stamp>` as well, and the in-scope
     * control, the one test that stops the four refusals passing vacuously, is the first thing to
     * fail.
     *
     * Do not delete it as redundant: it is what makes the fixture satisfy the rule under test.
     */
    await prisma.projectMember.create({
      data: { projectId, userId: developer.body.user.id, role: 'DEVELOPER' },
    });
  });

  afterAll(async () => {
    const ticketIds = (
      await prisma.ticket.findMany({ where: { projectId }, select: { id: true } })
    ).map((row) => row.id);
    const taskIds = (
      await prisma.task.findMany({ where: { projectId }, select: { id: true } })
    ).map((row) => row.id);
    await prisma.ticketRelation.deleteMany({ where: { sourceTicketId: { in: ticketIds } } });
    await prisma.taskRelation.deleteMany({ where: { sourceTaskId: { in: taskIds } } });
    await prisma.file.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.comment.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketSla.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.similarityMatch.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.ticket.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await app.close();
  });

  describe('marking a duplicate destroys nothing', () => {
    let copy: string;
    let kept: string;
    let before: Awaited<ReturnType<typeof snapshot>>;
    let keptBefore: Awaited<ReturnType<typeof snapshot>>;
    let relationId: string;

    beforeAll(async () => {
      copy = await raise(acmeId, `Printing fails again ${stamp}`);
      kept = await raise(acmeId, `Printing fails ${stamp}`);
      for (const id of [copy, kept]) {
        await api()
          .post(`/api/v1/tickets/${id}/comments`)
          .set('Authorization', bearer(support))
          .send({ body: 'Looking into it now.', visibility: 'CLIENT' })
          .expect(201);
        await attach(id, 'log.txt');
      }
      before = await snapshot(copy);
      keptBefore = await snapshot(kept);
      expect(before.comments.length).toBeGreaterThan(0);
      expect(before.files.length).toBeGreaterThan(0);
      expect(before.audits.length).toBeGreaterThan(0);
    });

    it('closes the copy with a reason naming the ticket being kept', async () => {
      const response = await link(copy, { type: 'DUPLICATE_OF', targetTicketId: kept }).expect(201);
      relationId = response.body.relations[0].id;

      const keptNumber = (
        await prisma.ticket.findUniqueOrThrow({
          where: { id: kept },
          select: { number: true },
        })
      ).number;
      const detail = await api()
        .get(`/api/v1/tickets/${copy}`)
        .set('Authorization', bearer(support))
        .expect(200);
      expect(detail.body.status).toBe('CANCELLED');
      expect(JSON.stringify(detail.body.history)).toContain(`T-${keptNumber}`);
    });

    it('keeps every reply, attachment, SLA row, history entry and audit entry on both tickets', async () => {
      assertNothingLost(before, await snapshot(copy));
      assertNothingLost(keptBefore, await snapshot(kept));
    });

    it('shows the link from both ends, with the direction the right way round', async () => {
      const fromCopy = await relations(copy, support).expect(200);
      expect(fromCopy.body.relations).toHaveLength(1);
      expect(fromCopy.body.relations[0]).toMatchObject({ type: 'DUPLICATE_OF', role: 'DUPLICATE' });
      expect(fromCopy.body.relations[0].other.id).toBe(kept);

      const fromKept = await relations(kept, support).expect(200);
      expect(fromKept.body.relations[0]).toMatchObject({
        type: 'DUPLICATE_OF',
        role: 'CANONICAL',
      });
      expect(fromKept.body.relations[0].other.id).toBe(copy);
    });

    it('tells the requester their ticket is tracked elsewhere', async () => {
      const notifications = await prisma.notification.findMany({
        where: { type: 'TICKET_DUPLICATE', entityId: copy },
        select: { id: true },
      });
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('records an audit entry for the link', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ticket.linked', entityId: copy },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry).not.toBeNull();
      expect(entry?.after).toMatchObject({ targetTicketId: kept, closedDuplicate: true });
    });

    it('unlinks without destroying anything, and records that', async () => {
      const response = await unlink(copy, relationId).expect(200);
      expect(response.body.relations).toHaveLength(0);
      expect(await prisma.ticketRelation.findUnique({ where: { id: relationId } })).toBeNull();

      assertNothingLost(before, await snapshot(copy));
      assertNothingLost(keptBefore, await snapshot(kept));

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'ticket.unlinked', entityId: copy },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry?.before).toMatchObject({ relationId, closedDuplicate: true });
    });
  });

  describe('two clients reporting the same fault', () => {
    let acmeTicket: string;
    let zenithTicket: string;

    beforeAll(async () => {
      acmeTicket = await raise(acmeId, `Cross-client copy ${stamp}`);
      zenithTicket = await raise(zenithId, `Cross-client original ${stamp}`);
      await link(acmeTicket, { type: 'DUPLICATE_OF', targetTicketId: zenithTicket }).expect(201);
    });

    it('shows the client nothing at all — not the link, not a placeholder', async () => {
      const response = await relations(acmeTicket, clientAdmin).expect(200);
      expect(response.body.relations).toEqual([]);
      expect(response.body.canLink).toBe(false);
      expect(JSON.stringify(response.body)).not.toContain(zenithTicket);
    });

    it('never names the other client’s ticket in the closing note the client reads', async () => {
      const zenithNumber = (
        await prisma.ticket.findUniqueOrThrow({
          where: { id: zenithTicket },
          select: { number: true },
        })
      ).number;
      const detail = await api()
        .get(`/api/v1/tickets/${acmeTicket}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      const body = JSON.stringify(detail.body);
      expect(body).not.toContain(`T-${zenithNumber}`);
      expect(body).not.toContain(zenithTicket);
      expect(body).toContain('Duplicate of an existing ticket');
    });

    it('does not let the other client see the link either', async () => {
      const response = await relations(zenithTicket, zenithAdmin).expect(200);
      expect(response.body.relations).toEqual([]);
      expect(JSON.stringify(response.body)).not.toContain(acmeTicket);
    });

    it('refuses the client the other client’s ticket outright', async () => {
      await api()
        .get(`/api/v1/tickets/${zenithTicket}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);
    });

    it('still shows both ends to internal staff, which is the point of the link', async () => {
      const response = await relations(acmeTicket, support).expect(200);
      expect(response.body.relations[0].other.id).toBe(zenithTicket);
    });
  });

  describe('a far end the reader may not open', () => {
    it('comes back with no id and no title rather than a leaked one', async () => {
      const visible = await raise(acmeId, `Visible half ${stamp}`);
      const hidden = await raise(acmeId, `Hidden half ${stamp}`);
      await link(visible, {
        type: 'RELATED_TO',
        targetTicketId: hidden,
        closeDuplicate: false,
      }).expect(201);
      // Soft-deleting is the only way to make a ticket unreadable to internal staff, who otherwise
      // see every one of the provider's rows. What matters is the shape of the answer.
      await prisma.ticket.update({ where: { id: hidden }, data: { deletedAt: new Date() } });

      const response = await relations(visible, support).expect(200);
      expect(response.body.relations).toHaveLength(1);
      expect(response.body.relations[0].other).toBeNull();
      expect(JSON.stringify(response.body)).not.toContain(hidden);
      expect(JSON.stringify(response.body)).not.toContain('Hidden half');
    });
  });

  describe('the shape of the graph', () => {
    let a: string;
    let b: string;

    beforeAll(async () => {
      a = await raise(acmeId, `Graph A ${stamp}`);
      b = await raise(acmeId, `Graph B ${stamp}`);
    });

    it('refuses a self link', async () => {
      await link(a, { type: 'RELATED_TO', targetTicketId: a }).expect(409);
    });

    it('refuses a second link for a pair that already has one', async () => {
      await link(a, { type: 'RELATED_TO', targetTicketId: b, closeDuplicate: false }).expect(201);
      await link(b, { type: 'RELATED_TO', targetTicketId: a }).expect(409);
      await link(a, { type: 'DUPLICATE_OF', targetTicketId: b }).expect(409);
    });

    it('refuses a duplicate cycle', async () => {
      const x = await raise(acmeId, `Cycle X ${stamp}`);
      const y = await raise(acmeId, `Cycle Y ${stamp}`);
      const z = await raise(acmeId, `Cycle Z ${stamp}`);
      await link(x, { type: 'DUPLICATE_OF', targetTicketId: y }).expect(201);
      // Closing the loop directly, and the long way round through a chain.
      await link(y, { type: 'DUPLICATE_OF', targetTicketId: x }).expect(409);
      await link(y, { type: 'DUPLICATE_OF', targetTicketId: z }).expect(409);
      await link(z, { type: 'DUPLICATE_OF', targetTicketId: x }).expect(409);
    });
  });

  describe('the permission gate', () => {
    let ticketId: string;

    beforeAll(async () => {
      ticketId = await raise(acmeId, `Gate ${stamp}`);
    });

    it('refuses a reader without ticket:triage', async () => {
      await link(ticketId, { type: 'RELATED_TO', targetTicketId: ticketId }, developer).expect(403);
      await relations(ticketId, developer).expect(200);
    });

    it('refuses a client outright', async () => {
      await link(ticketId, { type: 'RELATED_TO', targetTicketId: ticketId }, clientAdmin).expect(
        403,
      );
    });

    it('refuses an anonymous caller', async () => {
      await api().get(`/api/v1/tickets/${ticketId}/relations`).expect(401);
    });
  });

  describe('likely duplicates offered for the link dialog', () => {
    /**
     * Its own project, because the ranking returns the best few and every ticket in the main
     * fixture shares the same module, version and error code — a test that named one of them would
     * be asserting the tie-break rather than the matcher.
     */
    let candidateProjectId: string;

    beforeAll(async () => {
      const project = await prisma.project.create({
        data: {
          organizationId: providerOrgId,
          code: `CND${stamp}`,
          name: 'Candidates fixture',
          description: 'Created by ticket-task-relations.e2e-spec.ts',
          type: 'INTERNAL_WORK',
          status: 'ACTIVE',
          createdById: pm.body.user.id,
        },
        select: { id: true },
      });
      candidateProjectId = project.id;
    });

    afterAll(async () => {
      const ids = (
        await prisma.ticket.findMany({
          where: { projectId: candidateProjectId },
          select: { id: true },
        })
      ).map((row) => row.id);
      await prisma.ticketRelation.deleteMany({ where: { sourceTicketId: { in: ids } } });
      await prisma.ticketSla.deleteMany({ where: { ticketId: { in: ids } } });
      await prisma.slaEvent.deleteMany({ where: { ticketId: { in: ids } } });
      await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ids } } });
      await prisma.similarityMatch.deleteMany({ where: { ticketId: { in: ids } } });
      await prisma.ticket.deleteMany({ where: { projectId: candidateProjectId } });
      await prisma.project.delete({ where: { id: candidateProjectId } });
    });

    const raiseCandidate = async (title: string): Promise<string> => {
      const response = await api()
        .post('/api/v1/tickets')
        .set('Authorization', bearer(support))
        .send({
          title,
          description: 'Nothing prints; the log shows ERR_PRN_TIMEOUT.',
          projectId: candidateProjectId,
          module: 'Billing',
          productVersion: '3.1.4',
          clientOrganizationId: acmeId,
        })
        .expect(201);
      return response.body.id as string;
    };

    it('ranks the ticket that shares the fingerprint, and says what is already linked', async () => {
      const two = await raiseCandidate(`Candidate two ${stamp}`);
      const one = await raiseCandidate(`Candidate one ${stamp}`);
      const response = await api()
        .get(`/api/v1/tickets/${one}/relations/candidates`)
        .set('Authorization', bearer(support))
        .expect(200);
      const match = response.body.candidates.find(
        (candidate: { ticketId: string }) => candidate.ticketId === two,
      );
      expect(match).toBeDefined();
      expect(match.alreadyLinked).toBe(false);
      expect(match.signals.length).toBeGreaterThan(0);

      await link(one, { type: 'DUPLICATE_OF', targetTicketId: two }).expect(201);
      const after = await api()
        .get(`/api/v1/tickets/${one}/relations/candidates`)
        .set('Authorization', bearer(support))
        .expect(200);
      expect(
        after.body.candidates.find((candidate: { ticketId: string }) => candidate.ticketId === two)
          .alreadyLinked,
      ).toBe(true);
    });

    it('is refused to a reader without ticket:triage', async () => {
      const ticketId = await raise(acmeId, `Candidate gate ${stamp}`);
      await api()
        .get(`/api/v1/tickets/${ticketId}/relations/candidates`)
        .set('Authorization', bearer(developer))
        .expect(403);
    });
  });

  /**
   * The task read scope, on every path a link touches.
   *
   * A permission gate on the controller says a person works with tasks; it never says *whose*. So
   * `task:read` and `task:create` are not enough on their own, and these four cases are what the
   * README already promises: an anchor outside the scope is a 404 exactly as `GET /tasks/:id` is,
   * a far end outside it is `other: null` with no id and no title, and the write and the delete are
   * scoped as well as the read — otherwise a reader who gets a 404 asking directly could still
   * write onto the task, and learn it exists from the response.
   *
   * The in-scope control at the end is what stops all of this passing vacuously: the same developer,
   * on a task the scope admits, can read, link and unlink.
   */
  describe('task relations honour the task read scope', () => {
    let inScopeTask: string;
    let inScopeOther: string;
    let outOfScopeTask: string;
    let outOfScopeOther: string;
    let outOfScopeProjectId: string;
    let anchoredRelationId: string;
    let maskedRelationId: string;

    const asDeveloper = (path: string) =>
      api().get(`/api/v1${path}`).set('Authorization', bearer(developer));

    beforeAll(async () => {
      const project = await prisma.project.create({
        data: {
          organizationId: providerOrgId,
          code: `OUT${stamp}`,
          name: 'Out of scope fixture',
          description: 'Created by ticket-task-relations.e2e-spec.ts',
          type: 'INTERNAL_WORK',
          status: 'ACTIVE',
          createdById: pm.body.user.id,
        },
        select: { id: true },
      });
      outOfScopeProjectId = project.id;
      outOfScopeTask = await createTaskIn(outOfScopeProjectId, 'Out of scope one');
      outOfScopeOther = await createTaskIn(outOfScopeProjectId, 'Out of scope two');
      inScopeTask = await createTask('In scope anchor');
      inScopeOther = await createTask('In scope partner');

      // Linked by the PM, who is not narrowed — the fixture has to exist before the scoped reader
      // can be refused it.
      const across = await api()
        .post(`/api/v1/tasks/${inScopeTask}/relations`)
        .set('Authorization', bearer(pm))
        .send({ type: 'RELATED_TO', targetTaskId: outOfScopeTask })
        .expect(201);
      maskedRelationId = across.body.relations[0].id;
      const within = await api()
        .post(`/api/v1/tasks/${outOfScopeTask}/relations`)
        .set('Authorization', bearer(pm))
        .send({ type: 'RELATED_TO', targetTaskId: outOfScopeOther })
        .expect(201);
      anchoredRelationId = within.body.relations.find(
        (relation: { other: { id: string } | null }) => relation.other?.id === outOfScopeOther,
      ).id;

      // The fixture invariant these tests stand on, pinned so it cannot be broken quietly: the
      // developer reaches the in-scope project through membership — which is what the real rule
      // grants on — and reaches the out-of-scope one no way at all. Without the first, every
      // refusal below passes for the wrong reason; without the second, none of them refuses.
      expect(
        await prisma.projectMember.count({
          where: { projectId, userId: developer.body.user.id },
        }),
      ).toBe(1);
      expect(
        await prisma.project.count({
          where: {
            id: outOfScopeProjectId,
            OR: [
              { managerUserId: developer.body.user.id },
              { leadUserId: developer.body.user.id },
              { members: { some: { userId: developer.body.user.id } } },
            ],
          },
        }),
      ).toBe(0);
      expect(
        await prisma.task.count({
          where: {
            projectId: outOfScopeProjectId,
            OR: [
              { assignedToId: developer.body.user.id },
              { createdById: developer.body.user.id },
              { reviewerId: developer.body.user.id },
              { testerId: developer.body.user.id },
            ],
          },
        }),
      ).toBe(0);
    });

    afterAll(async () => {
      const ids = [outOfScopeTask, outOfScopeOther];
      await prisma.taskRelation.deleteMany({
        where: { OR: [{ sourceTaskId: { in: ids } }, { targetTaskId: { in: ids } }] },
      });
      await prisma.task.deleteMany({ where: { projectId: outOfScopeProjectId } });
      await prisma.project.delete({ where: { id: outOfScopeProjectId } });
    });

    it('refuses to read the relations of a task outside the scope', async () => {
      await asDeveloper(`/tasks/${outOfScopeTask}/relations`).expect(404);
    });

    it('masks the far end, leaving no id and no title', async () => {
      const response = await asDeveloper(`/tasks/${inScopeTask}/relations`).expect(200);
      const masked = response.body.relations.find(
        (relation: { id: string }) => relation.id === maskedRelationId,
      );
      expect(masked).toBeDefined();
      expect(masked.other).toBeNull();
      const body = JSON.stringify(response.body);
      expect(body).not.toContain(outOfScopeTask);
      expect(body).not.toContain('Out of scope one');
    });

    it('refuses to write onto a task outside the scope', async () => {
      await api()
        .post(`/api/v1/tasks/${outOfScopeTask}/relations`)
        .set('Authorization', bearer(developer))
        .send({ type: 'RELATED_TO', targetTaskId: inScopeTask })
        .expect(404);
    });

    it('refuses to link an in-scope task to one outside the scope', async () => {
      await api()
        .post(`/api/v1/tasks/${inScopeTask}/relations`)
        .set('Authorization', bearer(developer))
        .send({ type: 'RELATED_TO', targetTaskId: outOfScopeOther })
        .expect(404);
    });

    it('refuses to delete a link anchored on a task outside the scope, and removes nothing', async () => {
      const before = await prisma.taskRelation.count();
      await api()
        .delete(`/api/v1/tasks/${outOfScopeTask}/relations/${anchoredRelationId}`)
        .set('Authorization', bearer(developer))
        .expect(404);
      expect(await prisma.taskRelation.count()).toBe(before);
      expect(
        await prisma.taskRelation.findUnique({ where: { id: anchoredRelationId } }),
      ).not.toBeNull();
    });

    it('lets the same developer read, link and unlink inside the scope', async () => {
      const read = await asDeveloper(`/tasks/${inScopeTask}/relations`).expect(200);
      expect(read.body.canLink).toBe(true);

      const created = await api()
        .post(`/api/v1/tasks/${inScopeOther}/relations`)
        .set('Authorization', bearer(developer))
        .send({ type: 'RELATED_TO', targetTaskId: inScopeTask })
        .expect(201);
      const relation = created.body.relations[0];
      expect(relation.other.id).toBe(inScopeTask);

      await api()
        .delete(`/api/v1/tasks/${inScopeOther}/relations/${relation.id}`)
        .set('Authorization', bearer(developer))
        .expect(200);
    });
  });

  describe('the same model on tasks', () => {
    let one: string;
    let two: string;

    beforeAll(async () => {
      one = await createTask('Relations task one');
      two = await createTask('Relations task two');
    });

    it('links, reads from both ends and unlinks, changing nothing on either task', async () => {
      const before = await prisma.task.findUniqueOrThrow({
        where: { id: one },
        select: { status: true, updatedAt: true },
      });
      const created = await api()
        .post(`/api/v1/tasks/${one}/relations`)
        .set('Authorization', bearer(pm))
        .send({ type: 'DUPLICATE_OF', targetTaskId: two })
        .expect(201);
      const relationId = created.body.relations[0].id;
      expect(created.body.relations[0]).toMatchObject({ role: 'DUPLICATE' });

      const fromOther = await api()
        .get(`/api/v1/tasks/${two}/relations`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(fromOther.body.relations[0]).toMatchObject({ role: 'CANONICAL' });
      expect(fromOther.body.relations[0].other.id).toBe(one);

      // A task link is a pointer only: it never touches the task workflow.
      const after = await prisma.task.findUniqueOrThrow({
        where: { id: one },
        select: { status: true, updatedAt: true },
      });
      expect(after).toEqual(before);

      await api()
        .delete(`/api/v1/tasks/${one}/relations/${relationId}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(await prisma.taskRelation.findUnique({ where: { id: relationId } })).toBeNull();
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'task.unlinked', entityId: one },
      });
      expect(entry).not.toBeNull();
    });

    it('refuses a client', async () => {
      await api()
        .get(`/api/v1/tasks/${one}/relations`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });

    it('refuses a self link and a cycle', async () => {
      const three = await createTask('Relations task three');
      await api()
        .post(`/api/v1/tasks/${one}/relations`)
        .set('Authorization', bearer(pm))
        .send({ type: 'RELATED_TO', targetTaskId: one })
        .expect(409);
      await api()
        .post(`/api/v1/tasks/${one}/relations`)
        .set('Authorization', bearer(pm))
        .send({ type: 'DUPLICATE_OF', targetTaskId: three })
        .expect(201);
      await api()
        .post(`/api/v1/tasks/${three}/relations`)
        .set('Authorization', bearer(pm))
        .send({ type: 'DUPLICATE_OF', targetTaskId: one })
        .expect(409);
    });
  });
});
