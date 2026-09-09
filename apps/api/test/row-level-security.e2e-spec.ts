import type { INestApplication } from '@nestjs/common';

import { TenantContextService } from '../src/common/tenant/tenant-context.service';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './helpers/test-app';

/**
 * Proves the database itself hides other tenants' rows once a request's tenant is stamped on the
 * connection — even for raw SQL that carries no WHERE clause. The HTTP-level cross-tenant tests
 * live next to each feature; this file checks the second, database-level layer.
 */
describe('PostgreSQL row-level security', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenants: TenantContextService;
  let providerId: string;
  let acmeId: string;
  let zenithId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenants = app.get(TenantContextService);
    const organizations = await prisma.organization.findMany({
      where: { slug: { in: ['ashniva', 'acme-retail', 'zenith-logistics'] } },
      select: { id: true, slug: true, isServiceProvider: true },
    });
    providerId = organizations.find((row) => row.isServiceProvider)?.id ?? '';
    acmeId = organizations.find((row) => row.slug === 'acme-retail')?.id ?? '';
    zenithId = organizations.find((row) => row.slug === 'zenith-logistics')?.id ?? '';
    expect(providerId && acmeId && zenithId).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
  });

  // Prisma promises are lazy: the query must be awaited inside the tenant context, exactly as a
  // request handler does, otherwise it runs after the context has ended.
  const asTenant = <T>(organizationId: string | undefined, fn: () => Promise<T>) =>
    tenants.run({ organizationId }, async () => await fn());

  // Some policies also read `app.user_id` (memberships, notifications, roles), so a few tests
  // need the person as well as the organization — the pair `JwtAuthGuard` stamps.
  const asUser = <T>(organizationId: string, userId: string, fn: () => Promise<T>) =>
    tenants.run({ organizationId, userId }, async () => await fn());

  it('runs application queries as the non-superuser application role', async () => {
    const rows = await asTenant(
      acmeId,
      () =>
        prisma.$queryRaw<Array<{ role: string; bypass: boolean }>>`
        SELECT current_user::text AS role, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]?.role).toBe('ashniva_app');
    expect(rows[0]?.bypass).toBe(false);
  });

  it('hides other clients’ tickets from a raw count with no WHERE clause', async () => {
    const [everything] = await asTenant(
      undefined,
      () => prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM tickets`,
    );
    const [acmeOnly] = await asTenant(
      acmeId,
      () => prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM tickets`,
    );
    const [zenithOnly] = await asTenant(
      zenithId,
      () => prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM tickets`,
    );
    const acmeTickets = await asTenant(undefined, () =>
      prisma.ticket.count({ where: { clientOrganizationId: acmeId } }),
    );
    expect(Number(acmeOnly?.n)).toBe(acmeTickets);
    expect(Number(zenithOnly?.n)).toBeGreaterThan(0);
    expect(Number(acmeOnly?.n) + Number(zenithOnly?.n)).toBeLessThanOrEqual(Number(everything?.n));
  });

  it('lets the service provider see every tenant it serves', async () => {
    const all = await asTenant(undefined, () => prisma.ticket.count());
    const provider = await asTenant(providerId, () => prisma.ticket.count());
    expect(provider).toBe(all);
  });

  it('shows a client only the tasks of its own projects, even without a filter', async () => {
    const acmeTasks = await asTenant(acmeId, () =>
      prisma.task.findMany({ select: { projectId: true } }),
    );
    const acmeProjects = await asTenant(undefined, () =>
      prisma.project.findMany({ where: { clientOrganizationId: acmeId }, select: { id: true } }),
    );
    const allowed = new Set(acmeProjects.map((project) => project.id));
    expect(acmeTasks.length).toBeGreaterThan(0);
    expect(acmeTasks.every((task) => allowed.has(task.projectId))).toBe(true);
  });

  describe('roles', () => {
    // Two client organizations each with a custom role, plus a person who belongs to one of them
    // and is signed in elsewhere — the shape `POST /auth/switch-organization` produces.
    const suffix = `rls-${Date.now()}`;
    let acmeRoleId = '';
    let zenithRoleId = '';
    let crossUserId = '';

    beforeAll(async () => {
      await asTenant(undefined, async () => {
        const acmeRole = await prisma.role.create({
          data: {
            organizationId: acmeId,
            key: `acme-${suffix}`,
            name: 'Acme probe',
            templateKey: 'CLIENT_EMPLOYEE',
            audience: 'CLIENT',
          },
        });
        const zenithRole = await prisma.role.create({
          data: {
            organizationId: zenithId,
            key: `zenith-${suffix}`,
            name: 'Zenith probe',
            templateKey: 'CLIENT_EMPLOYEE',
            audience: 'CLIENT',
          },
        });
        const user = await prisma.user.create({
          data: { email: `${suffix}@example.test`, name: 'Cross-org probe', status: 'ACTIVE' },
        });
        await prisma.organizationMembership.create({
          data: { organizationId: zenithId, userId: user.id, roleId: zenithRole.id },
        });
        acmeRoleId = acmeRole.id;
        zenithRoleId = zenithRole.id;
        crossUserId = user.id;
      });
    });

    afterAll(async () => {
      await asTenant(undefined, async () => {
        await prisma.organizationMembership.deleteMany({ where: { userId: crossUserId } });
        await prisma.user.deleteMany({ where: { id: crossUserId } });
        await prisma.role.deleteMany({ where: { id: { in: [acmeRoleId, zenithRoleId] } } });
      });
    });

    it('shows a tenant the shared system roles and only its own custom roles', async () => {
      const acmeRoles = await asTenant(acmeId, () =>
        prisma.role.findMany({ select: { id: true, organizationId: true, isSystem: true } }),
      );
      // System roles carry no organization and must stay visible: every membership joins one.
      expect(acmeRoles.some((role) => role.isSystem && role.organizationId === null)).toBe(true);
      expect(acmeRoles.map((role) => role.id)).toContain(acmeRoleId);
      expect(acmeRoles.map((role) => role.id)).not.toContain(zenithRoleId);
      expect(
        acmeRoles.every((role) => role.organizationId === null || role.organizationId === acmeId),
      ).toBe(true);
    });

    it('refuses to change another tenant’s custom role from a query with no organization filter', async () => {
      const changed = await asTenant(acmeId, () =>
        prisma.role.updateMany({ where: { id: zenithRoleId }, data: { name: 'taken over' } }),
      );
      expect(changed.count).toBe(0);
      const untouched = await asTenant(undefined, () =>
        prisma.role.findUniqueOrThrow({ where: { id: zenithRoleId } }),
      );
      expect(untouched.name).toBe('Zenith probe');
    });

    it('refuses to create a role for another tenant', async () => {
      await expect(
        asTenant(acmeId, () =>
          prisma.role.create({
            data: { organizationId: zenithId, key: `probe-${suffix}`, name: 'Probe' },
          }),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('still shows a person the role they hold in another organization', async () => {
      // Switching organizations resolves the membership in the organization being entered while
      // the connection still carries the one being left, and that read inner-joins the role.
      // Without this branch the switch answers 401 for anyone holding a custom role there.
      const visible = await asUser(acmeId, crossUserId, () =>
        prisma.organizationMembership.findFirst({
          where: { userId: crossUserId, organizationId: zenithId, role: { deletedAt: null } },
          include: { role: true },
        }),
      );
      expect(visible?.role.id).toBe(zenithRoleId);
      // And it is only their own role: another Acme person still cannot see it.
      const hidden = await asUser(acmeId, providerId, () =>
        prisma.role.findMany({ where: { id: zenithRoleId } }),
      );
      expect(hidden).toEqual([]);
    });

    it('lets the service provider administer every tenant’s custom roles', async () => {
      const all = await asTenant(providerId, () =>
        prisma.role.findMany({ where: { id: { in: [acmeRoleId, zenithRoleId] } } }),
      );
      expect(all).toHaveLength(2);
    });
  });

  it('hides internal comments from a client tenant', async () => {
    const internal = await asTenant(acmeId, () =>
      prisma.comment.count({ where: { visibility: 'INTERNAL' } }),
    );
    expect(internal).toBe(0);
  });

  it('refuses to insert a row for another tenant from inside a tenant context', async () => {
    const zenithProject = await asTenant(undefined, () =>
      prisma.project.findFirstOrThrow({ where: { clientOrganizationId: zenithId } }),
    );
    await expect(
      asTenant(
        acmeId,
        () =>
          prisma.$executeRaw`INSERT INTO task_categories (id, organization_id, name, kind, sort_order, is_active, created_at, updated_at)
          VALUES (gen_random_uuid(), ${zenithProject.organizationId}::uuid, ${`rls-probe-${Date.now()}`}, 'OTHER', 0, true, now(), now())`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('does not leak a tenant from one connection use into the next', async () => {
    await asTenant(zenithId, () => prisma.ticket.count());
    const all = await asTenant(undefined, () => prisma.ticket.count());
    const zenith = await asTenant(zenithId, () => prisma.ticket.count());
    expect(all).toBeGreaterThan(zenith);
  });

  it('loads relations under the same tenant as the parent query', async () => {
    const tasks = await asTenant(providerId, () =>
      prisma.task.findMany({ include: { project: true }, take: 20 }),
    );
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.project !== null)).toBe(true);
  });

  it('keeps tenants apart under concurrent load (no stale context on pooled connections)', async () => {
    const expectedAcme = await asTenant(undefined, () =>
      prisma.ticket.count({ where: { clientOrganizationId: acmeId } }),
    );
    const expectedZenith = await asTenant(undefined, () =>
      prisma.ticket.count({ where: { clientOrganizationId: zenithId } }),
    );
    const rounds = Array.from({ length: 25 }, (_, index) => index);
    const results = await Promise.all(
      rounds.flatMap(() => [
        asTenant(acmeId, () => prisma.ticket.count()).then((n) => ['acme', n] as const),
        asTenant(zenithId, () => prisma.ticket.count()).then((n) => ['zenith', n] as const),
        asTenant(providerId, () =>
          prisma.task.findMany({ include: { project: true }, take: 5 }),
        ).then((rows) => ['provider', rows.filter((row) => row.project === null).length] as const),
      ]),
    );
    for (const [tenant, value] of results) {
      if (tenant === 'acme') expect(value).toBe(expectedAcme);
      if (tenant === 'zenith') expect(value).toBe(expectedZenith);
      if (tenant === 'provider') expect(value).toBe(0);
    }
  });

  /**
   * Which tables are covered, rather than which rows one of them hides.
   *
   * Everything above proves the policies work where they exist. Nothing proved they exist
   * everywhere, and a table is added to this schema every few weeks: the failure mode is a new
   * `organization_id` column shipping with no policy, which nothing notices because the
   * repository filter still holds and the net was never the thing being tested.
   *
   * So: every table in `public` that names a tenant is expected to have row-level security
   * enabled *and* forced (FORCE also binds the table owner, which the migrations run as), and the
   * exemptions are listed here one by one with the reason each is defensible. A new table is
   * caught by this test on the day it is added.
   */
  // `roles` used to be the third entry here, "exempt for a reason worth fixing rather than a
  // reason it is fine". `20260929090000_roles_row_level_security` fixed it; the tests above are
  // the ones that note asked for. The two that remain are exempt because a policy would make the
  // system worse, not merely because nobody has got to them — each was measured, not assumed.
  const RLS_EXEMPT_TABLES = [
    // Not tenant-owned, and a policy would remove sessions from a revocation sweep.
    //
    // `organization_id` records which organization a session was opened *for*; it is nullable and
    // `RefreshTokenService.issue` defaults it to NULL. The reads that matter — `findByHash` on
    // `/auth/login`, `/auth/refresh`, `/auth/logout`, all `@Public()` — happen before a tenant
    // exists, so a policy would sit on the null-tenant branch and isolate nothing. On the two
    // stamped paths it does harm. Measured with the NULL-admitting policy applied:
    //   * `/auth/switch-organization` runs stamped with the organization being left and inserts a
    //     token for the one being entered → "new row violates row-level security policy".
    //   * `RefreshTokenService.revokeAllForUser` (deactivate a user, change a password) is
    //     `UPDATE ... WHERE user_id = ?` run stamped with the acting tenant: for a user with
    //     sessions in two organizations it revoked 1 of 2 and left the other live.
    'refresh_tokens',
    // Not tenant-owned, and a policy would break client-raised tickets and change requests.
    //
    // Every row belongs to the service provider — `TicketsService.providerId()` and
    // `ChangeRequestsService.providerId()` resolve the provider and the counter is upserted under
    // that id — but a client raising work from the portal bumps it while the connection is
    // stamped with the *client's* tenant, on which `app_tenant_is_provider()` is false. Measured
    // with the org-scoped policy applied and the tenant set to a client organization: the table
    // reads as empty and the increment matches 0 rows, after which the upsert falls through to an
    // INSERT the WITH CHECK rejects. With the provider the only owner of any row, and every
    // policy in this schema already granting the provider everything, there is nothing to isolate.
    'organization_counters',
  ];

  it('has row-level security on every table that names a tenant', async () => {
    const rows = await asTenant(
      undefined,
      () =>
        prisma.$queryRaw<Array<{ table: string; enabled: boolean; forced: boolean }>>`
        SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND EXISTS (
                 SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid
                    AND NOT a.attisdropped
                    AND a.attname IN ('organization_id', 'client_organization_id'))
         ORDER BY c.relname`,
    );
    // A sanity check on the query itself: an empty answer would make the assertion below pass
    // while proving nothing. There are 79 such tables today.
    expect(rows.length).toBeGreaterThan(70);

    const unprotected = rows
      .filter((row) => !row.enabled || !row.forced)
      .map((row) => row.table)
      .filter((table) => !RLS_EXEMPT_TABLES.includes(table));
    expect(unprotected).toEqual([]);

    // And the exemption list does not rot: each entry is still a table that names a tenant.
    expect(rows.map((row) => row.table)).toEqual(expect.arrayContaining(RLS_EXEMPT_TABLES));
  });
});
