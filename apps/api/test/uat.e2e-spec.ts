import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Client UAT end to end.
 *
 * The parts worth proving against a real database: that a sign-off reaches exactly the client
 * whose work it is and nobody else, that a decision cannot be taken twice or taken by the
 * provider, and — the one that would be a breach rather than a bug — that nothing internal rides
 * along in the response a client reads.
 */
describe('Client UAT (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pm: Session;
  let director: Session;
  let clientAdmin: Session;
  let clientEmployee: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let acmeOrgId: string;
  let acmeProjectId: string;
  let acmeTaskId: string;
  let internalTaskId: string;

  const createdRequests: string[] = [];
  const createdAccounts: string[] = [];
  const createdAssignments: string[] = [];

  /** Everything a client is allowed to read on one request, and nothing else. */
  const DETAIL_KEYS = [
    'checklist',
    'clientName',
    'clientOrganizationId',
    'comments',
    'createdAt',
    'createdByName',
    'decidedAt',
    'decidedByName',
    'id',
    'note',
    'previewUrl',
    'releaseId',
    'releaseVersion',
    'status',
    'summaryPlain',
    'taskId',
    'updatedAt',
  ];

  const api = () => request(app.getHttpServer());

  /** Raises a sign-off request against the Acme task, remembering it so afterAll can clear it. */
  async function raise(over: Record<string, unknown> = {}, session = pm): Promise<string> {
    const response = await api()
      .post('/api/v1/uat')
      .set('Authorization', bearer(session))
      .send({
        taskId: acmeTaskId,
        summaryPlain: 'You can now download last month’s invoices as a single PDF.',
        checklist: ['Open Billing', 'Download the PDF', 'Check the totals'],
        ...over,
      })
      .expect(201);
    createdRequests.push(response.body.id);
    return response.body.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [pm, director, clientAdmin, clientEmployee, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.clientEmployee),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    const provider = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = provider?.id ?? '';
    acmeOrgId = clientAdmin.body.user.organization.id;

    const acmeProject = await prisma.project.findFirst({
      where: { organizationId: providerOrgId, code: 'ACM' },
      select: { id: true },
    });
    acmeProjectId = acmeProject?.id ?? '';
    const acmeTask = await prisma.task.findFirst({
      where: { projectId: acmeProjectId, deletedAt: null },
      select: { id: true },
    });
    acmeTaskId = acmeTask?.id ?? '';

    // The internal project has no client, so nobody can be asked to sign its work off.
    const internalTask = await prisma.task.findFirst({
      where: { project: { code: 'ADK' }, deletedAt: null },
      select: { id: true },
    });
    internalTaskId = internalTask?.id ?? '';

    expect(
      providerOrgId && acmeOrgId && acmeProjectId && acmeTaskId && internalTaskId,
    ).toBeTruthy();
  });

  afterAll(async () => {
    // Only rows these tests created.
    await prisma.notification.deleteMany({ where: { entityId: { in: createdRequests } } });
    await prisma.uatComment.deleteMany({ where: { uatRequestId: { in: createdRequests } } });
    await prisma.uatRequest.deleteMany({ where: { id: { in: createdRequests } } });
    await prisma.testingAssignment.deleteMany({ where: { id: { in: createdAssignments } } });
    await prisma.credentialAccessLog.deleteMany({
      where: { testAccountId: { in: createdAccounts } },
    });
    await prisma.testAccount.deleteMany({ where: { id: { in: createdAccounts } } });
    await app.close();
  });

  describe('the provider raises a request', () => {
    it('derives the client from the work rather than from the caller', async () => {
      const response = await api()
        .post('/api/v1/uat')
        .set('Authorization', bearer(pm))
        .send({
          taskId: acmeTaskId,
          summaryPlain: 'The monthly statement now shows the closing balance.',
          previewUrl: 'https://preview.example/statement',
          checklist: ['Open a statement', 'Find the closing balance'],
        })
        .expect(201);
      createdRequests.push(response.body.id);

      expect(response.body).toMatchObject({
        clientOrganizationId: acmeOrgId,
        status: 'PENDING',
        taskId: acmeTaskId,
        decidedAt: null,
        decidedByName: null,
      });
      expect(response.body.checklist).toEqual(['Open a statement', 'Find the closing balance']);
    });

    it('needs exactly one subject', async () => {
      for (const subject of [{}, { taskId: acmeTaskId, releaseId: acmeTaskId }]) {
        await api()
          .post('/api/v1/uat')
          .set('Authorization', bearer(pm))
          .send({ summaryPlain: 'Something changed that you should look at.', ...subject })
          .expect(400);
      }
    });

    it('refuses work that has no client to sign it off', async () => {
      const response = await api()
        .post('/api/v1/uat')
        .set('Authorization', bearer(pm))
        .send({ taskId: internalTaskId, summaryPlain: 'An internal change nobody signs off.' })
        .expect(400);
      expect(response.body.message).toMatch(/internal project/i);
    });

    it('lists what it raised, pending first', async () => {
      const id = await raise();
      const response = await api().get('/api/v1/uat').set('Authorization', bearer(pm)).expect(200);
      expect(response.body.map((row: { id: string }) => row.id)).toContain(id);
      expect(response.body[0].status).toBe('PENDING');
    });

    it('keeps a client off the internal route', async () => {
      await api().get('/api/v1/uat').set('Authorization', bearer(clientAdmin)).expect(403);
    });
  });

  describe('what the client can see', () => {
    let id: string;

    beforeAll(async () => {
      id = await raise();
    });

    it('shows the request to the client it was raised for', async () => {
      const response = await api()
        .get('/api/v1/portal/uat')
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(response.body.map((row: { id: string }) => row.id)).toContain(id);
    });

    it('does not show it to another client', async () => {
      const response = await api()
        .get('/api/v1/portal/uat')
        .set('Authorization', bearer(zenithAdmin))
        .expect(200);
      expect(response.body.map((row: { id: string }) => row.id)).not.toContain(id);
    });

    it("answers 404 — not 403 — for another client's request", async () => {
      await api()
        .get(`/api/v1/portal/uat/${id}`)
        .set('Authorization', bearer(zenithAdmin))
        .expect(404);
      await api()
        .post(`/api/v1/portal/uat/${id}/comments`)
        .set('Authorization', bearer(zenithAdmin))
        .send({ body: 'Can I see this?' })
        .expect(404);
    });

    it('carries no staging URL, no credential and no internal field', async () => {
      // Real internal data on the very task this sign-off is about: a staging environment and a
      // test login with a password. None of it may appear in what the client reads.
      const account = await api()
        .post(`/api/v1/projects/${acmeProjectId}/test-accounts`)
        .set('Authorization', bearer(pm))
        .send({
          environment: 'STAGING',
          label: 'UAT leak probe',
          username: 'uat-leak-probe@staging.example',
          secret: 'S3cret-Do-Not-Leak',
        })
        .expect(201);
      createdAccounts.push(account.body.id);

      const assignment = await api()
        .post('/api/v1/qa/assignments')
        .set('Authorization', bearer(pm))
        .send({
          projectId: acmeProjectId,
          kind: 'QA',
          taskId: acmeTaskId,
          testAccountId: account.body.id,
          stagingUrl: 'https://staging-internal.example/leak-probe',
          developerNotes: 'Internal only: the feature flag is behind uat-leak-probe.',
        })
        .expect(201);
      createdAssignments.push(assignment.body.id);

      const response = await api()
        .get(`/api/v1/portal/uat/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);

      expect(Object.keys(response.body).sort()).toEqual(DETAIL_KEYS);
      const body = JSON.stringify(response.body);
      for (const forbidden of [
        'staging-internal.example',
        'S3cret-Do-Not-Leak',
        'uat-leak-probe',
        'stagingUrl',
        'developerNotes',
        'secretCiphertext',
        'organizationId":',
      ]) {
        expect(body).not.toContain(forbidden);
      }
      // The one id it does carry is the client's own.
      expect(response.body.clientOrganizationId).toBe(acmeOrgId);
    });

    it('lets a client employee read without being able to decide', async () => {
      await api()
        .get(`/api/v1/portal/uat/${id}`)
        .set('Authorization', bearer(clientEmployee))
        .expect(200);
      await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientEmployee))
        .send({ decision: 'APPROVED' })
        .expect(403);
    });
  });

  describe('deciding', () => {
    it('records the client admin’s approval, once', async () => {
      const id = await raise();
      const approved = await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'APPROVED', note: 'Looks right, thank you.' })
        .expect(201);

      expect(approved.body).toMatchObject({ status: 'APPROVED', note: 'Looks right, thank you.' });
      expect(approved.body.decidedAt).not.toBeNull();
      expect(approved.body.decidedByName).toBeTruthy();

      const again = await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'CHANGES_REQUESTED', note: 'Actually, no.' })
        .expect(409);
      expect(again.body.message).toMatch(/already been decided/i);

      // And the first answer is still the one on the record.
      const after = await api()
        .get(`/api/v1/portal/uat/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(after.body).toMatchObject({ status: 'APPROVED', note: 'Looks right, thank you.' });
    });

    /**
     * The person who asked has to be told the answer.
     *
     * A decision dispatched nothing at all, so the provider learned that a client had approved —
     * or, worse, asked for changes — by opening the release page and looking. On
     * CHANGES_REQUESTED that is work sitting on somebody's desk that nobody knows has landed.
     */
    it('tells whoever raised the request that the client answered', async () => {
      const id = await raise();
      await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'CHANGES_REQUESTED', note: 'The credit notes are missing.' })
        .expect(201);

      const notification = await prisma.notification.findFirst({
        where: { type: 'UAT_DECIDED', entityId: id, userId: pm.body.user.id },
      });
      expect(notification).not.toBeNull();
      // The client's own words, so the notification is the message rather than a nudge to go and
      // find one.
      expect(notification?.body).toBe('The credit notes are missing.');
      expect(notification?.title).toMatch(/asked for changes/i);

      // Nobody at the client is told about their own answer.
      const toTheClient = await prisma.notification.count({
        where: { type: 'UAT_DECIDED', entityId: id, userId: clientAdmin.body.user.id },
      });
      expect(toTheClient).toBe(0);
    });

    it('will not let the provider sign off on the client’s behalf', async () => {
      const id = await raise();
      // The director is a super admin and does hold `uat:decide`; being internal is what stops
      // them, because a sign-off the provider gave itself is not a sign-off.
      await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(director))
        .send({ decision: 'APPROVED' })
        .expect(403);

      const untouched = await api()
        .get(`/api/v1/uat/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(untouched.body.status).toBe('PENDING');
    });

    it('makes a request for changes say what must change', async () => {
      const id = await raise();
      await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'CHANGES_REQUESTED' })
        .expect(400);

      const decided = await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'CHANGES_REQUESTED', note: 'The totals column is off by a rupee.' })
        .expect(201);
      expect(decided.body).toMatchObject({
        status: 'CHANGES_REQUESTED',
        note: 'The totals column is off by a rupee.',
      });
    });

    it('refuses PENDING as a decision', async () => {
      const id = await raise();
      await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'PENDING' })
        .expect(400);
    });
  });

  describe('the conversation', () => {
    it('keeps both sides on one thread, in the order it happened', async () => {
      const id = await raise();
      await api()
        .post(`/api/v1/portal/uat/${id}/comments`)
        .set('Authorization', bearer(clientAdmin))
        .send({ body: 'Does this include cancelled invoices?' })
        .expect(201);
      await api()
        .post(`/api/v1/uat/${id}/comments`)
        .set('Authorization', bearer(pm))
        .send({ body: 'No — cancelled ones are left out of the PDF.' })
        .expect(201);
      await api()
        .post(`/api/v1/portal/uat/${id}/comments`)
        .set('Authorization', bearer(clientAdmin))
        .send({ body: 'Understood, approving now.' })
        .expect(201);

      const client = await api()
        .get(`/api/v1/portal/uat/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(
        client.body.comments.map((row: { body: string; fromClient: boolean }) => [
          row.fromClient,
          row.body,
        ]),
      ).toEqual([
        [true, 'Does this include cancelled invoices?'],
        [false, 'No — cancelled ones are left out of the PDF.'],
        [true, 'Understood, approving now.'],
      ]);
      for (const comment of client.body.comments) {
        expect(Object.keys(comment).sort()).toEqual([
          'authorName',
          'body',
          'createdAt',
          'fromClient',
          'id',
        ]);
      }

      // The provider reads the same thread.
      const internal = await api()
        .get(`/api/v1/uat/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(internal.body.comments).toHaveLength(3);
    });
  });
  /**
   * The sign-off has to reach the gate that asked for it.
   *
   * `POST /uat` takes either a release or a single task, and asking a client to approve one change
   * at a time is the ordinary way to use it — the release that ships it usually does not exist
   * yet. Counting only release-linked requests meant those approvals were given by the client and
   * then ignored: a project with `requiresClientUat` stayed blocked on "the client has not been
   * asked to sign off" while their approval sat in the database.
   */
  describe('the release gate the sign-off feeds', () => {
    const createdReleases: string[] = [];
    const createdTasks: string[] = [];

    /**
     * A task of this block's own, never one the other tests have already asked about.
     *
     * The gate counts every request covering the release, answered or not — an unanswered one is
     * a client who has not replied yet, and it holds the release exactly as an open QA check does.
     * Reusing the shared fixture task would therefore drag every earlier test's pending request
     * into the count and make this assert the leftovers rather than the behaviour.
     */
    async function ownTask(): Promise<string> {
      const highest = await prisma.task.aggregate({
        where: { organizationId: providerOrgId },
        _max: { number: true },
      });
      const task = await prisma.task.create({
        data: {
          organizationId: providerOrgId,
          projectId: acmeProjectId,
          title: 'UAT gate fixture',
          description: 'Created by uat.e2e-spec.ts',
          status: 'IN_REVIEW',
          priority: 'MEDIUM',
          createdById: pm.body.user.id,
          number: (highest._max.number ?? 0) + 500,
          clientVisible: true,
        },
        select: { id: true },
      });
      createdTasks.push(task.id);
      return task.id;
    }

    afterAll(async () => {
      await prisma.releaseItem.deleteMany({ where: { releaseId: { in: createdReleases } } });
      await prisma.releaseApproval.deleteMany({ where: { releaseId: { in: createdReleases } } });
      await prisma.releaseHistory.deleteMany({ where: { releaseId: { in: createdReleases } } });
      await prisma.release.deleteMany({ where: { id: { in: createdReleases } } });
      await prisma.projectReleasePolicy.deleteMany({ where: { projectId: acmeProjectId } });
      await prisma.task.deleteMany({ where: { id: { in: createdTasks } } });
    });

    /** A release on the client's project, carrying the very task the client was asked about. */
    async function releaseCarryingTheTask(taskId: string): Promise<string> {
      await api()
        .put(`/api/v1/projects/${acmeProjectId}/release-policy`)
        .set('Authorization', bearer(pm))
        .send({
          approverRoles: [],
          requiresQaPass: false,
          requiresClientUat: true,
          requiresLiveVerification: false,
          requiresTypedConfirmation: false,
        })
        .expect(200);

      const release = await api()
        .post('/api/v1/releases')
        .set('Authorization', bearer(pm))
        .send({
          projectId: acmeProjectId,
          version: `uat-gate-${Date.now().toString().slice(-8)}`,
          title: 'Release carrying the signed-off task',
        })
        .expect(201);
      createdReleases.push(release.body.id);

      await api()
        .post(`/api/v1/releases/${release.body.id}/items`)
        .set('Authorization', bearer(pm))
        .send({ kind: 'TASK', taskId })
        .expect(201);
      return release.body.id;
    }

    const uatGate = async (releaseId: string) => {
      const body = await api()
        .get(`/api/v1/releases/${releaseId}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      const found = body.body.readiness.gates.find((row: { key: string }) => row.key === 'uat');
      if (!found) {
        throw new Error('The readiness checklist has no uat gate');
      }
      return found as { satisfied: boolean; reason: string };
    };

    it('counts a task-linked approval towards the release carrying that task', async () => {
      const taskId = await ownTask();
      const releaseId = await releaseCarryingTheTask(taskId);

      // Nobody asked yet: the gate is closed and says so.
      expect(await uatGate(releaseId)).toMatchObject({ satisfied: false });

      const id = await raise({ taskId });
      // Asked but unanswered is still closed.
      expect(await uatGate(releaseId)).toMatchObject({ satisfied: false });

      await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'APPROVED' })
        .expect(201);

      expect(await uatGate(releaseId)).toMatchObject({ satisfied: true });
    });

    it('lets a rejection on a covered task block the release', async () => {
      const taskId = await ownTask();
      const releaseId = await releaseCarryingTheTask(taskId);
      const id = await raise({ taskId });
      await api()
        .post(`/api/v1/portal/uat/${id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'CHANGES_REQUESTED', note: 'The totals are still wrong.' })
        .expect(201);

      // The half that matters most: a client who asked for changes is not published around.
      expect(await uatGate(releaseId)).toMatchObject({
        satisfied: false,
        reason: expect.stringMatching(/asked for changes/i),
      });
    });

    /**
     * A request for changes is an answer to one ask, not a verdict on the project.
     *
     * Without this the first "request changes" on a project with `requiresClientUat` made the
     * release permanently unpublishable: the row is terminal, no endpoint reopens it, and the gate
     * counted every request ever raised — so raising a second one and having the client approve it
     * changed nothing, because the old row still said CHANGES_REQUESTED.
     */
    it('lets a new sign-off replace the one the client rejected', async () => {
      const taskId = await ownTask();
      const releaseId = await releaseCarryingTheTask(taskId);

      const rejected = await raise({ taskId });
      await api()
        .post(`/api/v1/portal/uat/${rejected}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'CHANGES_REQUESTED', note: 'The totals are still wrong.' })
        .expect(201);
      expect(await uatGate(releaseId)).toMatchObject({ satisfied: false });

      // The change is made and the client is asked again — the ordinary way this goes.
      const second = await raise({
        taskId,
        summaryPlain: 'The totals are fixed. Please look at the invoice download again.',
      });
      // Asked but not yet answered: still closed, and now on the newer question.
      expect(await uatGate(releaseId)).toMatchObject({ satisfied: false });

      await api()
        .post(`/api/v1/portal/uat/${second}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'APPROVED' })
        .expect(201);

      expect(await uatGate(releaseId)).toMatchObject({ satisfied: true });

      // And the rejected request is still there to read: superseded, not erased.
      const history = await api()
        .get(`/api/v1/uat/${rejected}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(history.body).toMatchObject({ status: 'CHANGES_REQUESTED' });
    });
  });
});
