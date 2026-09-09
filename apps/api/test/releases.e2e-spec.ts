import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Releases end to end.
 *
 * The parts worth proving against a real database rather than a unit test: that the readiness
 * checklist the page shows is the same one the publish endpoint enforces, that the sign-offs a
 * release carries are the ones frozen onto it rather than whatever the policy says today, and that
 * the last two things between an operator and production — the typed version and
 * `release:publish` — cannot be walked around.
 */
describe('Releases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let tester: Session;
  let clientAdmin: Session;
  let providerOrgId: string;
  let projectId: string;
  let taskId: string;
  let nextTaskNumber: number;
  let versionCounter = 0;

  const api = () => request(app.getHttpServer());

  /** A fixture project of our own: the policy, the versions and the cleanup are all ours. */
  async function createProject(): Promise<string> {
    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: 'RLE2E',
        name: 'Release end-to-end fixture',
        description: 'Created by releases.e2e-spec.ts',
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
        description: 'release e2e fixture',
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

  /** The gates this project insists on. Every field is stated, so no test inherits another's. */
  function setPolicy(over: Record<string, unknown> = {}, session = pm) {
    return api()
      .put(`/api/v1/projects/${projectId}/release-policy`)
      .set('Authorization', bearer(session))
      .send({
        approverRoles: [],
        requiresQaPass: false,
        requiresClientUat: false,
        requiresLiveVerification: false,
        requiresTypedConfirmation: true,
        ...over,
      })
      .expect(200);
  }

  const nextVersion = () => `2026.09.${(versionCounter += 1)}`;

  async function createRelease(over: Record<string, unknown> = {}, session = pm) {
    const response = await api()
      .post('/api/v1/releases')
      .set('Authorization', bearer(session))
      .send({ projectId, version: nextVersion(), title: 'Checkout improvements', ...over })
      .expect(201);
    return response.body;
  }

  const addTask = (releaseId: string, id = taskId, session = pm) =>
    api()
      .post(`/api/v1/releases/${releaseId}/items`)
      .set('Authorization', bearer(session))
      .send({ kind: 'TASK', taskId: id });

  const detail = (releaseId: string, session = pm) =>
    api().get(`/api/v1/releases/${releaseId}`).set('Authorization', bearer(session));

  const post = (
    releaseId: string,
    action: string,
    body: Record<string, unknown> = {},
    session = pm,
  ) =>
    api()
      .post(`/api/v1/releases/${releaseId}/${action}`)
      .set('Authorization', bearer(session))
      .send(body);

  interface Gate {
    key: string;
    satisfied: boolean;
    reason: string;
  }

  /** One gate off the readiness checklist. Missing is a failure, not an empty object. */
  function gate(body: { readiness: { gates: Gate[] } }, key: string): Gate {
    const found = body.readiness.gates.find((row) => row.key === key);
    if (!found) {
      throw new Error(`The readiness checklist has no ${key} gate`);
    }
    return found;
  }

  /**
   * A release with one item, approved and waiting to be published.
   *
   * The lead asks and the PM signs, because nobody may approve a release they asked for — see
   * "separation of duties" below. Both hold `release:manage`, so either could have asked.
   */
  async function approvedRelease(over: Record<string, unknown> = {}): Promise<string> {
    const release = await createRelease(over);
    await addTask(release.id).expect(201);
    const requested = await post(release.id, 'request-approval', {}, lead).expect(201);
    if (requested.body.status === 'APPROVAL_REQUESTED') {
      await post(release.id, 'approve', { decision: 'APPROVED' }).expect(201);
    }
    return release.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, pm, lead, tester, clientAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.clientAdmin),
    ]);

    const provider = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = provider?.id ?? '';
    expect(providerOrgId).toBeTruthy();

    // Task numbers are unique per organization, so the fixtures start above whatever is there.
    const highest = await prisma.task.aggregate({
      where: { organizationId: providerOrgId },
      _max: { number: true },
    });
    nextTaskNumber = (highest._max.number ?? 0) + 2000;

    projectId = await createProject();
    taskId = await createTask('Release e2e — checkout');
  });

  afterAll(async () => {
    // Only rows these tests created: everything hangs off the fixture project. Items, approvals
    // and history cascade with the release; the testing assignments do not, so they go first.
    await prisma.testResult.deleteMany({ where: { assignment: { projectId } } });
    await prisma.testingAssignment.deleteMany({ where: { projectId } });
    await prisma.release.deleteMany({ where: { projectId } });
    await prisma.projectReleasePolicy.deleteMany({ where: { projectId } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await app.close();
  });

  describe('from draft to production', () => {
    it('walks create → items → approval → approve → publish', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const release = await createRelease({ title: 'The whole path', notes: 'Deploy after 8pm' });
      expect(release).toMatchObject({ status: 'DRAFT', projectId, itemCount: 0 });

      const withItem = await addTask(release.id).expect(201);
      expect(withItem.body.items).toHaveLength(1);
      expect(withItem.body.items[0]).toMatchObject({ kind: 'TASK', taskId });
      expect(withItem.body.items[0].reference).toContain('RLE2E');

      const requested = await post(release.id, 'request-approval', {}, lead).expect(201);
      expect(requested.body.status).toBe('APPROVAL_REQUESTED');
      expect(requested.body.approvals).toHaveLength(1);
      expect(requested.body.approvals[0]).toMatchObject({
        approverRole: 'PROJECT_MANAGER',
        decision: 'PENDING',
      });

      const approved = await post(release.id, 'approve', {
        decision: 'APPROVED',
        note: 'Looks right to me',
      }).expect(201);
      expect(approved.body.status).toBe('APPROVED');
      expect(approved.body.approvals[0]).toMatchObject({
        decision: 'APPROVED',
        approverName: pm.body.user.name,
      });
      expect(approved.body.readiness.publishable).toBe(true);

      const published = await post(release.id, 'publish', {
        confirmVersion: release.version,
      }).expect(201);
      expect(published.body.status).toBe('PUBLISHED');
      expect(published.body.publishedAt).toBeTruthy();
      expect(published.body.publishedByName).toBe(pm.body.user.name);

      // Every move is on the trail, in the order it happened.
      const statuses = published.body.history.map((row: { toStatus: string }) => row.toStatus);
      expect(statuses).toEqual([
        'DRAFT',
        'APPROVAL_REQUESTED',
        'APPROVED',
        'PUBLISHING',
        'PUBLISHED',
      ]);
    });

    it('will not change the contents of a release under review', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const release = await createRelease();
      await addTask(release.id).expect(201);
      await post(release.id, 'request-approval').expect(201);

      const second = await createTask('Release e2e — a late addition');
      await addTask(release.id, second).expect(409);
    });
  });

  describe('readiness', () => {
    it('reports every gate, whether it passes or not', async () => {
      await setPolicy({ requiresQaPass: true, requiresClientUat: true });
      const release = await createRelease();

      const body = (await detail(release.id).expect(200)).body;
      expect(body.readiness.gates.map((row: { key: string }) => row.key).sort()).toEqual([
        'approvals',
        'items',
        'publisher',
        'qa',
        'uat',
      ]);
      // A gate says why either way, so a disabled button can explain itself.
      for (const row of body.readiness.gates) {
        expect(typeof row.reason).toBe('string');
        expect(row.reason.length).toBeGreaterThan(0);
      }
      expect(gate(body, 'items')).toMatchObject({ satisfied: false });
      expect(gate(body, 'publisher')).toMatchObject({ satisfied: true });
      expect(body.readiness.publishable).toBe(false);
    });

    it('refuses to publish a release with nothing in it, and says so', async () => {
      await setPolicy();
      const release = await createRelease();

      const empty = (await detail(release.id).expect(200)).body;
      expect(gate(empty, 'items')).toMatchObject({ satisfied: false });
      expect(gate(empty, 'items').reason).toMatch(/nothing/i);

      // Nobody is asked to sign off an empty list either.
      const refused = await post(release.id, 'request-approval').expect(409);
      expect(refused.body.message).toMatch(/before asking anyone to approve/i);
      await post(release.id, 'publish', { confirmVersion: release.version }).expect(409);
    });

    it('names the gate that is failing when a publish is refused', async () => {
      // QA is required, and this release has had none: the gate that is green on exactly the
      // release nobody looked at is the one that lets an untested version out.
      await setPolicy({ requiresQaPass: true });
      const id = await approvedRelease();

      const ready = (await detail(id).expect(200)).body;
      expect(ready.status).toBe('APPROVED');
      expect(gate(ready, 'qa')).toMatchObject({ satisfied: false });
      expect(ready.readiness.publishable).toBe(false);

      const refused = await post(id, 'publish', { confirmVersion: ready.version }).expect(409);
      expect(refused.body.message).toMatch(/not ready/i);
      expect(refused.body.message).toMatch(/No QA has been recorded/i);

      // Refused, not half-done: the release is still approved rather than stuck in PUBLISHING.
      const after = (await detail(id).expect(200)).body;
      expect(after.status).toBe('APPROVED');
    });

    it('lets the release out once the QA it was waiting on has passed', async () => {
      await setPolicy({ requiresQaPass: true });
      const id = await approvedRelease();
      // Blocked first, then unblocked by the very endpoint the "Send to testing" action posts to.
      const blocked = (await detail(id).expect(200)).body;
      expect(gate(blocked, 'qa')).toMatchObject({ satisfied: false });
      await passQaFor(id);

      const ready = (await detail(id).expect(200)).body;
      expect(gate(ready, 'qa')).toMatchObject({ satisfied: true });
      expect(ready.readiness.publishable).toBe(true);
      const published = await post(id, 'publish', { confirmVersion: ready.version }).expect(201);
      expect(published.body.status).toBe('PUBLISHED');
    });
  });

  describe('the typed confirmation', () => {
    it('refuses the wrong version and accepts the exact one', async () => {
      await setPolicy({ requiresTypedConfirmation: true });
      const id = await approvedRelease();
      const version = (await detail(id).expect(200)).body.version;

      await post(id, 'publish', {}).expect(400);
      await post(id, 'publish', { confirmVersion: `${version} ` }).expect(400);
      const wrong = await post(id, 'publish', { confirmVersion: '9.9.9' }).expect(400);
      expect(wrong.body.message).toContain(version);

      const published = await post(id, 'publish', { confirmVersion: version }).expect(201);
      expect(published.body.status).toBe('PUBLISHED');
    });

    it('does not ask for it when the project does not want it', async () => {
      await setPolicy({ requiresTypedConfirmation: false });
      const id = await approvedRelease();
      const published = await post(id, 'publish', {}).expect(201);
      expect(published.body.status).toBe('PUBLISHED');
    });
  });

  describe('the approval snapshot', () => {
    it('is not changed by editing the project policy afterwards', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const release = await createRelease();
      await addTask(release.id).expect(201);
      const requested = await post(release.id, 'request-approval', {}, lead).expect(201);
      expect(
        requested.body.approvals.map((row: { approverRole: string }) => row.approverRole),
      ).toEqual(['PROJECT_MANAGER']);

      // The policy now demands two other signatures. The release in flight was sent out under
      // the old one and is judged against that.
      await setPolicy({ approverRoles: ['DIRECTOR', 'QA_LEAD'] });

      const unchanged = (await detail(release.id).expect(200)).body;
      expect(unchanged.approvals.map((row: { approverRole: string }) => row.approverRole)).toEqual([
        'PROJECT_MANAGER',
      ]);
      expect(gate(unchanged, 'approvals')).toMatchObject({ satisfied: false });

      const approved = await post(release.id, 'approve', { decision: 'APPROVED' }).expect(201);
      expect(approved.body.status).toBe('APPROVED');
      expect(gate(approved.body, 'approvals')).toMatchObject({ satisfied: true });
    });

    it('throws the signatures away when a rejection sends the release back to draft', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const release = await createRelease();
      await addTask(release.id).expect(201);
      await post(release.id, 'request-approval').expect(201);

      await post(release.id, 'approve', { decision: 'REJECTED' }).expect(400);
      const rejected = await post(release.id, 'approve', {
        decision: 'REJECTED',
        note: 'The migration is missing',
      }).expect(201);
      expect(rejected.body.status).toBe('DRAFT');
      expect(rejected.body.approvals).toEqual([]);
    });
  });

  /**
   * The control that stops one person doing the whole thing.
   *
   * PROJECT_MANAGER holds `release:manage`, `release:approve` and `release:publish` together, so
   * without this a single account could assemble a release, ask for approval, grant it and ship
   * it — which makes the approval step decoration rather than a check.
   */
  describe('separation of duties', () => {
    it('refuses the sign-off to whoever asked for it', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const release = await createRelease();
      await addTask(release.id).expect(201);
      await post(release.id, 'request-approval').expect(201);

      const refused = await post(release.id, 'approve', { decision: 'APPROVED' }).expect(403);
      expect(refused.body.message).toMatch(/you asked for this approval/i);

      // Nothing was written: the release is still waiting, and the signature is still pending.
      const waiting = (await detail(release.id).expect(200)).body;
      expect(waiting.status).toBe('APPROVAL_REQUESTED');
      expect(waiting.approvals[0]).toMatchObject({ decision: 'PENDING', approverName: null });
      expect(gate(waiting, 'approvals')).toMatchObject({ satisfied: false });
    });

    it('accepts it from anybody else, including on a release they created', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      // Created by the PM, asked for by the lead: creating is not asking, and only asking bars.
      const release = await createRelease();
      await addTask(release.id).expect(201);
      await post(release.id, 'request-approval', {}, lead).expect(201);

      const approved = await post(release.id, 'approve', { decision: 'APPROVED' }).expect(201);
      expect(approved.body.status).toBe('APPROVED');
    });

    it('still lets the requester withdraw their own release by rejecting it', async () => {
      // Rejecting cannot ship anything; it is the way back to draft, and blocking it would leave
      // a release nobody could pull back on a one-manager team.
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const release = await createRelease();
      await addTask(release.id).expect(201);
      await post(release.id, 'request-approval').expect(201);

      const rejected = await post(release.id, 'approve', {
        decision: 'REJECTED',
        note: 'Not going out this week after all',
      }).expect(201);
      expect(rejected.body.status).toBe('DRAFT');
    });

    it('is judged on the latest request, not one a rejection already threw away', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const release = await createRelease();
      await addTask(release.id).expect(201);
      // The PM asks, then withdraws it. The lead asks again — so the PM may now sign.
      await post(release.id, 'request-approval').expect(201);
      await post(release.id, 'approve', { decision: 'REJECTED', note: 'Wrong week' }).expect(201);
      await post(release.id, 'request-approval', {}, lead).expect(201);

      const approved = await post(release.id, 'approve', { decision: 'APPROVED' }).expect(201);
      expect(approved.body.status).toBe('APPROVED');
    });
  });

  describe('what a publish records against the work', () => {
    it('notes the version on every task and ticket the release carried', async () => {
      await setPolicy();
      const id = await approvedRelease();
      const version = (await detail(id).expect(200)).body.version;
      await post(id, 'publish', { confirmVersion: version }).expect(201);

      const history = await prisma.taskStatusHistory.findMany({
        where: { taskId, note: `Shipped in release ${version}` },
        select: { fromStatus: true, toStatus: true, changedById: true },
      });
      expect(history).toHaveLength(1);
      // A note, not a move: the task is left exactly where the task workflow put it.
      expect(history[0]?.fromStatus).toBe(history[0]?.toStatus);
      expect(history[0]?.changedById).toBe(pm.body.user.id);
      const task = await prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { status: true },
      });
      expect(task.status).toBe('READY_FOR_QA');
    });
  });

  describe('permissions', () => {
    it('will not let an approver publish', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const id = await approvedRelease();

      // The team lead holds `release:manage` and `release:approve`, but not `release:publish`.
      const refused = await post(id, 'publish', { confirmVersion: '2026.09.1' }, lead).expect(403);
      expect(refused.body.message).toMatch(/release:publish/);

      // …and the checklist tells them so rather than showing a green button that 403s.
      const asLead = (await detail(id, lead).expect(200)).body;
      expect(gate(asLead, 'publisher')).toMatchObject({ satisfied: false });
      expect(asLead.readiness.publishable).toBe(false);
    });

    it('needs release:publish to roll a release back as well', async () => {
      await setPolicy();
      const id = await approvedRelease();
      await post(id, 'publish', { confirmVersion: (await detail(id)).body.version }).expect(201);

      await post(id, 'rollback', { reason: 'The lead pulls it' }, lead).expect(403);
      const rolled = await post(id, 'rollback', { reason: 'Checkout errors in production' }).expect(
        201,
      );
      expect(rolled.body.status).toBe('ROLLED_BACK');
    });

    it('keeps a client organization off every release route', async () => {
      await setPolicy();
      const id = await approvedRelease();

      const refusals = [
        await api().get('/api/v1/releases').set('Authorization', bearer(clientAdmin)),
        await api().get(`/api/v1/releases/${id}`).set('Authorization', bearer(clientAdmin)),
        await api()
          .post('/api/v1/releases')
          .set('Authorization', bearer(clientAdmin))
          .send({ projectId, version: 'client.1', title: 'A client tries' }),
        await api()
          .post(`/api/v1/releases/${id}/items`)
          .set('Authorization', bearer(clientAdmin))
          .send({ kind: 'TASK', taskId }),
        await api()
          .post(`/api/v1/releases/${id}/approve`)
          .set('Authorization', bearer(clientAdmin))
          .send({ decision: 'APPROVED' }),
        await api()
          .post(`/api/v1/releases/${id}/publish`)
          .set('Authorization', bearer(clientAdmin))
          .send({ confirmVersion: '2026.09.1' }),
        await api()
          .post(`/api/v1/releases/${id}/rollback`)
          .set('Authorization', bearer(clientAdmin))
          .send({ reason: 'A client tries' }),
        await api()
          .get(`/api/v1/projects/${projectId}/release-policy`)
          .set('Authorization', bearer(clientAdmin)),
      ];

      for (const response of refusals) {
        expect([403, 404]).toContain(response.status);
        // Nothing about the release leaks through the refusal.
        expect(JSON.stringify(response.body)).not.toContain('Checkout improvements');
      }
    });

    it('keeps someone without release:manage out of the release itself', async () => {
      await setPolicy();
      const id = await approvedRelease();
      // A tester records results and verifies live; reading the internal release page — staging
      // detail, deployment failures, other clients' work — is `release:manage`.
      await detail(id, tester).expect(403);
    });
  });

  describe('rollback, reopen and live verification', () => {
    it('will not roll back without a reason', async () => {
      await setPolicy();
      const id = await approvedRelease();
      await post(id, 'publish', { confirmVersion: (await detail(id)).body.version }).expect(201);

      // Missing, then present but blank: the second one gets past validation and is refused by
      // the workflow, which is the check that has to hold whatever the DTO allows through.
      await post(id, 'rollback', {}).expect(400);
      const blank = await post(id, 'rollback', { reason: '   ' }).expect(400);
      expect(blank.body.message).toMatch(/reason is required/i);

      const rolled = await post(id, 'rollback', { reason: 'Payments failing at the gateway' })
        .expect(201)
        .expect((response) => expect(response.body.status).toBe('ROLLED_BACK'));
      expect(rolled.body.rollbackReason).toBe('Payments failing at the gateway');
      expect(rolled.body.rolledBackAt).toBeTruthy();
    });

    it('reopens a failed release to draft and collects the sign-offs afresh', async () => {
      await setPolicy({ approverRoles: ['PROJECT_MANAGER'] });
      const id = await approvedRelease();
      // FAILED is only reachable from a publish that died half way through, which no endpoint
      // can be asked to do. The row is put there directly so the way out of it can be tested.
      await prisma.release.update({
        where: { id },
        data: { status: 'FAILED', failureReason: 'The deploy job died' },
      });

      // A reopen discards every signature the release collected, so like a rejection it has to
      // say why. Missing, then blank: the second gets past the DTO and is refused by the workflow.
      await post(id, 'reopen', {}).expect(400);
      const blank = await post(id, 'reopen', { reason: '   ' }).expect(400);
      expect(blank.body.message).toMatch(/reason is required/i);

      const reopened = await post(id, 'reopen', {
        reason: 'Migration step needs reordering before we try again',
      }).expect(201);
      expect(reopened.body.status).toBe('DRAFT');
      expect(reopened.body.failureReason).toBeNull();
      // What the approvers looked at is about to change, so their signatures do not survive.
      expect(reopened.body.approvals).toEqual([]);
      // The reason is on the history entry, so the next approver can see what they are re-signing.
      // History is oldest first, so the reopen is the last row rather than the first.
      expect(reopened.body.history.at(-1)).toMatchObject({
        fromStatus: 'FAILED',
        toStatus: 'DRAFT',
        note: 'Migration step needs reordering before we try again',
      });

      // And a draft cannot be reopened again.
      await post(id, 'reopen', { reason: 'trying it twice' }).expect(409);
    });

    it('verifies a published release once live verification has passed', async () => {
      await setPolicy({ requiresLiveVerification: true });
      const id = await approvedRelease();
      await post(id, 'publish', { confirmVersion: (await detail(id)).body.version }).expect(201);

      // "Verified" has to mean a tester said so, not that an operator clicked a button.
      const refused = await post(id, 'verify-live', {}).expect(409);
      expect(refused.body.message).toMatch(/live-verification/i);

      await passLiveVerificationFor(id);
      const verified = await post(id, 'verify-live', { note: 'Smoke test clean' }).expect(201);
      expect(verified.body.status).toBe('VERIFIED');
      expect(verified.body.verifiedAt).toBeTruthy();
    });
  });

  describe('versions', () => {
    it('refuses a version this project has already used', async () => {
      await setPolicy();
      const release = await createRelease();

      const duplicate = await api()
        .post('/api/v1/releases')
        .set('Authorization', bearer(pm))
        .send({ projectId, version: release.version, title: 'The same version again' })
        .expect(409);
      expect(duplicate.body.message).toContain(release.version);
    });

    it('refuses an edit onto a version another release holds, and fixes it once approval is asked for', async () => {
      await setPolicy();
      const first = await createRelease();
      const second = await createRelease();

      await api()
        .patch(`/api/v1/releases/${second.id}`)
        .set('Authorization', bearer(pm))
        .send({ version: first.version })
        .expect(409);

      // A free version is fine while the release is still a draft…
      const renamed = await api()
        .patch(`/api/v1/releases/${second.id}`)
        .set('Authorization', bearer(pm))
        .send({ version: nextVersion() })
        .expect(200);
      expect(renamed.body.version).not.toBe(first.version);

      // …and fixed once it is what the approvers were shown.
      await addTask(second.id).expect(201);
      await post(second.id, 'request-approval').expect(201);
      await api()
        .patch(`/api/v1/releases/${second.id}`)
        .set('Authorization', bearer(pm))
        .send({ version: nextVersion() })
        .expect(409);
    });
  });

  // ---- QA fixtures the release gates read -----------------------------------------------------

  /** A passed QA assignment on the release, which is what `requiresQaPass` is waiting for. */
  async function passQaFor(releaseId: string): Promise<void> {
    await recordAssignment(releaseId, 'QA', 'result', {
      result: 'PASS',
      whatTested: 'The release on staging',
      actualResult: 'Everything behaves',
    });
  }

  /** A passed live verification on the release, which is what `verify-live` is waiting for. */
  async function passLiveVerificationFor(releaseId: string): Promise<void> {
    await recordAssignment(releaseId, 'LIVE_VERIFICATION', 'verify-live');
  }

  async function recordAssignment(
    releaseId: string,
    kind: string,
    action: string,
    body?: Record<string, unknown>,
  ): Promise<void> {
    const created = await api()
      .post('/api/v1/qa/assignments')
      .set('Authorization', bearer(pm))
      .send({
        projectId,
        kind,
        releaseId,
        assignedToUserId: tester.body.user.id,
        whatToTest: 'The release',
      })
      .expect(201);
    await api()
      .post(`/api/v1/qa/assignments/${created.body.id}/start`)
      .set('Authorization', bearer(tester))
      .expect(201);
    await api()
      .post(`/api/v1/qa/assignments/${created.body.id}/${action}`)
      .set('Authorization', bearer(tester))
      .send(body ?? {})
      .expect(201);
  }
});
