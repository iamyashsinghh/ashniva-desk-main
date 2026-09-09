import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { MAX_RECURRING_ROWS } from '../src/modules/recurring-issues/recurring-report.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recurring issues, problems, RCA and incidents end to end.
 *
 * Three properties are worth proving against a real database rather than a unit test.
 *
 * The first is the loop the package exists for: two clients report the same fault, the matcher
 * suggests it, somebody confirms it, a third client makes it a problem, and the problem cannot be
 * closed until there is an analysis and a verified fix. The scoring and the gate are unit-tested
 * in `packages/types`; what is checked here is that the *server* enforces them.
 *
 * The second is the split between suggesting a duplicate and making one. A support executive's
 * `problem:manage` may join two clients' tickets; a developer's `problem:suggest-duplicate` may
 * only ask for it.
 *
 * The third is the boundary. A problem names every client that reported the same fault, so a
 * client user must be refused on every route in the package, and a provider must not be able to
 * read another provider's rows.
 */
describe('Package 11 — recurring issues, problems, RCA and incidents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let tester: Session;
  let support: Session;
  let employee: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;

  let providerOrgId: string;
  let foreignOrgId: string;
  let acmeId: string;
  let zenithId: string;
  /** A third client organization, so a threshold of three is a real count and not a contrivance. */
  let orbitId: string;
  let projectId: string;
  let fixTaskId: string;
  let nextTaskNumber = 900_000;
  // Tickets written straight to the database take their own numbers: the counter the API uses is
  // not consulted, so these start well above anything a request in this file will hand out.
  let nextTicketNumber = 900_000;

  const api = () => request(app.getHttpServer());
  const stamp = Date.now().toString().slice(-6);

  const raise = (clientOrganizationId: string, over: Record<string, unknown> = {}) =>
    api()
      .post('/api/v1/tickets')
      .set('Authorization', bearer(support))
      .send({
        title: 'Invoice printing fails with ERR_PRN_TIMEOUT',
        description: 'Nothing comes out of the printer; the log shows ERR_PRN_TIMEOUT.',
        projectId,
        module: 'Billing',
        productVersion: '3.1.4',
        clientOrganizationId,
        ...over,
      })
      .expect(201);

  const similar = (ticketId: string, session = support) =>
    api().get(`/api/v1/tickets/${ticketId}/similar`).set('Authorization', bearer(session));

  const decide = (
    ticketId: string,
    candidateId: string,
    body: Record<string, unknown>,
    session = support,
  ) =>
    api()
      .post(`/api/v1/tickets/${ticketId}/similar/${candidateId}/decide`)
      .set('Authorization', bearer(session))
      .send(body);

  const problem = (problemId: string, session = support) =>
    api().get(`/api/v1/problems/${problemId}`).set('Authorization', bearer(session));

  const act = (
    problemId: string,
    action: string,
    body: Record<string, unknown> = {},
    session = support,
  ) =>
    api()
      .post(`/api/v1/problems/${problemId}/${action}`)
      .set('Authorization', bearer(session))
      .send(body);

  const incidentAct = (
    incidentId: string,
    action: string,
    body: Record<string, unknown> = {},
    session = pm,
  ) =>
    api()
      .post(`/api/v1/incidents/${incidentId}/${action}`)
      .set('Authorization', bearer(session))
      .send(body);

  async function createTask(title: string): Promise<string> {
    const task = await prisma.task.create({
      data: {
        organizationId: providerOrgId,
        projectId,
        title,
        description: 'package 11 e2e fixture',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
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
    [director, pm, lead, developer, tester, support, employee, clientAdmin, zenithAdmin] =
      await Promise.all([
        loginAs(app, DEMO.director),
        loginAs(app, DEMO.pm),
        loginAs(app, DEMO.lead),
        loginAs(app, DEMO.developer),
        loginAs(app, DEMO.tester),
        loginAs(app, DEMO.support),
        loginAs(app, DEMO.employee),
        loginAs(app, DEMO.clientAdmin),
        loginAs(app, DEMO.zenithAdmin),
      ]);

    const organizations = await prisma.organization.findMany({
      where: { slug: { in: ['ashniva', 'grouphr', 'acme-retail', 'zenith-logistics'] } },
      select: { id: true, slug: true },
    });
    providerOrgId = organizations.find((row) => row.slug === 'ashniva')?.id ?? '';
    foreignOrgId = organizations.find((row) => row.slug === 'grouphr')?.id ?? '';
    acmeId = organizations.find((row) => row.slug === 'acme-retail')?.id ?? '';
    zenithId = organizations.find((row) => row.slug === 'zenith-logistics')?.id ?? '';
    expect(providerOrgId && foreignOrgId && acmeId && zenithId).toBeTruthy();

    const orbit = await prisma.organization.create({
      data: {
        name: `Orbit Freight ${stamp}`,
        slug: `orbit-${stamp}`,
        type: 'CORPORATE_CUSTOMER',
        isServiceProvider: false,
      },
      select: { id: true },
    });
    orbitId = orbit.id;

    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        code: `P11${stamp}`,
        name: 'Package 11 fixture',
        description: 'Created by package-11.e2e-spec.ts',
        type: 'INTERNAL_WORK',
        status: 'ACTIVE',
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    projectId = project.id;

    // Three separate clients, and the senior who is told when they add up to a fault.
    await prisma.supportOwnership.create({
      data: {
        projectId,
        organizationId: providerOrgId,
        seniorId: lead.body.user.id,
        duplicateThreshold: 3,
        similarityEnabled: true,
      },
    });
    fixTaskId = await createTask('Fix the invoice print timeout');
  });

  afterAll(async () => {
    const ticketIds = (
      await prisma.ticket.findMany({ where: { projectId }, select: { id: true } })
    ).map((row) => row.id);
    const problemIds = (
      await prisma.problem.findMany({ where: { projectId }, select: { id: true } })
    ).map((row) => row.id);
    await prisma.similarityMatch.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.incidentLink.deleteMany({ where: { incident: { projectId } } });
    await prisma.incidentTimelineEntry.deleteMany({ where: { incident: { projectId } } });
    await prisma.incident.deleteMany({
      where: { OR: [{ projectId }, { problemId: { in: problemIds } }] },
    });
    await prisma.rcaAction.deleteMany({ where: { rcaReport: { problemId: { in: problemIds } } } });
    await prisma.rcaReport.deleteMany({ where: { problemId: { in: problemIds } } });
    await prisma.problemQuestion.deleteMany({ where: { problemId: { in: problemIds } } });
    await prisma.problemTicket.deleteMany({ where: { problemId: { in: problemIds } } });
    await prisma.problem.deleteMany({ where: { id: { in: problemIds } } });
    await prisma.notification.deleteMany({ where: { entityId: { in: problemIds } } });
    await prisma.ticketSla.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    // Converting or resolving a ticket writes a client update against the project, so these are
    // named rather than left for the project delete to trip over.
    await prisma.clientUpdate.deleteMany({ where: { projectId } });
    await prisma.workLog.deleteMany({ where: { task: { projectId } } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.supportOwnership.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.organization.deleteMany({ where: { id: orbitId } });
    await app.close();
  });

  describe('fingerprinting', () => {
    it('indexes a ticket the moment it is raised', async () => {
      const response = await raise(acmeId, { title: 'Scanner stops after ERR_SCAN_TIMEOUT' });
      const row = await prisma.ticket.findUniqueOrThrow({
        where: { id: response.body.id },
        select: { keywords: true, fingerprint: true, productVersion: true },
      });
      expect(row.productVersion).toBe('3.1.4');
      // "after" is a stop word and drops out; the module joins the keywords; the error code and
      // the coarse bucket are both readable on the row.
      expect(row.keywords).toEqual(expect.arrayContaining(['scanner', 'stops', 'billing']));
      expect(row.keywords).not.toContain('after');
      expect(row.fingerprint).toBe('-|billing|3.1.4|err_scan_timeout');
    });
  });

  describe('the loop, from two reports to a closed problem', () => {
    let acmeTicket: string;
    let zenithTicket: string;
    let orbitTicket: string;
    let problemId: string;
    let rcaId: string;

    it('suggests the second client’s report on the first client’s ticket', async () => {
      acmeTicket = (await raise(acmeId)).body.id;
      zenithTicket = (await raise(zenithId)).body.id;

      const response = await similar(acmeTicket).expect(200);
      const suggestion = response.body.suggestions.find(
        (row: { ticketId: string }) => row.ticketId === zenithTicket,
      );
      expect(suggestion).toBeDefined();
      expect(suggestion.decision).toBe('PENDING');
      expect(suggestion.score).toBeGreaterThanOrEqual(3);
      expect(suggestion.signals).toEqual(
        expect.arrayContaining(['error code ERR_PRN_TIMEOUT', 'module Billing', 'version 3.1.4']),
      );
      // Two clients out of three: worth showing, not yet a fault in the product.
      expect(response.body).toMatchObject({
        clientCount: 2,
        duplicateThreshold: 3,
        thresholdReached: false,
        problemId: null,
      });
    });

    it('lets problem:suggest-duplicate ask for a link, and does not make one', async () => {
      const response = await decide(
        acmeTicket,
        zenithTicket,
        { decision: 'LINKED' },
        developer,
      ).expect(201);
      const suggestion = response.body.suggestions.find(
        (row: { ticketId: string }) => row.ticketId === zenithTicket,
      );
      // Recorded as the suggestion it is, waiting for somebody who may confirm it.
      expect(suggestion.decision).toBe('PENDING');
      expect(response.body.problemId).toBeNull();
      expect(await prisma.problem.count({ where: { projectId } })).toBe(0);
    });

    it('makes a problem when somebody with problem:manage confirms it', async () => {
      const response = await decide(acmeTicket, zenithTicket, { decision: 'LINKED' }).expect(201);
      expect(response.body.problemId).toBeTruthy();
      problemId = response.body.problemId;

      const detail = await problem(problemId).expect(200);
      expect(detail.body).toMatchObject({
        key: expect.stringMatching(/^PRB-\d+$/),
        status: 'OPEN',
        clientCount: 2,
        ticketCount: 2,
        versions: ['3.1.4'],
        // Two clients is under the threshold, so this problem was a person's judgement.
        thresholdHitAt: null,
      });
      expect(detail.body.tickets).toHaveLength(2);
    });

    it('writes the decision both ways round, so a dismissal sticks from either side', async () => {
      const rows = await prisma.similarityMatch.findMany({
        where: { OR: [{ ticketId: acmeTicket }, { candidateTicketId: acmeTicket }] },
        select: { ticketId: true, candidateTicketId: true, decision: true },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.decision === 'LINKED')).toBe(true);
      const fromTheOtherSide = await similar(zenithTicket).expect(200);
      expect(
        fromTheOtherSide.body.suggestions.find(
          (row: { ticketId: string }) => row.ticketId === acmeTicket,
        ).decision,
      ).toBe('LINKED');
    });

    it('stamps the threshold and tells the senior when the third client reports it', async () => {
      orbitTicket = (await raise(orbitId)).body.id;
      await decide(acmeTicket, orbitTicket, { decision: 'LINKED', problemId }).expect(201);

      const detail = await problem(problemId).expect(200);
      expect(detail.body.clientCount).toBe(3);
      expect(detail.body.thresholdHitAt).not.toBeNull();

      const notified = await prisma.notification.findMany({
        where: { entityId: problemId, type: 'PROBLEM_THRESHOLD_REACHED' },
        select: { userId: true, title: true },
      });
      expect(notified.map((row) => row.userId)).toEqual([lead.body.user.id]);
      expect(notified[0]?.title).toContain('3 clients');
    });

    it('does not stamp the threshold a second time', async () => {
      const before = (await problem(problemId).expect(200)).body.thresholdHitAt;
      const fourth = (await raise(acmeId, { title: 'Invoice printing ERR_PRN_TIMEOUT again' })).body
        .id;
      await act(problemId, 'tickets', { ticketIds: [fourth] });
      expect((await problem(problemId).expect(200)).body.thresholdHitAt).toBe(before);
    });

    it('refuses a close before there is anything to close on', async () => {
      const detail = await problem(problemId).expect(200);
      expect(detail.body.closure).toMatchObject({
        allowed: false,
        blockers: [
          'The root-cause analysis has not been submitted yet.',
          'No permanent fix has been assigned.',
        ],
      });
      const refused = await act(problemId, 'close').expect(409);
      // The refusal is the sentence the screen prints under the disabled button, word for word.
      expect(refused.body.message).toBe(detail.body.closure.blockers.join(' '));
    });

    it('asks for an analysis and opens the empty form', async () => {
      const response = await act(problemId, 'request-rca', {
        ownerId: developer.body.user.id,
        dueDate: '2026-10-01',
      }).expect(201);
      expect(response.body.status).toBe('RCA_REQUESTED');
      expect(response.body.rcaDueDate).toBe('2026-10-01');
      expect(response.body.rca).toMatchObject({ status: 'DRAFT' });
      expect(response.body.hasRca).toBe(false);
    });

    it('keeps a half-written analysis without pretending it is one', async () => {
      // A ten-question form written over two days has to be saveable half-finished. A draft moves
      // nothing, and the closure gate does not accept it.
      const drafted = await api()
        .post(`/api/v1/problems/${problemId}/rca`)
        .set('Authorization', bearer(developer))
        .send({ what: 'Printing times out under the nightly batch.', draft: true })
        .expect(201);
      expect(drafted.body.rca).toMatchObject({
        status: 'DRAFT',
        what: 'Printing times out under the nightly batch.',
      });
      expect(drafted.body.status).toBe('RCA_REQUESTED');
      expect(drafted.body.hasRca).toBe(false);
      expect(drafted.body.closure.blockers).toContain(
        'The root-cause analysis has not been submitted yet.',
      );
    });

    it('names what is still blank rather than answering “invalid”', async () => {
      const refused = await api()
        .post(`/api/v1/problems/${problemId}/rca`)
        .set('Authorization', bearer(developer))
        .send({ what: 'Printing times out under the nightly batch.' })
        .expect(400);
      expect(refused.body.message).toBe(
        'The analysis still needs: why it happened, the clients and versions affected, what introduced it, the permanent solution, the prevention',
      );
    });

    it('takes the analysis from the developer who owes it', async () => {
      const response = await api()
        .post(`/api/v1/problems/${problemId}/rca`)
        .set('Authorization', bearer(developer))
        .send({
          what: 'Printing timed out for three clients on 3.1.4.',
          why: 'The spooler waits on a lock the nightly job holds.',
          affectedClientsVersions: 'Three clients, all on 3.1.4.',
          introducedBy: 'The batch job added in 3.1.3.',
          permanentFix: 'Take the lock for the row rather than the table.',
          prevention: 'A load test that prints while the batch runs.',
        })
        .expect(201);
      expect(response.body.status).toBe('RCA_SUBMITTED');
      expect(response.body.hasRca).toBe(true);
      expect(response.body.rca).toMatchObject({
        status: 'SUBMITTED',
        submittedBy: { id: developer.body.user.id },
      });
      rcaId = response.body.rca.id;
    });

    it('sends an analysis back with what has to be different, and takes it again', async () => {
      const sentBack = await api()
        .patch(`/api/v1/rca/${rcaId}/approve`)
        .set('Authorization', bearer(pm))
        .send({ decision: 'CHANGES_REQUESTED', note: 'Say which lock, and name the release.' })
        .expect(200);
      expect(sentBack.body.rca.status).toBe('CHANGES_REQUESTED');
      // The problem goes back with it: an analysis somebody sent back is not an analysis.
      expect(sentBack.body.status).toBe('RCA_REQUESTED');
      expect(sentBack.body.closure.blockers).toContain(
        'The root-cause analysis has not been submitted yet.',
      );

      await api()
        .patch(`/api/v1/rca/${rcaId}/approve`)
        .set('Authorization', bearer(pm))
        .send({ decision: 'CHANGES_REQUESTED' })
        .expect(409);

      const again = await api()
        .post(`/api/v1/problems/${problemId}/rca`)
        .set('Authorization', bearer(developer))
        .send({
          what: 'Printing timed out for three clients on 3.1.4.',
          why: 'The spooler waits on the table lock the nightly job takes.',
          affectedClientsVersions: 'Three clients, all on 3.1.4.',
          introducedBy: 'Release 3.1.3, the nightly reconciliation job.',
          permanentFix: 'Take the lock for the row rather than the table.',
          prevention: 'A load test that prints while the batch runs.',
          testsAdded: 'print-under-batch-load.spec.ts',
        })
        .expect(201);
      expect(again.body.rca.status).toBe('SUBMITTED');
      expect(again.body.status).toBe('RCA_SUBMITTED');
    });

    it('approves the analysis', async () => {
      const response = await api()
        .patch(`/api/v1/rca/${rcaId}/approve`)
        .set('Authorization', bearer(pm))
        .send({ decision: 'APPROVED' })
        .expect(200);
      expect(response.body.rca).toMatchObject({
        status: 'APPROVED',
        approvedBy: { id: pm.body.user.id },
      });
    });

    it('refuses to close on an unverified fix, and says which of the two is missing', async () => {
      const assigned = await act(problemId, 'assign-fix', { taskId: fixTaskId }).expect(201);
      expect(assigned.body.status).toBe('FIX_ASSIGNED');
      expect(assigned.body.fixTask).toMatchObject({ id: fixTaskId });
      expect(assigned.body.closure).toMatchObject({
        allowed: false,
        blockers: ['The permanent fix has not been verified live.'],
      });
      await act(problemId, 'close').expect(409);
    });

    it('reports a missing preventive test without blocking on it', async () => {
      const detail = await problem(problemId).expect(200);
      expect(detail.body.closure.warnings).toEqual(['No preventive test has been added.']);

      // The approved matrix gives QA exactly this one write on a problem, and gives a developer
      // none: the permission is checked in the service, not only on the route.
      await act(
        problemId,
        'preventive-test',
        { preventiveTest: 'Print while the batch runs.' },
        developer,
      ).expect(403);

      const recorded = await act(
        problemId,
        'preventive-test',
        { preventiveTest: 'Print while the batch runs.', taskId: fixTaskId },
        tester,
      ).expect(201);
      expect(recorded.body.closure.warnings).toEqual([]);
    });

    it('closes once the fix has actually been completed', async () => {
      await prisma.task.update({ where: { id: fixTaskId }, data: { status: 'COMPLETED' } });
      const ready = await problem(problemId).expect(200);
      expect(ready.body.closure).toMatchObject({ allowed: true, blockers: [] });

      const closed = await act(problemId, 'close', { note: 'Out in 3.1.5.' }).expect(201);
      expect(closed.body.status).toBe('CLOSED');
      await act(problemId, 'close').expect(409);
      // The fix was recorded as released on the way out rather than skipping that status.
      const audits = await prisma.auditLog.findMany({
        where: { entityId: problemId, action: 'problem.closed' },
        select: { action: true },
      });
      expect(audits).toHaveLength(1);
    });

    it('takes a question to the developer and the answer back', async () => {
      const asked = await act(problemId, 'ask-developer', {
        body: 'Did the batch job change in 3.1.3 or 3.1.4?',
      }).expect(201);
      expect(asked.body.questions).toHaveLength(1);
      const questionId = asked.body.questions[0].id;

      const answered = await act(
        problemId,
        'ask-developer',
        { questionId, answer: '3.1.3.' },
        developer,
      ).expect(201);
      expect(answered.body.questions[0]).toMatchObject({
        answer: '3.1.3.',
        answeredBy: { id: developer.body.user.id },
      });
      await act(problemId, 'ask-developer', {}).expect(400);
    });

    it('keeps a dismissal, so nobody is asked about the same pair twice', async () => {
      const unrelated = (
        await raise(zenithId, {
          title: 'Invoice printing ERR_PRN_TIMEOUT on the archive screen',
        })
      ).body.id;
      await decide(unrelated, acmeTicket, { decision: 'DISMISSED' }).expect(201);
      const response = await similar(unrelated).expect(200);
      expect(
        response.body.suggestions.find((row: { ticketId: string }) => row.ticketId === acmeTicket)
          .decision,
      ).toBe('DISMISSED');
    });

    it('groups the recurring report by module, counting clients rather than tickets', async () => {
      const response = await api()
        .get('/api/v1/reports/recurring')
        .query({ by: 'module', windowDays: 30, projectId })
        .set('Authorization', bearer(support))
        .expect(200);
      expect(response.body).toMatchObject({ groupBy: 'module', windowDays: 30, threshold: 3 });
      const billing = response.body.rows.find((row: { label: string }) => row.label === 'Billing');
      expect(billing.clientCount).toBe(3);
      expect(billing.ticketCount).toBeGreaterThanOrEqual(3);
      expect(billing.overThreshold).toBe(true);
    });

    it('groups by version and by severity as well', async () => {
      for (const by of ['version', 'severity', 'product']) {
        const response = await api()
          .get('/api/v1/reports/recurring')
          .query({ by, projectId })
          .set('Authorization', bearer(support))
          .expect(200);
        expect(response.body.groupBy).toBe(by);
        expect(response.body.rows.length).toBeGreaterThan(0);
      }
    });

    /**
     * The window is the question, not a decoration on one column.
     *
     * A ticket outside it must not be counted anywhere on the report — not in `ticketCount`, and
     * above all not in `clientCount`, because that is what puts the red "over threshold" badge on
     * a row. Three clients who each hit the same module in a different year are not a recurring
     * issue this week, and a report headed "last 7 days" that said they were would be answering a
     * question nobody asked.
     */
    it('leaves a ticket outside the window out of every count', async () => {
      const module = `Window probe ${stamp}`;
      const probe = (await raise(acmeId, { module })).body.id;
      const rowFor = async (windowDays: number) => {
        const response = await api()
          .get('/api/v1/reports/recurring')
          .query({ by: 'module', windowDays, projectId })
          .set('Authorization', bearer(support))
          .expect(200);
        return response.body.rows.find((row: { label: string }) => row.label === module);
      };

      expect((await rowFor(30)).ticketCount).toBe(1);
      await prisma.ticket.update({
        where: { id: probe },
        data: { createdAt: new Date(Date.now() - 40 * DAY_MS) },
      });
      expect(await rowFor(30)).toBeUndefined();
      // Still there when the window is wide enough to reach it: the ticket did not go away.
      expect((await rowFor(90)).ticketCount).toBe(1);
    });

    /**
     * A cap, because `productVersion` is free text.
     *
     * A client types it, or a machine integration posts one, and an integration that sends a build
     * hash per ticket makes one group per ticket. The screen is read top-down and nobody scrolls
     * past the worst few, so the cap costs a reader nothing — what it buys is a response, and the
     * per-row work behind it, that a client cannot make unbounded.
     */
    it('caps the rows it returns, however many groups a client invents', async () => {
      await prisma.ticket.createMany({
        data: Array.from({ length: MAX_RECURRING_ROWS + 25 }, (_, index) => ({
          organizationId: providerOrgId,
          clientOrganizationId: acmeId,
          projectId,
          number: (nextTicketNumber += 1),
          title: `Build ${index} reported a fault`,
          description: 'Raised by a machine integration.',
          requesterId: support.body.user.id,
          module: `Machine integration ${stamp}`,
          productVersion: `9.9.9-build.${stamp}.${index}`,
        })),
      });
      const response = await api()
        .get('/api/v1/reports/recurring')
        .query({ by: 'version', windowDays: 90, projectId })
        .set('Authorization', bearer(support))
        .expect(200);
      expect(response.body.rows).toHaveLength(MAX_RECURRING_ROWS);
    });
  });

  /**
   * Two support executives confirming a duplicate on the same ticket, at the same time.
   *
   * A shared support queue on a bad morning is exactly this: the same ticket open on two screens,
   * two different candidates, both confirmed within a second. Both reads see no problem on the
   * group, and without a lock both create one. The damage is not two tidy rows — the three clients
   * split across the two problems, so neither reaches the threshold and the alert the whole
   * package exists to send never goes out.
   */
  describe('two people confirming the same group at once', () => {
    it('makes one problem, not two', async () => {
      const module = `Race ${stamp}`;
      const report = (client: string) =>
        raise(client, {
          module,
          title: 'Statements will not export, ERR_EXP_TIMEOUT',
          description: 'The export stops half way through; the log shows ERR_EXP_TIMEOUT.',
        });
      const subject = (await report(acmeId)).body.id;
      const first = (await report(zenithId)).body.id;
      const second = (await report(orbitId)).body.id;

      const decisions = await Promise.all([
        decide(subject, first, { decision: 'LINKED' }),
        decide(subject, second, { decision: 'LINKED' }),
      ]);
      expect(decisions.map((response) => response.status)).toEqual([201, 201]);

      const problems = await prisma.problem.findMany({
        where: { projectId, module },
        select: { id: true },
      });
      expect(problems).toHaveLength(1);

      // And every ticket in the group points at that one, rather than at whichever create won.
      const tickets = await prisma.ticket.findMany({
        where: { id: { in: [subject, first, second] } },
        select: { problemId: true },
      });
      expect(new Set(tickets.map((ticket) => ticket.problemId))).toEqual(
        new Set([problems[0]?.id]),
      );
    });
  });

  describe('incidents', () => {
    let incidentId: string;

    it('opens an incident with a timeline that starts where it started', async () => {
      const response = await api()
        .post('/api/v1/incidents')
        .set('Authorization', bearer(pm))
        .send({
          title: 'Printing is down for everybody',
          description: 'No client can print an invoice.',
          severity: 'CRITICAL',
          impact: 'Every client on 3.1.4',
          projectId,
        })
        .expect(201);
      incidentId = response.body.id;
      expect(response.body).toMatchObject({
        key: expect.stringMatching(/^INC-\d+$/),
        status: 'OPEN',
        emergencyFixStatus: 'NONE',
      });
      expect(response.body.timeline).toHaveLength(1);
      expect(response.body.timeline[0]).toMatchObject({ kind: 'OPENED' });
    });

    it('refuses an incident that has not started yet', async () => {
      await api()
        .post('/api/v1/incidents')
        .set('Authorization', bearer(pm))
        .send({
          title: 'Tomorrow’s outage',
          description: 'Not yet.',
          severity: 'LOW',
          startedAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(400);
    });

    it('asks for an emergency fix once, and only once', async () => {
      const requested = await incidentAct(incidentId, 'request-emergency-fix', {
        reason: 'Every client is affected and the release is on Thursday.',
      }).expect(201);
      expect(requested.body.emergencyFixStatus).toBe('REQUESTED');
      expect(requested.body.timeline.map((row: { kind: string }) => row.kind)).toContain(
        'EMERGENCY_FIX_REQUESTED',
      );
      // A rejection is a decision; re-asking until somebody says yes is what the gate prevents.
      await incidentAct(incidentId, 'request-emergency-fix', { reason: 'Please.' }).expect(409);
    });

    it('needs both the permission and a reason to decide it', async () => {
      await incidentAct(
        incidentId,
        'approve-emergency-fix',
        { decision: 'APPROVED', reason: 'Go ahead.' },
        support,
      ).expect(403);
      await incidentAct(incidentId, 'approve-emergency-fix', { decision: 'APPROVED' }).expect(400);
      await incidentAct(incidentId, 'approve-emergency-fix', {
        decision: 'APPROVED',
        reason: '  ',
      }).expect(400);

      const decided = await incidentAct(incidentId, 'approve-emergency-fix', {
        decision: 'APPROVED',
        reason: 'Approved; QA smoke on production straight afterwards.',
      }).expect(201);
      expect(decided.body).toMatchObject({
        emergencyFixStatus: 'APPROVED',
        emergencyFixDecidedBy: { id: pm.body.user.id },
      });
      const audited = await prisma.auditLog.findMany({
        where: { entityId: incidentId, action: 'incident.emergency_fix_decided' },
      });
      expect(audited).toHaveLength(1);
      // And the decision cannot be taken back by a second one.
      await incidentAct(incidentId, 'approve-emergency-fix', {
        decision: 'REJECTED',
        reason: 'Changed my mind.',
      }).expect(409);
    });

    it('links what the incident touched and takes notes', async () => {
      const linked = await incidentAct(incidentId, 'links', {
        kind: 'TASK',
        taskId: fixTaskId,
      }).expect(201);
      expect(linked.body.links).toHaveLength(1);
      expect(linked.body.links[0].label).toMatch(/^P11/);
      await incidentAct(incidentId, 'links', { kind: 'TASK', releaseId: fixTaskId }).expect(400);

      const noted = await incidentAct(incidentId, 'notes', {
        body: 'Restarted the spooler; watching.',
      }).expect(201);
      expect(noted.body.timeline.map((row: { kind: string }) => row.kind)).toContain('NOTE');
    });

    it('never publishes the client summary by itself', async () => {
      const drafted = await api()
        .patch(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(pm))
        .send({ clientSummary: 'Printing was unavailable for about an hour.' })
        .expect(200);
      // Saved, and reaching nobody.
      expect(drafted.body.clientSummary).toBe('Printing was unavailable for about an hour.');
      expect(drafted.body.clientSummaryPublishedAt).toBeNull();

      const published = await incidentAct(incidentId, 'publish-client-summary').expect(201);
      expect(published.body.clientSummaryPublishedAt).not.toBeNull();
      expect(published.body.timeline.map((row: { kind: string }) => row.kind)).toContain(
        'CLIENT_SUMMARY_PUBLISHED',
      );
      const audited = await prisma.auditLog.findMany({
        where: { entityId: incidentId, action: 'incident.client_summary_published' },
      });
      expect(audited).toHaveLength(1);
    });

    it('moves through the working statuses and refuses the ones that carry a reason', async () => {
      const investigating = await api()
        .patch(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(pm))
        .send({ status: 'INVESTIGATING', severity: 'HIGH' })
        .expect(200);
      expect(investigating.body.status).toBe('INVESTIGATING');
      expect(investigating.body.timeline.map((row: { kind: string }) => row.kind)).toEqual(
        expect.arrayContaining(['STATUS_CHANGED', 'SEVERITY_CHANGED']),
      );
      await api()
        .patch(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(pm))
        .send({ status: 'RESOLVED' })
        .expect(400);
      await api()
        .patch(`/api/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(pm))
        .send({ status: 'CLOSED' })
        .expect(409);
    });

    it('resolves, then closes, and closes only once', async () => {
      const resolved = await incidentAct(incidentId, 'resolve', {
        resolution: 'Row-level lock shipped as a hotfix.',
      }).expect(201);
      expect(resolved.body.status).toBe('RESOLVED');
      expect(resolved.body.resolvedAt).not.toBeNull();
      expect(resolved.body.durationMinutes).toBeGreaterThanOrEqual(0);

      const closed = await incidentAct(incidentId, 'close', { note: 'RCA filed.' }).expect(201);
      expect(closed.body.status).toBe('CLOSED');
      await incidentAct(incidentId, 'close').expect(409);
    });
  });

  describe('permissions', () => {
    let readableProblem: string;
    let readableIncident: string;

    beforeAll(async () => {
      const created = await api()
        .post('/api/v1/problems')
        .set('Authorization', bearer(support))
        .send({ title: 'Permission fixture problem', projectId })
        .expect(201);
      readableProblem = created.body.id;
      const incident = await api()
        .post('/api/v1/incidents')
        .set('Authorization', bearer(pm))
        .send({
          title: 'Permission fixture',
          description: 'A fixture incident.',
          severity: 'LOW',
          projectId,
        })
        .expect(201);
      readableIncident = incident.body.id;
    });

    it('lets a developer read problems but not open or close one', async () => {
      await api().get('/api/v1/problems').set('Authorization', bearer(developer)).expect(200);
      await api()
        .post('/api/v1/problems')
        .set('Authorization', bearer(developer))
        .send({ title: 'Should not exist', projectId })
        .expect(403);
      await act(readableProblem, 'close', {}, developer).expect(403);
    });

    it('lets a tester record a preventive test and nothing else on a problem', async () => {
      await act(
        readableProblem,
        'preventive-test',
        { preventiveTest: 'A regression test.' },
        tester,
      ).expect(201);
      await act(readableProblem, 'request-rca', {}, tester).expect(403);
    });

    it('does not let a support executive submit an analysis or approve an emergency fix', async () => {
      await api()
        .post(`/api/v1/problems/${readableProblem}/rca`)
        .set('Authorization', bearer(support))
        .send({
          what: 'x',
          why: 'y',
          affectedClientsVersions: 'z',
          introducedBy: 'a',
          permanentFix: 'b',
          prevention: 'c',
        })
        .expect(403);
      await incidentAct(
        readableIncident,
        'approve-emergency-fix',
        { decision: 'APPROVED', reason: 'no' },
        support,
      ).expect(403);
    });

    it('shows an internal employee none of it', async () => {
      await api().get('/api/v1/problems').set('Authorization', bearer(employee)).expect(403);
      await api().get('/api/v1/incidents').set('Authorization', bearer(employee)).expect(403);
      await api()
        .get('/api/v1/reports/recurring')
        .set('Authorization', bearer(employee))
        .expect(403);
    });

    /**
     * Every route in the package, refused to a client user.
     *
     * A problem names the other clients who reported the same fault, so this is the boundary the
     * whole package rests on. It is written as a table so a route added later without a thought
     * for it fails here rather than shipping.
     */
    it('refuses a client user on every route', async () => {
      const routes: Array<[string, string]> = [
        ['get', '/api/v1/problems'],
        ['post', '/api/v1/problems'],
        ['get', `/api/v1/problems/${readableProblem}`],
        ['patch', `/api/v1/problems/${readableProblem}`],
        ['post', `/api/v1/problems/${readableProblem}/tickets`],
        ['post', `/api/v1/problems/${readableProblem}/request-rca`],
        ['post', `/api/v1/problems/${readableProblem}/rca`],
        ['post', `/api/v1/problems/${readableProblem}/ask-developer`],
        ['post', `/api/v1/problems/${readableProblem}/assign-fix`],
        ['post', `/api/v1/problems/${readableProblem}/preventive-test`],
        ['post', `/api/v1/problems/${readableProblem}/close`],
        ['patch', `/api/v1/rca/${readableProblem}/approve`],
        ['get', '/api/v1/incidents'],
        ['post', '/api/v1/incidents'],
        ['get', `/api/v1/incidents/${readableIncident}`],
        ['patch', `/api/v1/incidents/${readableIncident}`],
        ['post', `/api/v1/incidents/${readableIncident}/request-emergency-fix`],
        ['post', `/api/v1/incidents/${readableIncident}/approve-emergency-fix`],
        ['post', `/api/v1/incidents/${readableIncident}/resolve`],
        ['post', `/api/v1/incidents/${readableIncident}/close`],
        ['post', `/api/v1/incidents/${readableIncident}/links`],
        ['post', `/api/v1/incidents/${readableIncident}/notes`],
        ['post', `/api/v1/incidents/${readableIncident}/publish-client-summary`],
        ['get', '/api/v1/reports/recurring'],
      ];
      for (const [method, path] of routes) {
        for (const session of [clientAdmin, zenithAdmin]) {
          const response = await api()
            [method as 'get'](path)
            .set('Authorization', bearer(session))
            .send({});
          expect({ method, path, status: response.status }).toEqual({
            method,
            path,
            status: 403,
          });
        }
      }
    });

    it('refuses a client user the suggestions on their own ticket', async () => {
      const own = await prisma.ticket.findFirstOrThrow({
        where: { clientOrganizationId: acmeId, deletedAt: null },
        select: { id: true },
      });
      await api()
        .get(`/api/v1/tickets/${own.id}/similar`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .post(`/api/v1/tickets/${own.id}/similar/${own.id}/decide`)
        .set('Authorization', bearer(clientAdmin))
        .send({ decision: 'DISMISSED' })
        .expect(403);
    });
  });

  describe('another provider’s rows', () => {
    let foreignProblemId: string;
    let foreignIncidentId: string;
    let foreignTicketId: string;

    beforeAll(async () => {
      const foreignProject = await prisma.project.create({
        data: {
          organizationId: foreignOrgId,
          code: `FX${stamp}`,
          name: 'Another provider',
          description: 'Created by package-11.e2e-spec.ts',
          type: 'INTERNAL_WORK',
          status: 'ACTIVE',
          createdById: director.body.user.id,
        },
        select: { id: true },
      });
      const foreignProblem = await prisma.problem.create({
        data: {
          organizationId: foreignOrgId,
          number: 9_001,
          title: 'Another provider’s problem',
          projectId: foreignProject.id,
          createdById: director.body.user.id,
        },
        select: { id: true },
      });
      foreignProblemId = foreignProblem.id;
      const foreignIncident = await prisma.incident.create({
        data: {
          organizationId: foreignOrgId,
          number: 9_001,
          title: 'Another provider’s incident',
          description: 'Not ours.',
          projectId: foreignProject.id,
          startedAt: new Date(),
          detectedAt: new Date(),
          createdById: director.body.user.id,
        },
        select: { id: true },
      });
      foreignIncidentId = foreignIncident.id;
      const foreignTicket = await prisma.ticket.create({
        data: {
          organizationId: foreignOrgId,
          clientOrganizationId: foreignOrgId,
          number: 9_001,
          title: 'Another provider’s ticket',
          description: 'Not ours.',
          requesterId: director.body.user.id,
          projectId: foreignProject.id,
        },
        select: { id: true },
      });
      foreignTicketId = foreignTicket.id;
    });

    afterAll(async () => {
      await prisma.incident.deleteMany({ where: { id: foreignIncidentId } });
      await prisma.problem.deleteMany({ where: { id: foreignProblemId } });
      await prisma.ticket.deleteMany({ where: { id: foreignTicketId } });
      await prisma.project.deleteMany({
        where: { organizationId: foreignOrgId, code: `FX${stamp}` },
      });
    });

    it('reports them as missing rather than as forbidden, so ids cannot be probed', async () => {
      // Each route gets a body it would accept, so a 400 can never stand in for the 404 that is
      // the property under test.
      const notFound: Array<[string, string, Record<string, unknown>]> = [
        ['get', `/api/v1/problems/${foreignProblemId}`, {}],
        ['patch', `/api/v1/problems/${foreignProblemId}`, { title: 'Renamed by a stranger' }],
        ['post', `/api/v1/problems/${foreignProblemId}/request-rca`, {}],
        ['post', `/api/v1/problems/${foreignProblemId}/close`, {}],
        ['post', `/api/v1/problems/${foreignProblemId}/tickets`, { ticketIds: [foreignTicketId] }],
        ['get', `/api/v1/incidents/${foreignIncidentId}`, {}],
        ['patch', `/api/v1/incidents/${foreignIncidentId}`, { impact: 'Ours now' }],
        ['post', `/api/v1/incidents/${foreignIncidentId}/resolve`, { resolution: 'Not ours.' }],
        ['post', `/api/v1/incidents/${foreignIncidentId}/notes`, { body: 'Not ours.' }],
        ['get', `/api/v1/tickets/${foreignTicketId}/similar`, {}],
      ];
      for (const [method, path, body] of notFound) {
        const response = await api()
          [method as 'get'](path)
          .set('Authorization', bearer(support))
          .send(body);
        expect({ method, path, status: response.status }).toEqual({
          method,
          path,
          status: 404,
        });
      }
    });

    it('keeps another provider’s rows out of the lists and the report', async () => {
      const problems = await api()
        .get('/api/v1/problems')
        .set('Authorization', bearer(support))
        .expect(200);
      expect(problems.body.items.some((row: { id: string }) => row.id === foreignProblemId)).toBe(
        false,
      );
      const incidents = await api()
        .get('/api/v1/incidents')
        .set('Authorization', bearer(support))
        .expect(200);
      expect(incidents.body.items.some((row: { id: string }) => row.id === foreignIncidentId)).toBe(
        false,
      );
    });

    it('will not link another provider’s ticket into one of ours', async () => {
      const ours = await api()
        .post('/api/v1/problems')
        .set('Authorization', bearer(support))
        .send({ title: 'Cross-tenant link attempt', projectId })
        .expect(201);
      await act(ours.body.id, 'tickets', { ticketIds: [foreignTicketId] }).expect(404);
    });

    it('will not file one of our tickets into another provider’s problem', async () => {
      // The mirror image, and the one that is easy to get wrong: the ticket is ours, the problem
      // is theirs, and the id arrived in the request body. Without resolving it inside the tenant
      // first, their problem screen would list our client's ticket.
      const [first, second] = await Promise.all([
        raise(acmeId, { title: 'Invoice printing ERR_PRN_TIMEOUT, cross-tenant probe' }),
        raise(zenithId, { title: 'Invoice printing ERR_PRN_TIMEOUT, cross-tenant probe' }),
      ]);
      await decide(first.body.id, second.body.id, {
        decision: 'LINKED',
        problemId: foreignProblemId,
      }).expect(404);
      const stolen = await prisma.problemTicket.count({ where: { problemId: foreignProblemId } });
      expect(stolen).toBe(0);
    });
  });
});
