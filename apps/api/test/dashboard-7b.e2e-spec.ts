import type { INestApplication } from '@nestjs/common';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  type OperationsDashboard,
  type PermissionKey,
} from '@ashniva/types';
import argon2 from 'argon2';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import {
  bearer,
  createTestApp,
  DEMO,
  loginAs,
  SEED_PASSWORD,
  type Session,
} from './helpers/test-app';

/**
 * Package 7b — the operational dashboard, and the two lines it must not cross.
 *
 * **Scope.** A team lead sees the projects they are on and nothing else. The fixture is a project
 * created with nobody on it: the director sees it because their scope is the organization, the
 * lead must not, and the assertion is worth making through HTTP because the narrowing happens in
 * a query the unit tests only see the arguments of.
 *
 * **Permission.** Availability, on-call and internal cost are guarded elsewhere by keys a manager
 * may not hold. A dashboard that showed them anyway would be a way around those guards, so the
 * sections are absent — not empty, absent — and the caller here is a real signed-in user of a
 * custom role that lacks exactly one of the keys.
 */
describe('Operational dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let lead: Session;
  let developer: Session;
  let client: Session;
  /** A team lead by role, minus support-routing:manage. */
  let narrowedLead: Session;

  let providerOrgId = '';
  let unstaffedProjectId = '';
  let foreignProjectId = '';
  let narrowedRoleId = '';
  let narrowedUserId = '';

  const stamp = Date.now().toString().slice(-6);
  const NARROWED_EMAIL = `ops-lead-${stamp}@example.com`;

  const api = () => request(app.getHttpServer());

  const operations = async (session: Session): Promise<OperationsDashboard> => {
    const response = await api()
      .get('/api/v1/dashboard/operations')
      .set('Authorization', bearer(session))
      .expect(200);
    return response.body as OperationsDashboard;
  };

  async function createProject(code: string, organizationId: string): Promise<string> {
    const project = await prisma.project.create({
      data: {
        organizationId,
        code,
        name: `Operations fixture ${code}`,
        description: 'Created by dashboard-7b.e2e-spec.ts',
        type: 'INTERNAL_WORK',
        status: 'ACTIVE',
        createdById: director.body.user.id,
      },
      select: { id: true },
    });
    return project.id;
  }

  /** A custom role cut from TEAM_LEAD, with one key deliberately withheld. */
  async function createNarrowedLead(withheld: PermissionKey[]): Promise<Session> {
    const keys = DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.TEAM_LEAD].filter(
      (key) => !withheld.includes(key),
    );
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...keys] } },
      select: { id: true },
    });
    const role = await prisma.role.create({
      data: {
        organizationId: providerOrgId,
        key: `ops-lead-${stamp}`,
        name: `Team lead without routing (${stamp})`,
        isSystem: false,
        templateKey: ROLE_KEYS.TEAM_LEAD,
        audience: 'INTERNAL',
        permissions: { create: permissions.map((row) => ({ permissionId: row.id })) },
      },
      select: { id: true },
    });
    narrowedRoleId = role.id;
    const user = await prisma.user.create({
      data: {
        email: NARROWED_EMAIL,
        name: 'Narrowed Lead',
        passwordHash: await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id }),
        status: 'ACTIVE',
        memberships: {
          create: { organizationId: providerOrgId, roleId: role.id, title: 'Team Lead' },
        },
      },
      select: { id: true },
    });
    narrowedUserId = user.id;
    return loginAs(app, NARROWED_EMAIL);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, lead, developer, client] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
    ]);
    const [provider, groupCompany] = await Promise.all([
      prisma.organization.findFirst({ where: { slug: 'ashniva' } }),
      prisma.organization.findFirst({ where: { slug: 'grouphr' } }),
    ]);
    providerOrgId = provider?.id ?? '';
    expect(providerOrgId).toBeTruthy();
    if (!groupCompany) {
      throw new Error('The seed has no second organization to test isolation against');
    }
    // Nobody is a member, manager or lead of this one except the director who created it.
    unstaffedProjectId = await createProject(`OP${stamp}`, providerOrgId);
    foreignProjectId = await createProject(`OF${stamp}`, groupCompany.id);
    narrowedLead = await createNarrowedLead([PERMISSIONS.SUPPORT_ROUTING_MANAGE]);
  });

  afterAll(async () => {
    await prisma.project.deleteMany({
      where: { id: { in: [unstaffedProjectId, foreignProjectId] } },
    });
    await prisma.organizationMembership.deleteMany({ where: { userId: narrowedUserId } });
    await prisma.refreshToken.deleteMany({ where: { userId: narrowedUserId } });
    await prisma.user.deleteMany({ where: { id: narrowedUserId } });
    await prisma.rolePermission.deleteMany({ where: { roleId: narrowedRoleId } });
    await prisma.role.deleteMany({ where: { id: narrowedRoleId } });
    await app.close();
  });

  describe('who may open it at all', () => {
    it('refuses a client organization, which has the portal instead', async () => {
      await api()
        .get('/api/v1/dashboard/operations')
        .set('Authorization', bearer(client))
        .expect(403);
    });

    it('refuses a developer, who manages nobody', async () => {
      await api()
        .get('/api/v1/dashboard/operations')
        .set('Authorization', bearer(developer))
        .expect(403);
    });

    it('refuses a request with no token', async () => {
      await api().get('/api/v1/dashboard/operations').expect(401);
    });
  });

  describe('scope', () => {
    it('gives a manager the organization, including a project they staffed nobody on', async () => {
      const payload = await operations(director);

      expect(payload.kind).toBe('operations');
      expect(payload.scope.kind).toBe('organization');
      expect(payload.scope.taskListView).toBe('all');
      expect(payload.scope.projectIds).toContain(unstaffedProjectId);
    });

    it('gives a team lead only the projects they are on', async () => {
      const payload = await operations(lead);

      expect(payload.scope.kind).toBe('team');
      expect(payload.scope.taskListView).toBe('team');
      expect(payload.scope.projectIds.length).toBeGreaterThan(0);
      expect(payload.scope.projectIds).not.toContain(unstaffedProjectId);
      expect(payload.projects.map((row) => row.project.id)).not.toContain(unstaffedProjectId);
    });

    it('never reaches another organization’s project, even for a super admin', async () => {
      const payload = await operations(director);

      expect(payload.scope.projectIds).not.toContain(foreignProjectId);
      expect(payload.projects.map((row) => row.project.id)).not.toContain(foreignProjectId);
    });

    // The card promise, end to end: the number and the list its link opens are the same rows.
    it('counts blocked work as the task list the card links to counts it', async () => {
      const payload = await operations(lead);
      const list = await api()
        .get('/api/v1/tasks?view=team&status=BLOCKED')
        .set('Authorization', bearer(lead))
        .expect(200);

      expect(payload.today.blocked).toBe(list.body.total);
    });

    it('counts today’s scheduled work as the new list filter does', async () => {
      const payload = await operations(lead);
      const list = await api()
        .get('/api/v1/tasks?view=team&scheduledToday=true')
        .set('Authorization', bearer(lead))
        .expect(200);

      expect(payload.today.scheduled).toBe(list.body.total);
    });

    /**
     * The case the card promise was actually broken on.
     *
     * "Started today" deliberately carries no status filter — a task started at 09:00 and finished
     * at 14:00 still started today, and dropping it would make the number smaller every time
     * somebody finished something. The list the card links to was defaulting to the open statuses
     * and dropping exactly that task, so the card read one and the list read none.
     */
    it('counts a task started and finished today, as the list it links to does', async () => {
      const leadId = lead.body.user.id as string;
      const project = await prisma.project.findFirst({
        where: {
          organizationId: providerOrgId,
          deletedAt: null,
          members: { some: { userId: leadId } },
        },
        select: { id: true },
      });
      expect(project).toBeTruthy();

      const before = await operations(lead);
      const beforeList = await api()
        .get('/api/v1/tasks?view=team&startedToday=true')
        .set('Authorization', bearer(lead))
        .expect(200);
      expect(before.today.started).toBe(beforeList.body.total);

      const startedAndFinished = await prisma.task.create({
        data: {
          organizationId: providerOrgId,
          projectId: project?.id ?? '',
          number: 900_000 + Number(stamp.slice(-4)),
          title: 'Started and finished the same day',
          status: 'COMPLETED',
          assignedToId: leadId,
          createdById: leadId,
          startedAt: new Date(),
          completedAt: new Date(),
        },
        select: { id: true },
      });

      try {
        const after = await operations(lead);
        const afterList = await api()
          .get('/api/v1/tasks?view=team&startedToday=true')
          .set('Authorization', bearer(lead))
          .expect(200);

        expect(after.today.started).toBe(before.today.started + 1);
        expect(after.today.started).toBe(afterList.body.total);
      } finally {
        await prisma.task.deleteMany({ where: { id: startedAndFinished.id } });
      }
    });
  });

  describe('per-section permissions', () => {
    it('gives a full team lead the team and availability sections', async () => {
      const payload = await operations(lead);

      expect(payload.team).toBeDefined();
      expect(payload.availability).toBeDefined();
      expect(payload.support.routing).toBeDefined();
    });

    it('omits availability and routing for a lead without support-routing:manage', async () => {
      expect(narrowedLead.body.user.permissions).not.toContain(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
      const payload = await operations(narrowedLead);

      expect('availability' in payload).toBe(false);
      expect('routing' in payload.support).toBe(false);
      // The sections that key does not guard are untouched.
      expect(payload.team).toBeDefined();
      expect(payload.support.escalated).toEqual(expect.any(Number));
    });

    it('omits costs for anybody without cost:read, and shows them to a director', async () => {
      const [leadPayload, directorPayload] = await Promise.all([
        operations(lead),
        operations(director),
      ]);

      expect(lead.body.user.permissions).not.toContain(PERMISSIONS.COST_READ);
      expect('cost' in leadPayload).toBe(false);
      expect(directorPayload.cost).toBeDefined();
    });
  });

  describe('the sections themselves', () => {
    it('reports every section a manager always gets', async () => {
      const payload = await operations(director);

      expect(Object.keys(payload.today)).toEqual(
        expect.arrayContaining(['scheduled', 'started', 'completed', 'overdue', 'upcoming']),
      );
      expect(Object.keys(payload.time)).toEqual(
        expect.arrayContaining(['inHand', 'atRisk', 'delayed', 'completedOnTime', 'completedLate']),
      );
      expect(Object.keys(payload.support)).toEqual(
        expect.arrayContaining(['newTickets', 'unacknowledged', 'escalated', 'slaBreached']),
      );
      expect(Object.keys(payload.release)).toEqual(
        expect.arrayContaining(['qaWaiting', 'qaFailed', 'uatPending', 'readyToRelease']),
      );
    });

    it('carries each project’s team and what they are responsible for', async () => {
      const payload = await operations(lead);
      const staffed = payload.projects.find((row) => row.team.length > 0);

      expect(staffed).toBeDefined();
      expect(staffed?.team[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        responsibilities: expect.any(Array),
      });
    });

    // Operational timing, never a score: the payload reports states, not per-person rates.
    it('reports no per-person productivity number anywhere', async () => {
      const payload = await operations(director);
      const body = JSON.stringify(payload).toLowerCase();

      for (const forbidden of ['score', 'ranking', 'leaderboard', 'productivity', 'rating']) {
        expect(body).not.toContain(forbidden);
      }
    });
  });
});
