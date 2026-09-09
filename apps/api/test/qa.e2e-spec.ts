import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * QA end to end.
 *
 * The parts worth proving against a real database rather than a unit test: that the nine tester
 * views agree with the counts printed above them, that the state machine and the assignee rule
 * hold over HTTP rather than only in the workflow table, and — the part that matters most — that a
 * test password leaves the server exactly once, to the person holding a live grant, and is written
 * into the access log on the way out.
 */
describe('QA (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let developer: Session;
  let tester: Session;
  let clientAdmin: Session;
  let providerOrgId: string;
  let projectId: string;
  let taskId: string;
  let secondTaskId: string;
  let testerUserId: string;
  let nextTaskNumber: number;

  const api = () => request(app.getHttpServer());

  /** A fixture project of our own, so the view counts are ours and cleanup can be exact. */
  async function createProject(): Promise<string> {
    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: 'QAE2E',
        name: 'QA end-to-end fixture',
        description: 'Created by qa.e2e-spec.ts',
        type: 'INTERNAL_WORK',
        status: 'ACTIVE',
        createdById: director.body.user.id,
      },
      select: { id: true },
    });
    return project.id;
  }

  async function createTask(title: string): Promise<string> {
    const task = await prisma.task.create({
      data: {
        organizationId: providerOrgId,
        projectId,
        title,
        description: 'qa e2e fixture',
        status: 'READY_FOR_QA',
        priority: 'MEDIUM',
        createdById: director.body.user.id,
        number: (nextTaskNumber += 1),
        clientVisible: false,
      },
      select: { id: true },
    });
    return task.id;
  }

  /** Hands testing over. Defaults to a QA assignment on the first task, for the tester. */
  async function assign(
    over: Record<string, unknown> = {},
    session = pm,
    expected = 201,
  ): Promise<string> {
    const response = await api()
      .post('/api/v1/qa/assignments')
      .set('Authorization', bearer(session))
      .send({
        projectId,
        kind: 'QA',
        taskId,
        assignedToUserId: testerUserId,
        whatToTest: 'The checkout flow end to end',
        ...over,
      })
      .expect(expected);
    return response.body.id;
  }

  const start = (id: string, session = tester) =>
    api().post(`/api/v1/qa/assignments/${id}/start`).set('Authorization', bearer(session));

  const record = (id: string, body: Record<string, unknown>, session = tester) =>
    api()
      .post(`/api/v1/qa/assignments/${id}/result`)
      .set('Authorization', bearer(session))
      .send(body);

  const pass = (id: string, session = tester) =>
    record(
      id,
      { result: 'PASS', whatTested: 'Checkout on staging', actualResult: 'Order placed' },
      session,
    );

  /** The queue, narrowed to the fixture project so counts and rows are both ours. */
  async function queue(view: string, session = tester) {
    const response = await api()
      .get('/api/v1/qa/assignments')
      .query({ view, projectId, limit: 200 })
      .set('Authorization', bearer(session))
      .expect(200);
    return response.body as {
      counts: Record<string, number>;
      queue: Array<{ id: string; status: string; kind: string }>;
    };
  }

  const idsIn = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, pm, developer, tester, clientAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.clientAdmin),
    ]);
    testerUserId = tester.body.user.id;

    const provider = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = provider?.id ?? '';
    expect(providerOrgId).toBeTruthy();

    // Task numbers are unique per organization, so the fixtures start above whatever is there.
    const highest = await prisma.task.aggregate({
      where: { organizationId: providerOrgId },
      _max: { number: true },
    });
    nextTaskNumber = (highest._max.number ?? 0) + 1000;

    projectId = await createProject();
    taskId = await createTask('QA e2e — checkout');
    secondTaskId = await createTask('QA e2e — refunds');
  });

  afterAll(async () => {
    // Only rows these tests created: everything hangs off the fixture project.
    await prisma.credentialAccessLog.deleteMany({ where: { testAccount: { projectId } } });
    await prisma.credentialGrant.deleteMany({ where: { testAccount: { projectId } } });
    await prisma.testResult.deleteMany({ where: { assignment: { projectId } } });
    await prisma.testingAssignment.deleteMany({ where: { projectId } });
    await prisma.testAccount.deleteMany({ where: { projectId } });
    await prisma.testEnvironment.deleteMany({ where: { projectId } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.projectReleasePolicy.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await app.close();
  });

  describe('the assignment lifecycle', () => {
    let passedId: string;
    let failedId: string;

    it('hands testing over, is picked up and passes', async () => {
      passedId = await assign({ whatDeveloped: 'Rewrote the payment step' });

      const created = await api()
        .get(`/api/v1/qa/assignments/${passedId}`)
        .set('Authorization', bearer(tester))
        .expect(200);
      expect(created.body).toMatchObject({
        status: 'PENDING',
        kind: 'QA',
        environment: 'STAGING',
        assignedToUserId: testerUserId,
        taskId,
        whatDeveloped: 'Rewrote the payment step',
      });
      expect(created.body.subjectLabel).toContain('QA e2e — checkout');
      expect(created.body.results).toEqual([]);

      const started = await start(passedId).expect(201);
      expect(started.body.status).toBe('IN_PROGRESS');
      expect(started.body.startedAt).toBeTruthy();

      const passed = await pass(passedId).expect(201);
      expect(passed.body.status).toBe('PASSED');
      expect(passed.body.completedAt).toBeTruthy();
      expect(passed.body.results).toHaveLength(1);
      expect(passed.body.results[0]).toMatchObject({
        outcome: 'PASS',
        // A pass carries no failure narrative, whatever the form sent.
        failureDescription: null,
        severity: null,
        retestRequired: false,
        recordedByName: tester.body.user.name,
      });
    });

    it('records a failure with its severity and asks for a retest', async () => {
      failedId = await assign({ taskId: secondTaskId, whatToTest: 'Refunds' });
      await start(failedId).expect(201);

      const failed = await record(failedId, {
        result: 'FAIL',
        whatTested: 'Partial refund of a split payment',
        actualResult: 'The refund is recorded twice',
        failureDescription: 'A partial refund posts two ledger rows',
        severity: 'HIGH',
        retestRequired: true,
        commentForDeveloper: 'Reproducible on every split payment',
      }).expect(201);

      expect(failed.body.status).toBe('FAILED');
      expect(failed.body.results[0]).toMatchObject({
        outcome: 'FAIL',
        severity: 'HIGH',
        retestRequired: true,
        failureDescription: 'A partial refund posts two ledger rows',
      });
    });

    it('puts that failure in the retest queue without anyone re-filing it', async () => {
      const retest = await queue('retest');
      expect(idsIn(retest.queue)).toContain(failedId);
      // The pass is finished work and belongs in neither the retest nor the failed view.
      expect(idsIn(retest.queue)).not.toContain(passedId);

      const failedView = await queue('failed');
      expect(idsIn(failedView.queue)).toContain(failedId);
    });

    it('refuses a failure the developer could not act on', async () => {
      const id = await assign({ whatToTest: 'A failure with no story' });
      await start(id).expect(201);

      // No description…
      await record(id, {
        result: 'FAIL',
        whatTested: 'Checkout',
        actualResult: 'Something went wrong',
        severity: 'LOW',
      }).expect(400);
      // …and no severity.
      await record(id, {
        result: 'FAIL',
        whatTested: 'Checkout',
        actualResult: 'Something went wrong',
        failureDescription: 'The total is wrong on the confirmation screen',
      }).expect(400);
    });
  });

  describe('the nine tester views', () => {
    const view: Record<string, string> = {};

    beforeAll(async () => {
      const day = 24 * 60 * 60 * 1000;
      // Midday today in UTC, so "today" cannot straddle the boundary the view uses.
      const todayNoon = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);

      view.unassigned = await assign({ assignedToUserId: undefined, whatToTest: 'Unclaimed' });
      view.today = await assign({ dueAt: todayNoon.toISOString(), whatToTest: 'Due today' });
      view.overdue = await assign({
        dueAt: new Date(Date.now() - 3 * day).toISOString(),
        whatToTest: 'Late',
      });
      view.uat = await assign({ kind: 'UAT', whatToTest: 'Client sign-off' });
      view.live = await assign({ kind: 'LIVE_VERIFICATION', whatToTest: 'Production smoke test' });
    });

    it('answers every view with as many rows as its count claims', async () => {
      const views = [
        'mine',
        'ready',
        'today',
        'failed',
        'retest',
        'passed_today',
        'uat',
        'live',
        'overdue',
      ];
      for (const name of views) {
        const body = await queue(name);
        expect(Object.keys(body.counts).sort()).toEqual([...views].sort());
        // Nine views that all answer zero would agree with their counts and prove nothing.
        expect(body.counts[name]).toBeGreaterThan(0);
        // A card that says 4 and opens a list of 6 is worse than no card at all.
        expect({ view: name, rows: body.queue.length }).toEqual({
          view: name,
          rows: body.counts[name],
        });
      }
    });

    it('puts each fixture in the view it belongs to', async () => {
      const [ready, today, overdue, uat, live] = await Promise.all([
        queue('ready'),
        queue('today'),
        queue('overdue'),
        queue('uat'),
        queue('live'),
      ]);

      // "Ready" is work waiting to be picked up: handed to this tester, or to nobody yet.
      expect(idsIn(ready.queue)).toEqual(expect.arrayContaining([view.unassigned, view.today]));
      expect(idsIn(today.queue)).toContain(view.today);
      expect(idsIn(overdue.queue)).toContain(view.overdue);
      expect(idsIn(uat.queue)).toContain(view.uat);
      expect(idsIn(live.queue)).toContain(view.live);
    });

    it('keeps the open and the finished views apart', async () => {
      const [mine, ready, failed, passedToday] = await Promise.all([
        queue('mine'),
        queue('ready'),
        queue('failed'),
        queue('passed_today'),
      ]);

      const open = new Set([...idsIn(mine.queue), ...idsIn(ready.queue)]);
      const finished = [...idsIn(failed.queue), ...idsIn(passedToday.queue)];
      expect(finished.length).toBeGreaterThan(0);
      expect(finished.filter((id) => open.has(id))).toEqual([]);

      for (const row of mine.queue) {
        expect(['PENDING', 'IN_PROGRESS', 'CLARIFICATION']).toContain(row.status);
      }
      for (const row of failed.queue) {
        expect(row.status).toBe('FAILED');
      }
      for (const row of passedToday.queue) {
        expect(row.status).toBe('PASSED');
      }
      // Only the kind each of these two views is named after.
      const uat = await queue('uat');
      expect(uat.queue.every((row) => row.kind === 'UAT')).toBe(true);
      const live = await queue('live');
      expect(live.queue.every((row) => row.kind === 'LIVE_VERIFICATION')).toBe(true);
    });

    it('shows a tester only their own queue, not everyone’s open work', async () => {
      const mine = await queue('mine');
      // The unassigned one is claimable — it is in "ready" — but it is nobody's queue yet.
      expect(idsIn(mine.queue)).not.toContain(view.unassigned);
    });
  });

  describe('what the state machine refuses', () => {
    it('will not record a result on an assignment nobody has started', async () => {
      const id = await assign({ whatToTest: 'Not started' });
      await pass(id).expect(409);
    });

    it('will not start the same assignment twice', async () => {
      const id = await assign({ whatToTest: 'Started once' });
      await start(id).expect(201);
      await start(id).expect(409);
    });

    it('will not let anyone but the assignee record the result, however senior', async () => {
      const id = await assign({ whatToTest: 'Someone else’s evidence' });
      await start(id).expect(201);

      // The director holds every permission there is; the refusal is about whose name goes on
      // the evidence, not about what they are allowed to do.
      const refused = await pass(id, director).expect(403);
      expect(refused.body.message).toMatch(/assigned tester/i);
    });

    it('lets a tester claim an assignment nobody was given', async () => {
      const id = await assign({ assignedToUserId: undefined, whatToTest: 'Up for grabs' });
      await start(id).expect(201);
      const passed = await pass(id).expect(201);
      expect(passed.body.status).toBe('PASSED');
    });
  });

  describe('live verification', () => {
    async function liveInProgress(): Promise<string> {
      const id = await assign({ kind: 'LIVE_VERIFICATION', whatToTest: 'Production smoke test' });
      await start(id).expect(201);
      return id;
    }

    it('refuses a pass recorded through the ordinary form', async () => {
      const id = await liveInProgress();
      const refused = await pass(id).expect(409);
      expect(refused.body.message).toMatch(/verify-live/i);

      // …and signs it off through the endpoint that needs `qa:verify-live`.
      const verified = await api()
        .post(`/api/v1/qa/assignments/${id}/verify-live`)
        .set('Authorization', bearer(tester))
        .expect(201);
      expect(verified.body.status).toBe('PASSED');
    });

    it('allows a failure on one: saying production is broken is never the restricted direction', async () => {
      const id = await liveInProgress();
      const failed = await record(id, {
        result: 'FAIL',
        whatTested: 'The live checkout after the deploy',
        actualResult: 'Payments time out',
        failureDescription: 'Every card payment times out at the gateway',
        severity: 'CRITICAL',
        retestRequired: true,
      }).expect(201);
      expect(failed.body.status).toBe('FAILED');
    });

    it('keeps production sign-off away from someone without qa:verify-live', async () => {
      const id = await liveInProgress();
      // A developer may hand testing out and a lead may run a release, but neither signs off
      // production. The permission is the gate, not seniority.
      await api()
        .post(`/api/v1/qa/assignments/${id}/verify-live`)
        .set('Authorization', bearer(developer))
        .expect(403);
    });

    it('lets a release manager sign off the deploy they watched go out', async () => {
      // The workflow rules say as much where they decline to make `verifyLive` assignee-only, and
      // until `qa:verify-live` reached PROJECT_MANAGER that sentence described nobody.
      const id = await liveInProgress();
      const verified = await api()
        .post(`/api/v1/qa/assignments/${id}/verify-live`)
        .set('Authorization', bearer(pm))
        .expect(201);
      expect(verified.body.status).toBe('PASSED');
    });
  });

  /**
   * Whoever files an assignment can open the thing they just filed.
   *
   * `qa:assign` (PM, lead, developer) and `qa:record-result` (tester) are disjoint sets, and both
   * reads used to demand the tester's key — so a lead who handed testing over got a 403 opening
   * it, on the very screen the "Send to testing" action navigates to.
   */
  describe('reading an assignment', () => {
    it('lets the person who filed it open it and find it in the queue', async () => {
      const id = await assign({ whatToTest: 'The filer opens their own assignment' }, pm);

      const detail = await api()
        .get(`/api/v1/qa/assignments/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(detail.body.id).toBe(id);

      const rows = await queue('ready', pm);
      expect(rows.counts).toBeDefined();
    });

    it('still lets the tester who has to do it open it', async () => {
      const id = await assign({ whatToTest: 'The tester opens it too' });
      await api()
        .get(`/api/v1/qa/assignments/${id}`)
        .set('Authorization', bearer(tester))
        .expect(200);
    });

    it('keeps somebody with neither permission out', async () => {
      const id = await assign({ whatToTest: 'A client tries to read the staging detail' });
      await api()
        .get(`/api/v1/qa/assignments/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .get('/api/v1/qa/assignments')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });
  });

  /**
   * Withdrawing an assignment.
   *
   * CANCELLED has been in the state machine and unit-tested since the module was written, with no
   * route to reach it — so an assignment filed against the wrong task could only be left in
   * somebody's queue, where the release gates went on counting it as testing still owed.
   */
  describe('cancelling', () => {
    it('is for whoever hands testing out, not for the tester holding it', async () => {
      const id = await assign({ whatToTest: 'Filed against the wrong task' });

      await api()
        .post(`/api/v1/qa/assignments/${id}/cancel`)
        .set('Authorization', bearer(tester))
        .send({ reason: 'I do not want to do this' })
        .expect(403);

      const cancelled = await api()
        .post(`/api/v1/qa/assignments/${id}/cancel`)
        .set('Authorization', bearer(pm))
        .send({ reason: 'Filed against the wrong task' })
        .expect(201);
      expect(cancelled.body.status).toBe('CANCELLED');
      // Nothing was tested, so nothing is recorded as completed.
      expect(cancelled.body.completedAt).toBeNull();
      expect(cancelled.body.results).toEqual([]);
    });

    it('cannot be undone or repeated', async () => {
      const id = await assign({ whatToTest: 'Cancelled twice' });
      await api()
        .post(`/api/v1/qa/assignments/${id}/cancel`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(201);
      await api()
        .post(`/api/v1/qa/assignments/${id}/cancel`)
        .set('Authorization', bearer(pm))
        .send({})
        .expect(409);
      await start(id).expect(409);
    });
  });

  describe('what a result sets in motion', () => {
    it('opens the retest the tester asked for, on the same tester', async () => {
      const id = await assign({ whatToTest: 'Refunds', taskId: secondTaskId });
      await start(id).expect(201);
      await record(id, {
        result: 'FAIL',
        whatTested: 'Refunds on staging',
        actualResult: 'The refund is applied twice',
        failureDescription: 'Double refund on partial amounts',
        severity: 'HIGH',
        retestRequired: true,
      }).expect(201);

      const retests = await prisma.testingAssignment.findMany({
        where: { projectId, taskId: secondTaskId, kind: 'RETEST' },
      });
      expect(retests).toHaveLength(1);
      expect(retests[0]).toMatchObject({
        status: 'PENDING',
        assignedToUserId: testerUserId,
        whatToTest: 'Refunds',
      });

      // And the tester can open it without holding `qa:assign`, which is the whole point of
      // opening it for them rather than expecting them to file it.
      await api()
        .get(`/api/v1/qa/assignments/${retests[0]?.id}`)
        .set('Authorization', bearer(tester))
        .expect(200);
    });

    it('tells the reviewer and the developer when testing passes', async () => {
      const task = await createTask('QA e2e — a task somebody is waiting on');
      await prisma.task.update({
        where: { id: task },
        data: { assignedToId: developer.body.user.id, reviewerId: pm.body.user.id },
      });
      const id = await assign({ taskId: task, whatToTest: 'The bit they are waiting on' });
      await start(id).expect(201);
      await pass(id).expect(201);

      const notified = await prisma.notification.findMany({
        where: { type: 'QA_PASSED', entityId: task },
        select: { userId: true },
      });
      expect(notified.map((row) => row.userId).sort()).toEqual(
        [developer.body.user.id, pm.body.user.id].sort(),
      );
    });
  });

  describe('permissions', () => {
    it('keeps a developer out of the result form', async () => {
      const id = await assign({ whatToTest: 'Developer tries to sign it off' });
      await start(id).expect(201);
      // A developer may hand testing out (`qa:assign`); recording the verdict is not theirs.
      await pass(id, developer).expect(403);
    });

    it('keeps a tester out of handing testing over', async () => {
      await assign({ whatToTest: 'Tester assigns to themselves' }, tester, 403);
    });

    /**
     * The subject has to live on the project the assignment is filed under.
     *
     * Everything else about an assignment is scoped by `projectId` — the test account it may carry
     * is checked against it, the queue is filtered by it — so an assignment pointing at another
     * project's task hands a tester one project's staging login while aiming them at different
     * work. Those projects usually belong to different clients. It also feeds the release gates,
     * which count assignments by the task ids a release carries without looking at the
     * assignment's own project.
     */
    it('refuses a subject that belongs to a different project', async () => {
      const otherProject = await prisma.project.create({
        data: {
          organizationId: providerOrgId,
          code: 'QAOTH',
          name: 'A different project',
          description: 'Created by qa.e2e-spec.ts',
          type: 'INTERNAL_WORK',
          status: 'ACTIVE',
          createdById: director.body.user.id,
        },
        select: { id: true },
      });
      const foreignTask = await prisma.task.create({
        data: {
          organizationId: providerOrgId,
          projectId: otherProject.id,
          title: 'Work on the other project',
          description: 'qa e2e fixture',
          status: 'READY_FOR_QA',
          priority: 'MEDIUM',
          createdById: director.body.user.id,
          number: (nextTaskNumber += 1),
          clientVisible: false,
        },
        select: { id: true },
      });

      try {
        const refused = await api()
          .post('/api/v1/qa/assignments')
          .set('Authorization', bearer(pm))
          .send({
            projectId,
            kind: 'QA',
            taskId: foreignTask.id,
            assignedToUserId: testerUserId,
            whatToTest: 'Someone else’s work, filed under our project',
          })
          .expect(404);
        expect(refused.body.message).toMatch(/not found on this project/i);
      } finally {
        await prisma.task.deleteMany({ where: { id: foreignTask.id } });
        await prisma.project.deleteMany({ where: { id: otherProject.id } });
      }
    });
  });

  describe('test accounts and credentials', () => {
    const SECRET = 'St@ging-P4ssword!';
    let accountId: string;

    /** The whole raw body, so a secret hidden in an unmapped field is still caught. */
    const rawBody = (response: { text: string }) => response.text;

    async function newAccount(secret = SECRET, label = 'Test Admin'): Promise<string> {
      const response = await api()
        .post(`/api/v1/projects/${projectId}/test-accounts`)
        .set('Authorization', bearer(pm))
        .send({
          environment: 'STAGING',
          label,
          username: 'qa-admin@staging.example',
          secret,
          notes: 'OTP goes to the shared QA inbox',
        })
        .expect(201);
      return response.body.id;
    }

    async function grantTo(
      id: string,
      grantedToUserId = testerUserId,
      over: Record<string, unknown> = {},
    ) {
      return api()
        .post(`/api/v1/test-accounts/${id}/grant`)
        .set('Authorization', bearer(pm))
        .send({ grantedToUserId, reason: 'Testing the checkout flow', ...over })
        .expect(201);
    }

    const reveal = (grantId: string, session = tester) =>
      api().post(`/api/v1/grants/${grantId}/reveal`).set('Authorization', bearer(session));

    beforeAll(async () => {
      accountId = await newAccount();
    });

    it('never puts the password or its ciphertext in a create or a list response', async () => {
      const created = await api()
        .post(`/api/v1/projects/${projectId}/test-accounts`)
        .set('Authorization', bearer(pm))
        .send({
          environment: 'STAGING',
          label: 'Secret-free response',
          username: 'qa-clerk@staging.example',
          secret: SECRET,
        })
        .expect(201);

      expect(rawBody(created)).not.toContain(SECRET);
      expect(rawBody(created)).not.toContain('ciphertext');
      expect(rawBody(created)).not.toContain('secret');
      expect(created.body).toMatchObject({ label: 'Secret-free response', hasActiveGrant: false });

      const list = await api()
        .get(`/api/v1/projects/${projectId}/test-accounts`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(rawBody(list)).not.toContain(SECRET);
      expect(rawBody(list)).not.toContain('ciphertext');
      expect(rawBody(list)).not.toContain('secret');
      expect(list.body.length).toBeGreaterThan(0);
    });

    it('gives the password to the grantee, once they hold a live grant', async () => {
      const grant = await grantTo(accountId);
      expect(rawBody(grant)).not.toContain(SECRET);
      expect(grant.body).toMatchObject({ grantedToUserId: testerUserId, isLive: true });
      expect(grant.body.revealedAt).toBeNull();

      const revealed = await reveal(grant.body.id).expect(201);
      expect(revealed.body).toMatchObject({ username: 'qa-admin@staging.example', secret: SECRET });
      expect(revealed.body.visibleForSeconds).toBeGreaterThan(0);

      // The detail response of the account now says the caller may reveal it — but still without
      // the password itself.
      const list = await api()
        .get(`/api/v1/projects/${projectId}/test-accounts`)
        .set('Authorization', bearer(director))
        .expect(200);
      expect(rawBody(list)).not.toContain(SECRET);
    });

    it('reads as “not found” to somebody else, even holding test-credential:reveal', async () => {
      const grant = await grantTo(accountId);
      // The director holds every permission, including `test-credential:reveal`. A grant is
      // still one person's, and an id must not be probeable.
      await reveal(grant.body.id, director).expect(404);
    });

    it('refuses an expired grant', async () => {
      const grant = await grantTo(accountId, testerUserId, { ttlMinutes: 5 });
      await prisma.credentialGrant.update({
        where: { id: grant.body.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const refused = await reveal(grant.body.id).expect(403);
      expect(refused.body.message).toMatch(/expired/i);
    });

    it('tears up the outstanding grants when the password is rotated', async () => {
      const rotatingId = await newAccount('Rotate-Me-First1', 'Rotation subject');
      const grant = await grantTo(rotatingId);
      const before = await reveal(grant.body.id).expect(201);
      expect(before.body.secret).toBe('Rotate-Me-First1');

      const rotated = await api()
        .post(`/api/v1/test-accounts/${rotatingId}/rotate`)
        .set('Authorization', bearer(pm))
        .send({ secret: 'Rotated-Second2' })
        .expect(201);
      expect(rawBody(rotated)).not.toContain('Rotated-Second2');
      expect(rawBody(rotated)).not.toContain('Rotate-Me-First1');

      // The grant was issued against the old password; it must not hand out the new one.
      const refused = await reveal(grant.body.id).expect(403);
      expect(refused.body.message).toMatch(/revoked/i);

      const fresh = await grantTo(rotatingId);
      const after = await reveal(fresh.body.id).expect(201);
      expect(after.body.secret).toBe('Rotated-Second2');
    });

    it('writes every reveal into the access log, without the password', async () => {
      const log = await api()
        .get('/api/v1/credential-access-log')
        .query({ testAccountId: accountId, limit: 50 })
        .set('Authorization', bearer(pm))
        .expect(200);

      expect(rawBody(log)).not.toContain(SECRET);
      expect(rawBody(log)).not.toContain('ciphertext');
      const actions = log.body.items.map((row: { action: string }) => row.action);
      // Recording the login is itself an event, and so is reading it.
      expect(actions).toContain('GENERATE');
      expect(actions).toContain('REVEAL');

      const reveals = log.body.items.filter((row: { action: string }) => row.action === 'REVEAL');
      expect(reveals.length).toBeGreaterThan(0);
      for (const row of reveals) {
        expect(row).toMatchObject({ userId: testerUserId, userName: tester.body.user.name });
        expect(row.grantId).toBeTruthy();
        expect(Object.keys(row)).not.toContain('secret');
        expect(Object.keys(row)).not.toContain('userAgent');
      }
    });

    it('keeps a tester out of managing the logins they use', async () => {
      await api()
        .get(`/api/v1/projects/${projectId}/test-accounts`)
        .set('Authorization', bearer(tester))
        .expect(403);
      await api()
        .post(`/api/v1/test-accounts/${accountId}/grant`)
        .set('Authorization', bearer(tester))
        .send({ grantedToUserId: testerUserId })
        .expect(403);
    });

    describe('resetting the data behind a test account', () => {
      it('says so plainly when the account has no reset endpoint', async () => {
        const id = await newAccount(SECRET, 'No hook');
        const refused = await api()
          .post(`/api/v1/test-accounts/${id}/reset-data`)
          .set('Authorization', bearer(pm))
          .expect(409);
        expect(refused.body.message).toMatch(/no reset endpoint/i);
      });

      /**
       * The SSRF guard, reached the way a real operator would reach it.
       *
       * `reset_hook_url` is the one place in this feature where the server fetches an address
       * somebody typed in, so it is the one place where "the guard is wired in" has to be proved
       * end to end rather than only in `safe-http.service.spec.ts`. A staging box on the loopback
       * interface is exactly the plausible-looking mistake the guard exists to catch.
       *
       * HTTPS deliberately: over plain HTTP the cheaper scheme rule would refuse this first, and
       * the test would pass while proving nothing about whether the address was ever examined.
       */
      it('refuses a reset endpoint that points inside the network', async () => {
        const id = await newAccount(SECRET, 'Loopback hook');
        await api()
          .patch(`/api/v1/test-accounts/${id}`)
          .set('Authorization', bearer(pm))
          .send({ resetHookUrl: 'https://127.0.0.1:9999/reset' })
          .expect(200);

        const refused = await api()
          .post(`/api/v1/test-accounts/${id}/reset-data`)
          .set('Authorization', bearer(pm))
          .expect(409);
        // The message has to name the obstacle, because the fix is the operator's to make.
        expect(refused.body.message).toMatch(/will not call|allow-list/i);
      });

      it('refuses one aimed at the cloud metadata service', async () => {
        const id = await newAccount(SECRET, 'Metadata hook');
        await api()
          .patch(`/api/v1/test-accounts/${id}`)
          .set('Authorization', bearer(pm))
          .send({ resetHookUrl: 'https://169.254.169.254/latest/meta-data/' })
          .expect(200);

        await api()
          .post(`/api/v1/test-accounts/${id}/reset-data`)
          .set('Authorization', bearer(pm))
          .expect(409);
      });

      it('is not something a tester may do', async () => {
        await api()
          .post(`/api/v1/test-accounts/${accountId}/reset-data`)
          .set('Authorization', bearer(tester))
          .expect(403);
      });
    });
  });

  describe('a client organization', () => {
    let assignmentId: string;
    let accountId: string;
    let grantId: string;
    let environmentId: string;

    /** Refused either as "you may not" or as "there is no such thing" — never answered. */
    function refused(response: { status: number; body: unknown }): void {
      expect([403, 404]).toContain(response.status);
      expect(JSON.stringify(response.body)).not.toContain('qa-admin@staging.example');
    }

    beforeAll(async () => {
      assignmentId = await assign({ whatToTest: 'Nothing a client may read' });
      const account = await api()
        .post(`/api/v1/projects/${projectId}/test-accounts`)
        .set('Authorization', bearer(pm))
        .send({
          environment: 'STAGING',
          label: 'Isolation subject',
          username: 'qa-admin@staging.example',
          secret: 'Isolation-Secret9',
        })
        .expect(201);
      accountId = account.body.id;

      const grant = await api()
        .post(`/api/v1/test-accounts/${accountId}/grant`)
        .set('Authorization', bearer(pm))
        .send({ grantedToUserId: testerUserId })
        .expect(201);
      grantId = grant.body.id;

      const environment = await api()
        .post(`/api/v1/projects/${projectId}/environments`)
        .set('Authorization', bearer(pm))
        .send({ kind: 'STAGING', url: 'https://staging.qa-e2e.example', status: 'UP' })
        .expect(201);
      environmentId = environment.body.id;
    });

    it('is refused on the testing queue and on one assignment', async () => {
      refused(await api().get('/api/v1/qa/assignments').set('Authorization', bearer(clientAdmin)));
      refused(
        await api()
          .get(`/api/v1/qa/assignments/${assignmentId}`)
          .set('Authorization', bearer(clientAdmin)),
      );
      refused(
        await api()
          .post('/api/v1/qa/assignments')
          .set('Authorization', bearer(clientAdmin))
          .send({ projectId, kind: 'QA', taskId }),
      );
      refused(
        await api()
          .post(`/api/v1/qa/assignments/${assignmentId}/start`)
          .set('Authorization', bearer(clientAdmin)),
      );
    });

    it('is refused on test accounts, grants and the access log', async () => {
      refused(
        await api()
          .get(`/api/v1/projects/${projectId}/test-accounts`)
          .set('Authorization', bearer(clientAdmin)),
      );
      refused(
        await api()
          .post(`/api/v1/projects/${projectId}/test-accounts`)
          .set('Authorization', bearer(clientAdmin))
          .send({
            environment: 'STAGING',
            label: 'Client tries',
            username: 'nope@example.com',
            secret: 'Nope-Secret123',
          }),
      );
      refused(
        await api()
          .post(`/api/v1/grants/${grantId}/reveal`)
          .set('Authorization', bearer(clientAdmin)),
      );
      refused(
        await api().get('/api/v1/credential-access-log').set('Authorization', bearer(clientAdmin)),
      );
    });

    it('is refused on the environments of a project it does not own', async () => {
      // The client holds `project:read`, so this one is refused by tenant scope rather than by
      // the permission — which is exactly the layer under test.
      refused(
        await api()
          .get(`/api/v1/projects/${projectId}/environments`)
          .set('Authorization', bearer(clientAdmin)),
      );
      refused(
        await api()
          .patch(`/api/v1/environments/${environmentId}`)
          .set('Authorization', bearer(clientAdmin))
          .send({ status: 'DOWN' }),
      );
      refused(
        await api()
          .post(`/api/v1/projects/${projectId}/environments`)
          .set('Authorization', bearer(clientAdmin))
          .send({ kind: 'STAGING', url: 'https://client.example' }),
      );
    });
  });
});
