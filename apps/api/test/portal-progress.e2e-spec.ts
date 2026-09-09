import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * The client-facing progress board, end to end.
 *
 * Three things are worth proving against a real database rather than a mock. That the board
 * answers "what happened on my project today" from records that already exist. That a client
 * reaches their own project and nothing else — the scope is in the query, so a second client
 * asking for the first one's project gets the same answer as for an id that does not exist. And,
 * the one that would be a breach rather than a bug, that no internal column reaches the wire:
 * the assertions below run against the raw response text, not the parsed object, because a
 * nested field is easy to forget to look at and a substring is not.
 */
describe('Client portal — project progress (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pm: Session;
  let clientAdmin: Session;
  let clientEmployee: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let acmeOrgId: string;
  let acmeProjectId: string;
  let zenithProjectId: string;
  let pmUserId: string;

  const createdTasks: string[] = [];
  const createdUpdates: string[] = [];
  const createdReleases: string[] = [];
  const createdNotes: string[] = [];
  const createdUat: string[] = [];

  /** Text that only ever exists on the internal side of a record. None may appear in a response. */
  const INTERNAL_TEXT = {
    blockedReason: 'Waiting on the payment sandbox credentials from ops',
    releaseNotes: 'Deploy order: migrations, workers, web. Watch the queue depth.',
    failureReason: 'Migration 042 timed out on the replica',
    rollbackReason: 'Checkout returned 500 for four percent of sessions',
    otherClient: 'Zenith fleet telemetry rewrite',
    unsharedTask: 'Internal refactor of the pricing engine',
  } as const;

  /** The board's own shape: every key a client is given, and no other. */
  const PROGRESS_KEYS = [
    'asOfDate',
    'blockers',
    'completedToday',
    'currentMilestone',
    'inProgress',
    'progressPercent',
    'project',
    'readyToRelease',
    'recentReleases',
    'recentUpdates',
    'taskCounts',
    'uatRequests',
    'underTesting',
    'upcoming',
  ].sort();

  const api = () => request(app.getHttpServer());
  const progress = (session: Session, projectId: string) =>
    api()
      .get(`/api/v1/portal/projects/${projectId}/progress`)
      .set('Authorization', bearer(session));

  /** A client-visible task carrying an internal reason, so the response can be checked for it. */
  async function makeTask(
    projectId: string,
    number: number,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const task = await prisma.task.create({
      data: {
        organizationId: providerOrgId,
        projectId,
        number,
        title: 'Package 7c fixture',
        status: 'BLOCKED',
        clientVisible: true,
        blockedReason: INTERNAL_TEXT.blockedReason,
        estimateMinutes: 480,
        createdById: pmUserId,
        ...over,
      },
      select: { id: true },
    });
    createdTasks.push(task.id);
    return task.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [pm, clientAdmin, clientEmployee, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.clientEmployee),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    pmUserId = pm.body.user.id;
    acmeOrgId = clientAdmin.body.user.organization.id;

    const provider = await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } });
    providerOrgId = provider.id;
    const [acme, zenith] = await Promise.all([
      prisma.project.findFirstOrThrow({ where: { organizationId: providerOrgId, code: 'ACM' } }),
      prisma.project.findFirstOrThrow({ where: { organizationId: providerOrgId, code: 'ZEN' } }),
    ]);
    acmeProjectId = acme.id;
    zenithProjectId = zenith.id;

    // Fixture numbers sit far above the seed's so they cannot collide with it.
    const next = (await prisma.task.aggregate({ _max: { number: true } }))._max.number ?? 0;
    const blockedTaskId = await makeTask(acmeProjectId, next + 1);
    const uatTaskId = await makeTask(acmeProjectId, next + 2, { status: 'CLIENT_UAT' });
    await makeTask(acmeProjectId, next + 3, {
      status: 'COMPLETED',
      completedAt: new Date(),
      title: 'Package 7c completed today',
    });
    // Another client's work, with a title the Acme board must never contain.
    await makeTask(zenithProjectId, next + 4, {
      status: 'IN_PROGRESS',
      title: INTERNAL_TEXT.otherClient,
    });
    // This client's project, but work the team has not shared. Row-level security allows it
    // through — `clientVisible` is an application rule and only the query enforces it.
    await makeTask(acmeProjectId, next + 5, {
      status: 'IN_PROGRESS',
      clientVisible: false,
      title: INTERNAL_TEXT.unsharedTask,
    });

    const update = await prisma.clientUpdate.create({
      data: {
        organizationId: providerOrgId,
        clientOrganizationId: acmeOrgId,
        projectId: acmeProjectId,
        taskId: blockedTaskId,
        workDate: new Date(),
        title: 'Card payments are on hold',
        body: 'We are waiting for your bank to enable the test account.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        authorId: pmUserId,
      },
      select: { id: true },
    });
    createdUpdates.push(update.id);

    // The published note is what a client is told about a release; the draft is not, and the
    // deployment row behind both carries the failure and rollback text the board must never show.
    const [published, draft] = await Promise.all([
      prisma.releaseNote.create({
        data: {
          organizationId: providerOrgId,
          clientOrganizationId: acmeOrgId,
          projectId: acmeProjectId,
          version: '7c-published',
          releaseDate: new Date(),
          status: 'PUBLISHED',
          publishedAt: new Date(),
          clientSummary: 'Invoices now download as a single PDF.',
          internalNotes: INTERNAL_TEXT.releaseNotes,
          createdById: pmUserId,
        },
        select: { id: true },
      }),
      prisma.releaseNote.create({
        data: {
          organizationId: providerOrgId,
          clientOrganizationId: acmeOrgId,
          projectId: acmeProjectId,
          version: '7c-unpublished',
          releaseDate: new Date(),
          status: 'APPROVED',
          clientSummary: 'Checkout rewrite',
          createdById: pmUserId,
        },
        select: { id: true },
      }),
    ]);
    createdNotes.push(published.id, draft.id);

    const rolledBack = await prisma.release.create({
      data: {
        organizationId: providerOrgId,
        projectId: acmeProjectId,
        version: '7c-rolled-back',
        title: 'Checkout rewrite',
        status: 'ROLLED_BACK',
        publishedAt: new Date(),
        rolledBackAt: new Date(),
        rollbackReason: INTERNAL_TEXT.rollbackReason,
        failureReason: INTERNAL_TEXT.failureReason,
        createdById: pmUserId,
      },
      select: { id: true },
    });
    createdReleases.push(rolledBack.id);

    const uat = await prisma.uatRequest.create({
      data: {
        organizationId: providerOrgId,
        clientOrganizationId: acmeOrgId,
        taskId: uatTaskId,
        summaryPlain: 'You can now download last month’s invoices as a single PDF.',
        checklist: ['Open Billing', 'Download the PDF'],
        createdById: pmUserId,
      },
      select: { id: true },
    });
    createdUat.push(uat.id);
  });

  afterAll(async () => {
    // Only rows these tests created.
    await prisma.uatRequest.deleteMany({ where: { id: { in: createdUat } } });
    await prisma.clientUpdate.deleteMany({ where: { id: { in: createdUpdates } } });
    await prisma.release.deleteMany({ where: { id: { in: createdReleases } } });
    await prisma.releaseNote.deleteMany({ where: { id: { in: createdNotes } } });
    await prisma.task.deleteMany({ where: { id: { in: createdTasks } } });
    await app.close();
  });

  it('answers “what happened on my project” from records that already exist', async () => {
    const response = await progress(clientAdmin, acmeProjectId).expect(200);
    const body = response.body;

    expect(Object.keys(body).sort()).toEqual(PROGRESS_KEYS);
    expect(body.project).toEqual({
      id: acmeProjectId,
      code: 'ACM',
      name: expect.any(String) as string,
    });
    expect(body.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof body.progressPercent).toBe('number');
    expect(
      body.completedToday.some(
        (task: { title: string }) => task.title === 'Package 7c completed today',
      ),
    ).toBe(true);
    expect(body.recentUpdates.length).toBeGreaterThan(0);
    expect(body.uatRequests.some((row: { status: string }) => row.status === 'PENDING')).toBe(true);
  });

  it('shows a blocker with the team’s published words and never the internal reason', async () => {
    const response = await progress(clientAdmin, acmeProjectId).expect(200);
    const blockers: Array<Record<string, unknown>> = response.body.blockers;

    expect(blockers.length).toBeGreaterThanOrEqual(2);
    for (const blocker of blockers) {
      expect(Object.keys(blocker).sort()).toEqual(
        ['id', 'key', 'note', 'since', 'title', 'waitingOnYou'].sort(),
      );
    }
    // The one held by the team carries the published update as its explanation.
    const held = blockers.find((blocker) => blocker.waitingOnYou === false);
    expect(held?.note).toBe('We are waiting for your bank to enable the test account.');
    // The one waiting on the client is the sign-off.
    expect(blockers.some((blocker) => blocker.waitingOnYou === true)).toBe(true);
  });

  it('lists only the releases the client was actually told about', async () => {
    const response = await progress(clientAdmin, acmeProjectId).expect(200);
    const versions = response.body.recentReleases.map((row: { version: string }) => row.version);

    expect(versions).toContain('7c-published');
    // Approved but never sent, and a deployment that came back off: neither is the client's news.
    expect(versions).not.toContain('7c-unpublished');
    expect(versions).not.toContain('7c-rolled-back');
    for (const release of response.body.recentReleases) {
      expect(Object.keys(release).sort()).toEqual(
        ['id', 'publishedAt', 'releaseDate', 'summary', 'version'].sort(),
      );
    }
  });

  it('serializes no internal field and no other client’s work', async () => {
    const response = await progress(clientAdmin, acmeProjectId).expect(200);
    // The raw body, not the parsed object: a nested leak is easy to forget to look at.
    const raw = response.text;

    for (const forbidden of Object.values(INTERNAL_TEXT)) {
      expect(raw).not.toContain(forbidden);
    }
    for (const field of [
      'blockedReason',
      'estimateMinutes',
      'loggedMinutes',
      'assignedTo',
      'reviewerId',
      'testerId',
      'failureReason',
      'rollbackReason',
      'failureDescription',
      'internalNotes',
      'organizationId',
      'clientVisible',
      'timing',
      'health',
      // Staff identity, which reached clients through the internal client-update shape until a
      // review caught it. Asserted on the raw body, because the leak was nested two levels down
      // and a typed assertion looked at the wrapper.
      'author',
      'publishedBy',
      '@ashniva.',
    ]) {
      expect(raw).not.toContain(field);
    }
  });

  it('leaves out work on this project the team has not shared', async () => {
    const response = await progress(clientAdmin, acmeProjectId).expect(200);
    expect(response.text).not.toContain(INTERNAL_TEXT.unsharedTask);
  });

  it('gives a client employee no more than the client admin', async () => {
    const [admin, employee] = await Promise.all([
      progress(clientAdmin, acmeProjectId).expect(200),
      progress(clientEmployee, acmeProjectId).expect(200),
    ]);
    expect(Object.keys(employee.body).sort()).toEqual(Object.keys(admin.body).sort());
    expect(employee.body.blockers).toHaveLength(admin.body.blockers.length);
    expect(employee.body.recentReleases).toHaveLength(admin.body.recentReleases.length);
  });

  it('answers another client’s request for this project as if it did not exist', async () => {
    await progress(zenithAdmin, acmeProjectId).expect(404);

    const own = await progress(zenithAdmin, zenithProjectId).expect(200);
    expect(own.body.project.code).toBe('ZEN');
    expect(own.text).not.toContain('Package 7c');
    expect(own.text).not.toContain('7c-published');

    const acme = await progress(clientAdmin, acmeProjectId).expect(200);
    expect(acme.text).not.toContain(INTERNAL_TEXT.otherClient);
  });

  it('leaves internal staff and the rest of the portal working', async () => {
    // Not a 500: the portal is for clients, and an internal caller is told so.
    await progress(pm, acmeProjectId).expect(403);
    await api()
      .get(`/api/v1/projects/${acmeProjectId}`)
      .set('Authorization', bearer(pm))
      .expect(200);
    await api()
      .get(`/api/v1/portal/projects/${acmeProjectId}`)
      .set('Authorization', bearer(clientAdmin))
      .expect(200);
    await api().get(`/api/v1/portal/projects/${acmeProjectId}/progress`).expect(401);
  });
});
