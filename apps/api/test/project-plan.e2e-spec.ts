import type { INestApplication } from '@nestjs/common';
import type { PortalProjectPlan, ProjectPlan } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * The project plan, end to end.
 *
 * Four claims are worth proving against a real database. That the plan is derived — a project
 * with no work reads 0%, one whose work is all done reads 100%, and neither number was typed in
 * by anybody. That a milestone's progress comes from the records under it rather than from the
 * `progress_percent` column, which is a cache the writers keep. That the scope is the same one
 * `/projects/:id` already enforces, so this screen cannot become a way to see a project the
 * caller could not otherwise open. And that the client's copy of the plan carries the milestones
 * the team shared and nothing else — asserted against the raw response text, because a nested
 * field is easy to forget to look at.
 */
describe('Project plan (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pm: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let acmeOrgId: string;
  let pmUserId: string;
  let leadUserId: string;
  let webProjectId: string;
  let emptyProjectId: string;
  let doneProjectId: string;

  const createdProjects: string[] = [];
  const createdMilestones: string[] = [];
  const createdTasks: string[] = [];

  /** Text that exists only on the internal side. None of it may reach a portal response. */
  const INTERNAL = {
    milestoneName: 'Margin review and internal hardening',
    ungroupedBucket: 'Unscheduled work',
  } as const;

  const api = () => request(app.getHttpServer());
  const plan = (session: Session, projectId: string) =>
    api().get(`/api/v1/projects/${projectId}/plan`).set('Authorization', bearer(session));
  const portalPlan = (session: Session, projectId: string) =>
    api().get(`/api/v1/portal/projects/${projectId}/plan`).set('Authorization', bearer(session));

  async function makeProject(code: string, over: Record<string, unknown> = {}): Promise<string> {
    const project = await prisma.project.create({
      data: {
        organizationId: providerOrgId,
        clientOrganizationId: acmeOrgId,
        code,
        name: `Plan fixture ${code}`,
        description: 'Created by project-plan.e2e-spec.ts',
        type: 'FIXED_PRICE',
        status: 'ACTIVE',
        createdById: pmUserId,
        ...over,
      },
      select: { id: true },
    });
    createdProjects.push(project.id);
    return project.id;
  }

  async function makeMilestone(
    projectId: string,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const milestone = await prisma.milestone.create({
      data: {
        organizationId: providerOrgId,
        projectId,
        name: 'Plan fixture milestone',
        createdById: pmUserId,
        ...over,
      },
      select: { id: true },
    });
    createdMilestones.push(milestone.id);
    return milestone.id;
  }

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
        title: 'Plan fixture task',
        status: 'ASSIGNED',
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
    [pm, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    pmUserId = pm.body.user.id;
    acmeOrgId = clientAdmin.body.user.organization.id;
    const provider = await prisma.organization.findFirstOrThrow({ where: { slug: 'ashniva' } });
    providerOrgId = provider.id;
    const lead = await prisma.user.findFirstOrThrow({ where: { email: DEMO.lead } });
    leadUserId = lead.id;

    const stamp = Date.now().toString().slice(-6);
    const next = (await prisma.task.aggregate({ _max: { number: true } }))._max.number ?? 0;

    // A project the client can see, with one shared milestone, one internal milestone whose
    // dates run far wider, and work that belongs to no milestone at all.
    webProjectId = await makeProject(`PLN${stamp}`, {
      startDate: new Date('2026-07-01'),
      targetDate: new Date('2026-10-31'),
    });
    const shared = await makeMilestone(webProjectId, {
      name: 'Pilot store live',
      clientVisible: true,
      startDate: new Date('2026-08-14'),
      dueDate: new Date('2026-09-20'),
      ownerUserId: leadUserId,
      // A stale cache: the plan must ignore this and count the deliverables instead.
      progressPercent: 45,
      deliverables: {
        create: [
          { title: 'Store configured', isDone: true, sortOrder: 0 },
          { title: 'Staff trained', isDone: false, sortOrder: 1 },
        ],
      },
    });
    await makeMilestone(webProjectId, {
      name: INTERNAL.milestoneName,
      clientVisible: false,
      startDate: new Date('2026-05-01'),
      dueDate: new Date('2027-01-31'),
      ownerUserId: leadUserId,
    });
    await makeTask(webProjectId, next + 1, { milestoneId: shared, status: 'COMPLETED' });
    await makeTask(webProjectId, next + 2, { milestoneId: shared });
    await makeTask(webProjectId, next + 3, { dueDate: new Date('2026-12-24') });

    emptyProjectId = await makeProject(`EMP${stamp}`);
    doneProjectId = await makeProject(`FIN${stamp}`);
    await makeTask(doneProjectId, next + 4, { status: 'COMPLETED' });
    await makeTask(doneProjectId, next + 5, { status: 'COMPLETED' });
    // Cancelled work is out of the denominator, so this must not hold the project below 100%.
    await makeTask(doneProjectId, next + 6, { status: 'CANCELLED' });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { id: { in: createdTasks } } });
    await prisma.milestoneDeliverable.deleteMany({
      where: { milestoneId: { in: createdMilestones } },
    });
    await prisma.milestone.deleteMany({ where: { id: { in: createdMilestones } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjects } } });
    await app.close();
  });

  describe('who may open it', () => {
    it('needs a token', async () => {
      await api().get(`/api/v1/projects/${webProjectId}/plan`).expect(401);
    });

    it('refuses a client on the internal route — they have the portal', async () => {
      await plan(clientAdmin, webProjectId).expect(403);
    });

    it('refuses internal staff on the portal route', async () => {
      await portalPlan(pm, webProjectId).expect(403);
    });

    it('answers 404 for a project that is not the caller’s to see', async () => {
      // Zenith is a client of the same provider; this project is Acme's. The answer is the same
      // one an id that does not exist gets, so the route cannot be used to probe for projects.
      await portalPlan(zenithAdmin, webProjectId).expect(404);
      await portalPlan(zenithAdmin, '00000000-0000-4000-8000-000000000000').expect(404);
      await plan(pm, '00000000-0000-4000-8000-000000000000').expect(404);
    });
  });

  describe('progress comes from the records', () => {
    it('reads 0% for a project with nothing in it', async () => {
      const response = await plan(pm, emptyProjectId).expect(200);
      const body = response.body as ProjectPlan;
      expect(body.progress).toMatchObject({ percent: 0, basis: 'NONE', taskTotal: 0 });
      expect(body.items).toEqual([]);
    });

    it('reads 100% when every task that counts is done', async () => {
      const response = await plan(pm, doneProjectId).expect(200);
      const body = response.body as ProjectPlan;
      expect(body.progress).toMatchObject({
        percent: 100,
        basis: 'TASKS',
        taskTotal: 2,
        taskCompleted: 2,
      });
    });

    it('agrees with the percentage the project list shows', async () => {
      const [planned, listed] = await Promise.all([
        plan(pm, webProjectId).expect(200),
        api().get(`/api/v1/projects/${webProjectId}`).set('Authorization', bearer(pm)).expect(200),
      ]);
      expect((planned.body as ProjectPlan).progress.percent).toBe(listed.body.progressPercent);
    });

    it('derives a milestone from its work, not from its stored percentage', async () => {
      const response = await plan(pm, webProjectId).expect(200);
      const shared = (response.body as ProjectPlan).items.find(
        (item) => item.name === 'Pilot store live',
      );
      // One of the two linked tasks is done. The stored column still says 45.
      expect(shared?.progressPercent).toBe(50);
      expect(shared?.tasks).toEqual({ total: 2, completed: 1, open: 1, overdue: 0 });
      expect(shared?.deliverables).toEqual({ total: 2, completed: 1 });
    });

    it('places the milestones on a calendar and gathers the rest into one bucket', async () => {
      const response = await plan(pm, webProjectId).expect(200);
      const body = response.body as ProjectPlan;
      expect(body.items.map((item) => item.kind)).toEqual(['MILESTONE', 'MILESTONE', 'UNGROUPED']);
      expect(body.items[0]).toMatchObject({ startDate: '2026-08-14', endDate: '2026-09-20' });
      // The window stretches to hold the internal milestone and the loose task's due date.
      expect(body.window).toMatchObject({ startDate: '2026-05-01', endDate: '2027-01-31' });
      expect(body.window.todayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('what the client is given', () => {
    it('shows the shared milestones only, with the same percentage', async () => {
      const [portal, internal] = await Promise.all([
        portalPlan(clientAdmin, webProjectId).expect(200),
        plan(pm, webProjectId).expect(200),
      ]);
      const body = portal.body as PortalProjectPlan;
      expect(body.items.map((item) => item.name)).toEqual(['Pilot store live']);
      expect(body.progress.percent).toBe((internal.body as ProjectPlan).progress.percent);
      expect(body.progress.milestoneTotal).toBe(1);
    });

    it('carries no internal milestone, owner, dependency or overdue count', async () => {
      const response = await portalPlan(clientAdmin, webProjectId).expect(200);
      expect(response.text).not.toContain(INTERNAL.milestoneName);
      expect(response.text).not.toContain(INTERNAL.ungroupedBucket);
      expect(response.text).not.toContain(DEMO.lead);
      expect(response.text).not.toContain('owner');
      expect(response.text).not.toContain('overdue');
      expect(response.text).not.toContain('clientVisible');
      expect(response.text).not.toContain('dependsOn');
    });

    it('draws the calendar from the shared milestones alone', async () => {
      const response = await portalPlan(clientAdmin, webProjectId).expect(200);
      const body = response.body as PortalProjectPlan;
      // Not 2026-05-01 → 2027-01-31: those are the internal milestone's dates.
      expect(body.window.startDate).toBe('2026-08-14');
      expect(body.window.endDate).toBe('2026-09-20');
    });

    it('shows an empty plan when nothing has been shared yet', async () => {
      const response = await portalPlan(clientAdmin, doneProjectId).expect(200);
      const body = response.body as PortalProjectPlan;
      expect(body.items).toEqual([]);
      expect(body.window.startDate).toBeNull();
      expect(body.progress.percent).toBe(100);
    });
  });
});
