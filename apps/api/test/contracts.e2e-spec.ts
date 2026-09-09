import type { INestApplication } from '@nestjs/common';
import { REAUTH_HEADER } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import {
  DEMO,
  SEED_PASSWORD,
  bearer,
  createTestApp,
  loginAs,
  type Session,
} from './helpers/test-app';

/**
 * Contracts, milestones and the support-hour ledger: create → activate → hours → approved work
 * consumes hours exactly once → manual adjustment with reason and re-auth → carry-forward on
 * period close → client sees remaining hours but never internal notes or costs → other clients
 * see nothing.
 */
describe('Contracts, milestones and support hours (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let acmeId = '';
  let projectId = '';
  let contractId = '';
  let milestoneId = '';
  let taskId = '';
  const api = () => request(app.getHttpServer());
  const stamp = Date.now();

  const reauth = async (session: Session) =>
    (
      await api()
        .post('/api/v1/auth/reauth')
        .set('Authorization', bearer(session))
        .send({ password: SEED_PASSWORD })
        .expect(200)
    ).body.reauthToken as string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, pm, lead, developer, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    acmeId = clientAdmin.body.user.organization.id;
    // A project of its own: the demo seed already puts an hour contract on ACM, and hour
    // consumption must be asserted against the contract this suite creates.
    const project = await api()
      .post('/api/v1/projects')
      .set('Authorization', bearer(pm))
      .send({
        code: `C${Date.now().toString().slice(-6)}`,
        name: `Contracts e2e ${stamp}`,
        type: 'AMC',
        clientOrganizationId: acmeId,
        leadUserId: lead.body.user.id,
      })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a PM creates a support-hours contract with included hours and payment milestones', async () => {
    const created = await api()
      .post('/api/v1/contracts')
      .set('Authorization', bearer(pm))
      .send({
        clientOrganizationId: acmeId,
        projectId,
        type: 'SUPPORT_HOURS',
        title: `E2E support pack ${stamp}`,
        scope: 'Bug fixes and small changes on the POS',
        status: 'ACTIVE',
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        currency: 'INR',
        contractValue: '240000.00',
        includedMinutesPerPeriod: 600,
        billingPeriod: 'MONTHLY',
        carryForwardRule: 'CAPPED',
        carryForwardCapMinutes: 120,
        lowHoursThresholdMinutes: 60,
        internalNotes: 'Margin is thin on this one',
        clientNotes: 'Hours reset on the 1st of every month.',
      })
      .expect(201);
    contractId = created.body.id;
    expect(created.body.number).toMatch(/^CT-2026-\d{4}$/);
    expect(created.body.tracksHours).toBe(true);
    expect(created.body.hours.includedMinutes).toBe(600);
    expect(created.body.hours.remainingMinutes).toBe(600);
    expect(created.body.internalNotes).toBe('Margin is thin on this one');
    // PM has contract:read but not cost:read: value visible, cost hidden.
    expect(created.body.contractValue).toBe('240000.00');
    expect(created.body.internalCost).toBeNull();

    const payment = await api()
      .post(`/api/v1/contracts/${contractId}/payment-milestones`)
      .set('Authorization', bearer(pm))
      .send({ title: 'Advance', amount: '120000.00', dueDate: '2026-01-15' })
      .expect(201);
    expect(payment.body.status).toBe('PENDING');
    const paid = await api()
      .patch(`/api/v1/contracts/${contractId}/payment-milestones/${payment.body.id}`)
      .set('Authorization', bearer(pm))
      .send({ status: 'PAID', invoiceReference: 'INV-1' })
      .expect(200);
    expect(paid.body.paidAt).not.toBeNull();
  });

  it('only cost readers may set the internal cost; a developer cannot create contracts', async () => {
    await api()
      .patch(`/api/v1/contracts/${contractId}`)
      .set('Authorization', bearer(pm))
      .send({ internalCost: '100000.00' })
      .expect(403);
    const updated = await api()
      .patch(`/api/v1/contracts/${contractId}`)
      .set('Authorization', bearer(director))
      .send({ internalCost: '100000.00' })
      .expect(200);
    expect(updated.body.internalCost).toBe('100000.00');
    await api()
      .post('/api/v1/contracts')
      .set('Authorization', bearer(developer))
      .send({ clientOrganizationId: acmeId, type: 'AMC', title: 'x', startDate: '2026-01-01' })
      .expect(403);
  });

  it('lists, filters and paginates contracts', async () => {
    const page = await api()
      .get('/api/v1/contracts?view=active&limit=1')
      .set('Authorization', bearer(director))
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBeGreaterThanOrEqual(1);
    const search = await api()
      .get(`/api/v1/contracts?view=all&search=${encodeURIComponent(`E2E support pack ${stamp}`)}`)
      .set('Authorization', bearer(director))
      .expect(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).toContain(contractId);
  });

  /**
   * Listing contracts used to open a billing period per row — a lock and two inserts inside an
   * interactive transaction, from a GET. A page of a hundred therefore also asked for a hundred
   * concurrent transactions against a pool of eleven and returned 500 when it lost that race.
   */
  it('listing contracts opens no billing period and writes no ledger row', async () => {
    // A contract whose period has never been opened: created here, listed immediately.
    const fresh = await api()
      .post('/api/v1/contracts')
      .set('Authorization', bearer(pm))
      .send({
        clientOrganizationId: acmeId,
        projectId,
        type: 'SUPPORT_HOURS',
        title: `E2E read-only balance ${stamp}`,
        status: 'ACTIVE',
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        includedMinutesPerPeriod: 900,
        billingPeriod: 'MONTHLY',
      })
      .expect(201);
    await prisma.contractHourLedger.deleteMany({ where: { contractId: fresh.body.id } });
    await prisma.contractPeriod.deleteMany({ where: { contractId: fresh.body.id } });

    const periodsBefore = await prisma.contractPeriod.count();
    const ledgerBefore = await prisma.contractHourLedger.count();

    const listed = await api()
      .get('/api/v1/contracts?view=all&limit=100')
      .set('Authorization', bearer(director))
      .expect(200);
    await api()
      .get('/api/v1/portal/contracts')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);

    expect(await prisma.contractPeriod.count()).toBe(periodsBefore);
    expect(await prisma.contractHourLedger.count()).toBe(ledgerBefore);
    // The balance is still the one opening the period would have produced.
    const row = listed.body.items.find((item: { id: string }) => item.id === fresh.body.id);
    expect(row.hours.includedMinutes).toBe(900);
    expect(row.hours.remainingMinutes).toBe(900);
  });

  /**
   * The failure this replaces was a race, not a slow query: enough concurrent pages of a hundred
   * and Prisma gave up waiting for a connection. Four at once is well inside the pool now that a
   * page costs two read queries, and would not have been when it cost a hundred transactions.
   */
  it('serves several full pages of contracts at once', async () => {
    const pages = await Promise.all(
      [0, 1, 2, 3].map(() =>
        api().get('/api/v1/contracts?view=all&limit=100').set('Authorization', bearer(director)),
      ),
    );
    for (const page of pages) {
      expect(page.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(100);
      for (const item of page.body.items) {
        expect(item.tracksHours ? item.hours.periodStart : 'n/a').not.toBeUndefined();
      }
    }
  });

  it('a milestone with deliverables tracks progress from linked tasks', async () => {
    const milestone = await api()
      .post('/api/v1/milestones')
      .set('Authorization', bearer(pm))
      .send({
        projectId,
        contractId,
        name: `E2E milestone ${stamp}`,
        dueDate: '2026-12-31',
        clientVisible: true,
        requiresApproval: true,
        deliverables: [{ title: 'Spec signed off' }, { title: 'Release notes' }],
      })
      .expect(201);
    milestoneId = milestone.body.id;
    expect(milestone.body.progressPercent).toBe(0);
    expect(milestone.body.deliverableCount).toBe(2);

    const task = await api()
      .post('/api/v1/tasks')
      .set('Authorization', bearer(lead))
      .send({
        title: `E2E hours task ${stamp}`,
        projectId,
        assignedToId: developer.body.user.id,
        reviewerId: lead.body.user.id,
        milestoneId,
        clientVisible: true,
      })
      .expect(201);
    taskId = task.body.id;
    expect(task.body.milestone.id).toBe(milestoneId);

    const other = await api()
      .post('/api/v1/tasks')
      .set('Authorization', bearer(lead))
      .send({
        title: `E2E second task ${stamp}`,
        projectId,
        assignedToId: developer.body.user.id,
        milestoneId,
      })
      .expect(201);
    expect(other.body.milestone.id).toBe(milestoneId);

    const started = await api()
      .get(`/api/v1/milestones/${milestoneId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(started.body.linkedTaskCount).toBe(2);
    expect(started.body.progressPercent).toBe(0);
  });

  it('approved work consumes contract hours exactly once', async () => {
    await api()
      .post(`/api/v1/tasks/${taskId}/start`)
      .set('Authorization', bearer(developer))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/tasks/${taskId}/work-logs`)
      .set('Authorization', bearer(developer))
      .send({ workDate: '2026-09-05', minutes: 90, summary: 'Investigated' })
      .expect(201);
    await api()
      .post(`/api/v1/tasks/${taskId}/submit`)
      .set('Authorization', bearer(developer))
      .send({
        summary: 'Fixed',
        minutes: 60,
        workDate: '2026-09-05',
        clientVisible: true,
        clientSummary: 'Fixed the thing',
      })
      .expect(201);
    const before = await api()
      .get(`/api/v1/contracts/${contractId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(before.body.hours.consumedMinutes).toBe(0);

    await api()
      .post(`/api/v1/tasks/${taskId}/review`)
      .set('Authorization', bearer(lead))
      .send({ outcome: 'APPROVE', note: 'Good' })
      .expect(201);
    const after = await api()
      .get(`/api/v1/contracts/${contractId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(after.body.hours.consumedMinutes).toBe(150);
    expect(after.body.hours.remainingMinutes).toBe(450);
    expect(
      after.body.recentLedger.filter((entry: { kind: string }) => entry.kind === 'CONSUMED'),
    ).toHaveLength(2);

    // Reopen + re-approve must not deduct the same work logs again.
    await api()
      .post(`/api/v1/tasks/${taskId}/reopen`)
      .set('Authorization', bearer(lead))
      .send({ reason: 'Regression' })
      .expect(201);
    await api()
      .post(`/api/v1/tasks/${taskId}/start`)
      .set('Authorization', bearer(developer))
      .send({})
      .expect(201);
    await api()
      .post(`/api/v1/tasks/${taskId}/submit`)
      .set('Authorization', bearer(developer))
      .send({ summary: 'Fixed again', minutes: 30, workDate: '2026-09-05', clientVisible: false })
      .expect(201);
    await api()
      .post(`/api/v1/tasks/${taskId}/review`)
      .set('Authorization', bearer(lead))
      .send({ outcome: 'APPROVE' })
      .expect(201);
    const again = await api()
      .get(`/api/v1/contracts/${contractId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(again.body.hours.consumedMinutes).toBe(180);

    const milestone = await api()
      .get(`/api/v1/milestones/${milestoneId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    expect(milestone.body.linkedTasksCompleted).toBe(1);
    expect(milestone.body.progressPercent).toBe(50);
  });

  it('the database refuses a duplicate deduction even when the service is bypassed', async () => {
    const log = await prisma.workLog.findFirstOrThrow({ where: { taskId } });
    const existing = await prisma.contractHourLedger.findFirstOrThrow({
      where: { workLogId: log.id, kind: 'CONSUMED' },
    });
    await expect(
      prisma.contractHourLedger.create({
        data: {
          organizationId: existing.organizationId,
          contractId: existing.contractId,
          kind: 'CONSUMED',
          minutes: -1,
          balanceAfterMinutes: 0,
          periodStart: existing.periodStart,
          workLogId: log.id,
        },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it('manual adjustments need a reason and re-authentication, and are idempotent', async () => {
    await api()
      .post(`/api/v1/contracts/${contractId}/hours`)
      .set('Authorization', bearer(pm))
      .send({ kind: 'PURCHASED', minutes: 120, reason: 'Bought a top-up' })
      .expect(403);
    const token = await reauth(pm);
    await api()
      .post(`/api/v1/contracts/${contractId}/hours`)
      .set('Authorization', bearer(pm))
      .set(REAUTH_HEADER, token)
      .send({ kind: 'PURCHASED', minutes: 120, reason: '' })
      .expect(400);
    const first = await api()
      .post(`/api/v1/contracts/${contractId}/hours`)
      .set('Authorization', bearer(pm))
      .set(REAUTH_HEADER, token)
      .send({
        kind: 'PURCHASED',
        minutes: 120,
        reason: 'Bought a top-up',
        idempotencyKey: `topup-${stamp}`,
      })
      .expect(201);
    expect(first.body.purchasedMinutes).toBe(120);
    const retry = await api()
      .post(`/api/v1/contracts/${contractId}/hours`)
      .set('Authorization', bearer(pm))
      .set(REAUTH_HEADER, token)
      .send({
        kind: 'PURCHASED',
        minutes: 120,
        reason: 'Bought a top-up',
        idempotencyKey: `topup-${stamp}`,
      })
      .expect(201);
    expect(retry.body.purchasedMinutes).toBe(120);
    expect(retry.body.remainingMinutes).toBe(540);
    // A developer holds no adjust-hours permission.
    await api()
      .post(`/api/v1/contracts/${contractId}/hours`)
      .set('Authorization', bearer(developer))
      .send({ kind: 'ADJUSTMENT', minutes: -10, reason: 'nope' })
      .expect(403);
  });

  it('managers override milestone progress only with a reason, and it is audited', async () => {
    await api()
      .post(`/api/v1/milestones/${milestoneId}/progress`)
      .set('Authorization', bearer(developer))
      .send({ progressPercent: 90, reason: 'because' })
      .expect(403);
    const adjusted = await api()
      .post(`/api/v1/milestones/${milestoneId}/progress`)
      .set('Authorization', bearer(pm))
      .send({ progressPercent: 90, reason: 'Testing nearly finished offline' })
      .expect(201);
    expect(adjusted.body.progressPercent).toBe(90);
    expect(adjusted.body.progressMode).toBe('MANUAL');
    expect(adjusted.body.history.some((entry: { kind: string }) => entry.kind === 'PROGRESS')).toBe(
      true,
    );
    const audit = await api()
      .get('/api/v1/audit-logs?entityType=milestone')
      .set('Authorization', bearer(director))
      .expect(200);
    expect(audit.body.items.map((entry: { action: string }) => entry.action)).toContain(
      'milestone.progress_adjusted',
    );
  });

  it('closing a billing period carries hours forward up to the cap', async () => {
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    // Simulate the daily job running in the next billing period.
    const { HourLedgerService } = await import('../src/modules/contracts/hour-ledger.service');
    const ledger = app.get(HourLedgerService);
    const next = new Date('2026-10-05T00:00:00.000Z');
    const balance = await ledger.ensureCurrentBalance(contract, next);
    expect(balance?.includedMinutes).toBe(600);
    expect(balance?.carriedForwardMinutes).toBe(120); // 540 remaining, cap 120
    expect(balance?.remainingMinutes).toBe(720);
    const periods = await prisma.contractPeriod.findMany({
      where: { contractId },
      orderBy: { periodStart: 'asc' },
    });
    expect(periods.length).toBeGreaterThanOrEqual(2);
    expect(periods[0]?.closedAt).not.toBeNull();
    const expired = await prisma.contractHourLedger.findFirst({
      where: { contractId, kind: 'EXPIRED' },
    });
    expect(expired?.minutes).toBe(-420);
  });

  it('the client sees remaining hours, scope and client notes, never internal notes or money', async () => {
    const list = await api()
      .get('/api/v1/portal/contracts')
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    const mine = list.body.find((item: { id: string }) => item.id === contractId);
    expect(mine).toBeDefined();
    expect(mine.hours.remainingMinutes).toBeGreaterThan(0);
    const detail = await api()
      .get(`/api/v1/portal/contracts/${contractId}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(detail.body.clientNotes).toContain('Hours reset');
    const serialized = JSON.stringify(detail.body);
    expect(serialized).not.toContain('Margin is thin');
    expect(serialized).not.toContain('240000');
    expect(serialized).not.toContain('100000');
    expect(serialized).not.toContain('internalNotes');
    expect(serialized).not.toContain('internalCost');
    expect(detail.body.milestones.map((item: { id: string }) => item.id)).toContain(milestoneId);
    const milestones = await api()
      .get(`/api/v1/portal/milestones?projectId=${projectId}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    expect(milestones.body.map((item: { id: string }) => item.id)).toContain(milestoneId);
    expect(JSON.stringify(milestones.body)).not.toContain('"owner"');
  });

  it('another client and internal routes are closed to clients', async () => {
    await api()
      .get(`/api/v1/portal/contracts/${contractId}`)
      .set('Authorization', bearer(zenithAdmin))
      .expect(404);
    const zenithList = await api()
      .get('/api/v1/portal/contracts')
      .set('Authorization', bearer(zenithAdmin))
      .expect(200);
    expect(zenithList.body.map((item: { id: string }) => item.id)).not.toContain(contractId);
    await api()
      .get(`/api/v1/contracts/${contractId}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(403);
    await api().get('/api/v1/milestones').set('Authorization', bearer(clientAdmin)).expect(403);
  });

  it('archives the contract; archived contracts are read-only', async () => {
    const archived = await api()
      .post(`/api/v1/contracts/${contractId}/archive`)
      .set('Authorization', bearer(pm))
      .expect(201);
    expect(archived.body.status).toBe('ARCHIVED');
    await api()
      .patch(`/api/v1/contracts/${contractId}`)
      .set('Authorization', bearer(pm))
      .send({ title: 'x' })
      .expect(400);
  });
});
