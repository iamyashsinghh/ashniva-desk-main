import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Working hours, support ownership and availability end to end.
 *
 * What is worth proving against a real database rather than a unit test: that the three records
 * stay separate and combine into the one answer the routing engine will act on, that a rota cannot
 * be written for somebody in another organization, and that a developer reading their own shift
 * does not thereby acquire the management view. The resolution rules themselves are unit-tested in
 * `packages/types`; this is about the permission and tenant boundaries around them.
 */
describe('Support routing configuration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pm: Session;
  let developer: Session;
  let tester: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let projectId: string;
  let otherProjectId: string;
  /** A project in a second organization, so "another tenant" is a real row rather than a guess. */
  let foreignProjectId: string;

  const api = () => request(app.getHttpServer());

  /** Today in UTC, which is the day `configFor` asks the on-call rota about. */
  const today = () => new Date().toISOString().slice(0, 10);

  const config = (session = pm, id = projectId) =>
    api().get(`/api/v1/projects/${id}/support-config`).set('Authorization', bearer(session));

  const putOwnership = (body: Record<string, unknown>, session = pm, id = projectId) =>
    api()
      .put(`/api/v1/projects/${id}/support-ownership`)
      .set('Authorization', bearer(session))
      .send(body);

  const putSchedule = (userId: string, body: Record<string, unknown>, session = pm) =>
    api()
      .put(`/api/v1/users/${userId}/work-schedule`)
      .set('Authorization', bearer(session))
      .send(body);

  const patchAvailability = (userId: string, body: Record<string, unknown>, session = pm) =>
    api()
      .patch(`/api/v1/users/${userId}/availability`)
      .set('Authorization', bearer(session))
      .send(body);

  const putOnCall = (body: Record<string, unknown>, session = pm, id = projectId) =>
    api().put(`/api/v1/projects/${id}/on-call`).set('Authorization', bearer(session)).send(body);

  /** One member of the team as the configuration screen and the future router see them. */
  async function teamMember(userId: string) {
    const response = await config().expect(200);
    const found = response.body.team.find((row: { userId: string }) => row.userId === userId) as
      undefined | Record<string, unknown>;
    if (!found) {
      throw new Error(`The team view does not include ${userId}`);
    }
    return found;
  }

  async function createProject(code: string, organizationId = providerOrgId): Promise<string> {
    const project = await prisma.project.create({
      data: {
        organizationId,
        code,
        name: `Support routing fixture ${code}`,
        description: 'Created by support-routing.e2e-spec.ts',
        type: 'INTERNAL_WORK',
        status: 'ACTIVE',
        createdById: pm.body.user.id,
      },
      select: { id: true },
    });
    return project.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [pm, developer, tester, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);
    const provider = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = provider?.id ?? '';
    expect(providerOrgId).toBeTruthy();

    const groupCompany = await prisma.organization.findFirst({ where: { slug: 'grouphr' } });
    if (!groupCompany) {
      throw new Error('The seed has no second organization to test isolation against');
    }

    const stamp = Date.now().toString().slice(-6);
    projectId = await createProject(`SR${stamp}`);
    otherProjectId = await createProject(`SX${stamp}`);
    foreignProjectId = await createProject(`SF${stamp}`, groupCompany.id);
    await prisma.projectMember.createMany({
      data: [
        { projectId, userId: developer.body.user.id, role: 'DEVELOPER' },
        { projectId, userId: tester.body.user.id, role: 'TESTER' },
      ],
      skipDuplicates: true,
    });
  });

  afterAll(async () => {
    // Only rows these tests created. The rota and availability rows hang off users rather than
    // the fixture project, so they are named explicitly rather than left for the next run to find.
    const userIds = [developer.body.user.id, tester.body.user.id];
    const projectIds = [projectId, otherProjectId, foreignProjectId];
    await prisma.onCallSchedule.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.supportOwnership.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.userWorkSchedule.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userAvailability.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await app.close();
  });

  describe('ownership', () => {
    it('creates the default configuration the first time a project is asked about it', async () => {
      const response = await config().expect(200);
      expect(response.body.ownership).toMatchObject({
        projectId,
        primaryDeveloper: null,
        ackMinutes: 15,
        escalationMinutes: 30,
      });
      expect(response.body.team).toHaveLength(2);
    });

    it('stores who owns support and which module goes to whom', async () => {
      await putOwnership({
        primaryDeveloperId: developer.body.user.id,
        testerId: tester.body.user.id,
        moduleOwners: { Billing: developer.body.user.id },
        workloadLimit: 5,
        ackMinutes: 10,
        directTypes: ['BUG'],
      }).expect(200);

      const response = await config().expect(200);
      expect(response.body.ownership).toMatchObject({
        primaryDeveloper: { id: developer.body.user.id },
        tester: { id: tester.body.user.id },
        moduleOwners: { Billing: developer.body.user.id },
        workloadLimit: 5,
        ackMinutes: 10,
        directTypes: ['BUG'],
      });
    });

    it('leaves fields the caller did not send alone', async () => {
      await putOwnership({ escalationMinutes: 45 }).expect(200);
      const response = await config().expect(200);
      // The primary developer set by the previous test is still there.
      expect(response.body.ownership).toMatchObject({
        primaryDeveloper: { id: developer.body.user.id },
        escalationMinutes: 45,
      });
    });

    it('refuses to name somebody from another organization as the owner', async () => {
      await putOwnership({ primaryDeveloperId: zenithAdmin.body.user.id }).expect(400);
      // And nothing was written: a rejected write must not half-apply.
      const response = await config().expect(200);
      expect(response.body.ownership.primaryDeveloper).toMatchObject({
        id: developer.body.user.id,
      });
    });

    it('refuses a module owner from another organization too', async () => {
      await putOwnership({ moduleOwners: { Billing: zenithAdmin.body.user.id } }).expect(400);
    });
  });

  describe('working hours', () => {
    it('stores a rota and reads the clock times back', async () => {
      const response = await putSchedule(developer.body.user.id, {
        workingDays: [1, 2, 3, 4, 5],
        startTime: '09:30',
        endTime: '18:30',
        timezone: 'Asia/Kolkata',
        workloadLimit: 3,
      }).expect(200);
      expect(response.body).toMatchObject({
        userId: developer.body.user.id,
        workingDays: [1, 2, 3, 4, 5],
        startTime: '09:30',
        endTime: '18:30',
        timezone: 'Asia/Kolkata',
        workloadLimit: 3,
      });
    });

    it('rejects a shift whose start and end are the same time', async () => {
      await putSchedule(developer.body.user.id, {
        workingDays: [1],
        startTime: '09:00',
        endTime: '09:00',
      }).expect(400);
    });

    it('rejects a time that is not a clock time', async () => {
      await putSchedule(developer.body.user.id, {
        workingDays: [1],
        startTime: '25:00',
        endTime: '18:00',
      }).expect(400);
    });

    it('refuses to write a rota for somebody in another organization', async () => {
      await putSchedule(zenithAdmin.body.user.id, {
        workingDays: [1],
        startTime: '09:00',
        endTime: '17:00',
      }).expect(400);
    });
  });

  describe('availability, the schedule and on-call together', () => {
    beforeEach(async () => {
      // No working days at all, so "inside working hours" is false whenever this test runs.
      await putSchedule(tester.body.user.id, {
        workingDays: [],
        startTime: '09:30',
        endTime: '18:30',
      }).expect(200);
      await api()
        .delete(`/api/v1/projects/${projectId}/on-call/${today()}`)
        .set('Authorization', bearer(pm))
        .send();
    });

    it('reports out-of-hours even when HR last said the person was available', async () => {
      await patchAvailability(tester.body.user.id, {
        status: 'AVAILABLE',
        source: 'HR',
      }).expect(200);

      const member = await teamMember(tester.body.user.id);
      // The stored fact is preserved; the effective answer is the one the router acts on.
      expect(member).toMatchObject({
        status: 'AVAILABLE',
        source: 'HR',
        effectiveStatus: 'OUT_OF_HOURS',
        withinSchedule: false,
      });
    });

    it('lets on-call cover beat the rota, which is what on-call is for', async () => {
      await putOnCall({ onDate: today(), userId: tester.body.user.id }).expect(200);
      const member = await teamMember(tester.body.user.id);
      expect(member).toMatchObject({ effectiveStatus: 'AVAILABLE', withinSchedule: false });
    });

    it('does not let on-call cover beat approved leave', async () => {
      await putOnCall({ onDate: today(), userId: tester.body.user.id }).expect(200);
      await patchAvailability(tester.body.user.id, { status: 'ON_LEAVE', source: 'HR' }).expect(
        200,
      );
      const member = await teamMember(tester.body.user.id);
      expect(member).toMatchObject({ effectiveStatus: 'ON_LEAVE' });
    });

    it('stops applying a leave once its until has passed', async () => {
      await patchAvailability(tester.body.user.id, {
        status: 'ON_LEAVE',
        source: 'HR',
        until: new Date(Date.now() - 60_000).toISOString(),
      }).expect(200);
      const member = await teamMember(tester.body.user.id);
      // Expired leave falls through to the rota, which says out of hours — not still on leave.
      expect(member).toMatchObject({ effectiveStatus: 'OUT_OF_HOURS' });
    });

    it('covers the backup as well as the person on call', async () => {
      await putOnCall({
        onDate: today(),
        userId: developer.body.user.id,
        backupUserId: tester.body.user.id,
      }).expect(200);
      const member = await teamMember(tester.body.user.id);
      expect(member).toMatchObject({ effectiveStatus: 'AVAILABLE' });
    });

    it('refuses a backup who is the person on call', async () => {
      await putOnCall({
        onDate: today(),
        userId: tester.body.user.id,
        backupUserId: tester.body.user.id,
      }).expect(400);
    });

    it('replaces rather than duplicates cover for a date', async () => {
      await putOnCall({ onDate: today(), userId: developer.body.user.id }).expect(200);
      await putOnCall({ onDate: today(), userId: tester.body.user.id }).expect(200);
      const response = await config().expect(200);
      const forToday = response.body.onCall.filter(
        (row: { onDate: string }) => row.onDate === today(),
      );
      expect(forToday).toHaveLength(1);
      expect(forToday[0].user.id).toBe(tester.body.user.id);
    });

    it('says so when there is no cover to clear', async () => {
      await api()
        .delete(`/api/v1/projects/${projectId}/on-call/${today()}`)
        .set('Authorization', bearer(pm))
        .expect(404);
    });
  });

  describe('who may see and change what', () => {
    it('keeps the configuration screen to people who manage support routing', async () => {
      await config(developer).expect(403);
      await config(tester).expect(403);
    });

    it('keeps every write to people who manage support routing', async () => {
      await putOwnership({ ackMinutes: 20 }, developer).expect(403);
      await putSchedule(
        developer.body.user.id,
        {
          workingDays: [1],
          startTime: '09:00',
          endTime: '17:00',
        },
        developer,
      ).expect(403);
      await patchAvailability(developer.body.user.id, { status: 'AVAILABLE' }, developer).expect(
        403,
      );
      await putOnCall({ onDate: today(), userId: developer.body.user.id }, developer).expect(403);
    });

    it('does not let a developer set their own availability either', async () => {
      // Being the subject of a record is not permission to write it — otherwise anybody could
      // mark themselves unavailable and stop being routed work.
      await patchAvailability(developer.body.user.id, { status: 'ON_LEAVE' }, developer).expect(
        403,
      );
    });

    it('lets a developer read their own shift and nothing else', async () => {
      const response = await api()
        .get('/api/v1/me/work-schedule')
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(response.body).toMatchObject({
        userId: developer.body.user.id,
        workingDays: [1, 2, 3, 4, 5],
      });
      // The response is the schedule alone: no team, no ownership, no other person's availability.
      expect(Object.keys(response.body).sort()).toEqual([
        'endTime',
        'startTime',
        'timezone',
        'updatedAt',
        'user',
        'userId',
        'workingDays',
        'workloadLimit',
      ]);
    });

    it('keeps all of it away from client users', async () => {
      await config(clientAdmin).expect(403);
      await api()
        .get('/api/v1/me/work-schedule')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });

    it('needs a token at all', async () => {
      await api().get(`/api/v1/projects/${projectId}/support-config`).expect(401);
      await api().get('/api/v1/me/work-schedule').expect(401);
    });
  });

  describe('tenant isolation', () => {
    it('does not find a project belonging to another organization', async () => {
      // Not found rather than forbidden: a manager in one tenant should not learn that a project
      // id in another one exists.
      await config(pm, foreignProjectId).expect(404);
      await putOwnership({ ackMinutes: 20 }, pm, foreignProjectId).expect(404);
    });

    it('will not overwrite a rota that belongs to another organization', async () => {
      // A person may belong to two provider organizations, and the rota row is keyed by user
      // rather than by (organization, user) — one person, one working week. That is exactly the
      // shape where a plain upsert would let one tenant silently re-home another tenant's row,
      // so this proves the write is refused instead.
      const foreignOrg = await prisma.project.findUniqueOrThrow({
        where: { id: foreignProjectId },
        select: { organizationId: true },
      });
      const stranger = await prisma.user.findFirstOrThrow({
        where: { memberships: { some: { organizationId: foreignOrg.organizationId } } },
        select: { id: true },
      });
      await prisma.userWorkSchedule.create({
        data: {
          organizationId: foreignOrg.organizationId,
          userId: stranger.id,
          workingDays: [1],
          startMinute: 600,
          endMinute: 1080,
          timezone: 'Asia/Kolkata',
          workloadLimit: null,
          updatedById: stranger.id,
        },
      });
      // Give the write a reason to get past the membership check, so the refusal below can only
      // come from the tenant guard on the row itself.
      const role = await prisma.organizationMembership.findFirstOrThrow({
        where: { userId: developer.body.user.id, organizationId: providerOrgId },
        select: { roleId: true },
      });
      await prisma.organizationMembership.create({
        data: { organizationId: providerOrgId, userId: stranger.id, roleId: role.roleId },
      });

      await putSchedule(stranger.id, {
        workingDays: [1, 2, 3],
        startTime: '08:00',
        endTime: '16:00',
      }).expect(409);

      const untouched = await prisma.userWorkSchedule.findUniqueOrThrow({
        where: { userId: stranger.id },
      });
      expect({
        organizationId: untouched.organizationId,
        startMinute: untouched.startMinute,
      }).toEqual({ organizationId: foreignOrg.organizationId, startMinute: 600 });

      await prisma.userWorkSchedule.deleteMany({ where: { userId: stranger.id } });
      await prisma.organizationMembership.deleteMany({
        where: { organizationId: providerOrgId, userId: stranger.id },
      });
    });

    it('does not let a manager put their own people on another tenant’s rota', async () => {
      await putOnCall(
        { onDate: today(), userId: developer.body.user.id },
        pm,
        foreignProjectId,
      ).expect(404);
    });

    it('keeps each project’s ownership to itself', async () => {
      await putOwnership({ ackMinutes: 12 }, pm, otherProjectId).expect(200);
      const mine = await config().expect(200);
      // The earlier tests left this project on 10; the other project's 12 did not leak into it.
      expect(mine.body.ownership.ackMinutes).toBe(10);
      expect(mine.body.ownership.projectId).toBe(projectId);
    });
  });
});
