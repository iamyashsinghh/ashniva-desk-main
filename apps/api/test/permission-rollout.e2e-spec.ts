import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import {
  ALL_PERMISSION_KEYS,
  ALL_ROLE_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_KEYS,
  ROLE_LABELS,
  type PermissionKey,
  type RoleKey,
} from '@ashniva/types';
import { Client } from 'pg';
import request from 'supertest';

import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * A permission that exists only in the seed is a permission that does not exist in production.
 *
 * The seed is a development tool: `seed-roles.ts` deletes every grant on a system role and writes
 * the defaults back, which is exactly what nobody wants pointed at a live database. So the rows
 * that decide who may open a Phase 3 screen have to arrive the way every other production change
 * arrives — in a migration.
 *
 * This file proves the migration does that, on throwaway databases built to look like an existing
 * Phase 2 installation and like a fresh one.
 *
 * The HTTP block at the end is a different claim and worth naming as such: it runs against the
 * ordinary development database, whose rows the seed wrote, so it proves the *guards* honour a
 * role's grants — not that the migration is what put them there. The migration's own evidence is
 * the throwaway databases above, which are never seeded.
 */

/**
 * The permissions Phase 3 introduces. Written out rather than derived, because the point of the
 * test is to state what should appear; deriving it from the same constant the migration is
 * generated from would assert nothing.
 */
const PHASE_3_PERMISSIONS: readonly PermissionKey[] = [
  'integration:read',
  'integration:manage',
  'repository:read',
  'repository:manage',
  'release-note:read',
  'release-note:write',
  'release-note:approve',
  'release-note:publish',
  'communication:manage',
  'invoice:read',
  'invoice:write',
  'invoice:issue',
  'invoice:void',
  'payment:read',
  'payment:record',
  'ai-summary:read',
  'ai-summary:generate',
  'ai-summary:approve',
];

/** The last migration that shipped in Phase 2. Everything after it is what an upgrade applies. */
const LAST_PHASE_2_MIGRATION = '20260905202714_row_level_security';

/**
 * The last migration that shipped before package 11. Everything after it is what this branch adds,
 * and therefore what is still *pending* on an installation that has been deployed from elsewhere.
 */
const LAST_PRE_PACKAGE_11_MIGRATION = '20260914092000_invoice_void_wording';

/**
 * A grant a later migration takes away, and the statement that takes it away.
 *
 * Written out here rather than read from the other branch's file, because the point of the check is
 * that *this* branch's migrations survive a revocation they cannot see. The real one is
 * `20260918090200_tester_release_approve_revoked`; if that file changes shape, this stays a
 * faithful stand-in for what any revocation does — one grant, system role only.
 */
const REVOCATION_SQL = `
  DELETE FROM role_permissions rp
  USING roles r, permissions p
  WHERE rp.role_id = r.id
    AND rp.permission_id = p.id
    AND r.key = 'TESTER'
    AND r.is_system = true
    AND r.organization_id IS NULL
    AND p.key = 'release:approve';
`;

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'prisma', 'migrations');

function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
}

/**
 * Every migration that writes permission rows, in the order a deployment applies them.
 *
 * Re-runnability is a property of the rollout, not of one file in it. A generated migration is
 * additive by construction, so a default that later turns out to be wrong can only be undone by a
 * migration that comes after it — and re-running the earlier file alone would put the wrong
 * default straight back. What a restored backup or a hand-run actually replays is the chain, so
 * that is what the re-run tests replay.
 *
 * Bounded to what shipped after Phase 2: the two earlier files that mention `role_permissions`
 * also create the table, and re-running DDL is a different question.
 */
const PERMISSION_ROLLOUT_MIGRATIONS = migrationNames().filter(
  (name) =>
    name > LAST_PHASE_2_MIGRATION &&
    /INSERT INTO permissions|DELETE FROM role_permissions/.test(migrationSql(name)),
);

const PHASE_2_PERMISSIONS = ALL_PERMISSION_KEYS.filter((key) => !PHASE_3_PERMISSIONS.includes(key));

// ---------------------------------------------------------------------------------------------
// Throwaway databases
// ---------------------------------------------------------------------------------------------

function serverUrl(database: string): string {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${database}`;
  url.search = '';
  return url.toString();
}

async function withAdmin<T>(fn: (admin: Client) => Promise<T>): Promise<T> {
  const admin = new Client({ connectionString: serverUrl('postgres') });
  await admin.connect();
  try {
    return await fn(admin);
  } finally {
    await admin.end();
  }
}

/**
 * Creates a database, hands back a client connected to it, and a disposer that drops it.
 * The name carries a random suffix so a crashed run cannot collide with the next one, and the
 * disposer only ever drops the database this function created.
 */
async function createDisposableDatabase(
  label: string,
): Promise<{ db: Client; name: string; drop: () => Promise<void> }> {
  const name = `ashniva_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await withAdmin((admin) => admin.query(`CREATE DATABASE "${name}"`));
  const db = new Client({ connectionString: serverUrl(name) });
  await db.connect();
  return {
    db,
    name,
    drop: async () => {
      await db.end();
      await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    },
  };
}

async function applyMigrations(db: Client, names: string[]): Promise<void> {
  for (const name of names) {
    await db.query(migrationSql(name));
  }
}

// ---------------------------------------------------------------------------------------------
// A representative Phase 2 installation
// ---------------------------------------------------------------------------------------------

/** A description somebody edited by hand, to prove the migration leaves an existing row alone. */
const EDITED_DESCRIPTION = 'Reworded locally — the migration must not put this back';

interface Phase2Fixture {
  organizationId: string;
  userId: string;
  customRoleId: string;
}

async function buildPhase2Installation(db: Client): Promise<Phase2Fixture> {
  await db.query(
    `INSERT INTO permissions (id, key, description, created_at)
     SELECT gen_random_uuid(), k.key, k.description, NOW()
     FROM unnest($1::text[], $2::text[]) AS k(key, description)`,
    [
      PHASE_2_PERMISSIONS,
      PHASE_2_PERMISSIONS.map((key) =>
        key === PERMISSIONS.TASK_READ ? EDITED_DESCRIPTION : PERMISSION_DESCRIPTIONS[key],
      ),
    ],
  );

  await db.query(
    `INSERT INTO roles (id, organization_id, key, name, is_system, audience, created_at, updated_at)
     SELECT gen_random_uuid(), NULL, r.key, r.name, true, 'INTERNAL', NOW(), NOW()
     FROM unnest($1::text[], $2::text[]) AS r(key, name)`,
    [ALL_ROLE_KEYS, ALL_ROLE_KEYS.map((key) => ROLE_LABELS[key])],
  );

  // Only the grants Phase 2 knew about: the Phase 3 keys do not exist yet.
  const grantRoles: string[] = [];
  const grantPermissions: string[] = [];
  for (const roleKey of ALL_ROLE_KEYS) {
    for (const permissionKey of DEFAULT_ROLE_PERMISSIONS[roleKey]) {
      if (PHASE_2_PERMISSIONS.includes(permissionKey)) {
        grantRoles.push(roleKey);
        grantPermissions.push(permissionKey);
      }
    }
  }
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id
     FROM unnest($1::text[], $2::text[]) AS g(role_key, permission_key)
     JOIN roles r ON r.key = g.role_key AND r.organization_id IS NULL
     JOIN permissions p ON p.key = g.permission_key`,
    [grantRoles, grantPermissions],
  );

  const organizationId = randomUUID();
  const userId = randomUUID();
  const customRoleId = randomUUID();

  await db.query(
    `INSERT INTO organizations (id, name, slug, type, is_service_provider, created_at, updated_at)
     VALUES ($1, 'Existing Customer', 'existing-customer', 'OWN_GROUP', true, NOW(), NOW())`,
    [organizationId],
  );
  await db.query(
    `INSERT INTO users (id, email, name, status, created_at, updated_at)
     VALUES ($1, 'existing@example.com', 'Existing User', 'ACTIVE', NOW(), NOW())`,
    [userId],
  );

  // A tenant's own role, with a grant set somebody chose. Nothing in a deployment may widen it —
  // and nothing may narrow it either: `release:approve` is here precisely because this branch
  // takes that permission off the *system* tester role, and a tenant who deliberately gave it to
  // their own role must keep it.
  await db.query(
    `INSERT INTO roles (id, organization_id, key, name, is_system, template_key, audience, created_at, updated_at)
     VALUES ($1, $2, 'CUSTOM_AUDITOR', 'Auditor', false, 'DEVELOPER', 'INTERNAL', NOW(), NOW())`,
    [customRoleId, organizationId],
  );
  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, p.id FROM permissions p WHERE p.key = ANY($2::text[])`,
    [customRoleId, [PERMISSIONS.TASK_READ, PERMISSIONS.PROJECT_READ, PERMISSIONS.RELEASE_APPROVE]],
  );

  await db.query(
    `INSERT INTO organization_memberships (id, organization_id, user_id, role_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())`,
    [organizationId, userId, customRoleId],
  );

  return { organizationId, userId, customRoleId };
}

// ---------------------------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------------------------

interface Snapshot {
  permissions: Array<{ id: string; key: string; description: string }>;
  grants: Array<{ role_key: string; organization_id: string | null; permission_key: string }>;
  roles: Array<{
    id: string;
    key: string;
    name: string;
    audience: string;
    is_system: boolean;
  }>;
  users: Array<{ id: string; email: string }>;
  memberships: Array<{ id: string; role_id: string; user_id: string }>;
}

// One connection, so the queries run one after another rather than being pipelined.
async function snapshot(db: Client): Promise<Snapshot> {
  const permissions = await db.query('SELECT id, key, description FROM permissions ORDER BY key');
  const grants =
    await db.query(`SELECT r.key AS role_key, r.organization_id, p.key AS permission_key
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id
     ORDER BY r.key, r.organization_id NULLS FIRST, p.key`);
  // `name` and `audience` are here so a rename or an audience change is visible: the migration
  // promises it only sets them on insert, and a snapshot without them cannot see it break that.
  const roles = await db.query(
    'SELECT id, key, name, audience::text AS audience, is_system FROM roles ORDER BY key, organization_id NULLS FIRST',
  );
  const users = await db.query('SELECT id, email FROM users ORDER BY email');
  const memberships = await db.query(
    'SELECT id, role_id, user_id FROM organization_memberships ORDER BY id',
  );
  return {
    permissions: permissions.rows,
    grants: grants.rows,
    roles: roles.rows,
    users: users.rows,
    memberships: memberships.rows,
  };
}

function grantsFor(snap: Snapshot, roleKey: string): string[] {
  return snap.grants.filter((row) => row.role_key === roleKey).map((row) => row.permission_key);
}

// ---------------------------------------------------------------------------------------------

describe('upgrading a Phase 2 database to Phase 3', () => {
  let db: Client;
  let drop: () => Promise<void>;
  let fixture: Phase2Fixture;
  let before: Snapshot;
  let after: Snapshot;

  const phase3Migrations = migrationNames().filter((name) => name > LAST_PHASE_2_MIGRATION);

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('phase2_upgrade'));
    await applyMigrations(
      db,
      migrationNames().filter((name) => name <= LAST_PHASE_2_MIGRATION),
    );
    fixture = await buildPhase2Installation(db);
    before = await snapshot(db);
    await applyMigrations(db, phase3Migrations);
    after = await snapshot(db);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('starts from an installation that has none of the Phase 3 permissions', () => {
    expect(before.permissions).toHaveLength(PHASE_2_PERMISSIONS.length);
    for (const key of PHASE_3_PERMISSIONS) {
      expect(before.permissions.some((row) => row.key === key)).toBe(false);
    }
  });

  it('creates every Phase 3 permission', () => {
    for (const key of PHASE_3_PERMISSIONS) {
      const row = after.permissions.find((entry) => entry.key === key);
      expect(row).toBeDefined();
      expect(row?.description).toBe(PERMISSION_DESCRIPTIONS[key]);
    }
    expect(after.permissions).toHaveLength(ALL_PERMISSION_KEYS.length);
  });

  it('gives each system role exactly the permissions the application expects of it', () => {
    for (const roleKey of ALL_ROLE_KEYS) {
      expect(new Set(grantsFor(after, roleKey))).toEqual(
        new Set(DEFAULT_ROLE_PERMISSIONS[roleKey]),
      );
    }
  });

  it('grants the new keys to the roles that should have them, and to no others', () => {
    // A developer may read a repository; only a manager may connect one. If the migration granted
    // the whole set to everyone this assertion is what fails.
    expect(grantsFor(after, ROLE_KEYS.DEVELOPER)).toContain(PERMISSIONS.REPOSITORY_READ);
    expect(grantsFor(after, ROLE_KEYS.DEVELOPER)).not.toContain(PERMISSIONS.REPOSITORY_MANAGE);
    expect(grantsFor(after, ROLE_KEYS.DEVELOPER)).not.toContain(PERMISSIONS.INVOICE_READ);
    expect(grantsFor(after, ROLE_KEYS.PROJECT_MANAGER)).toContain(PERMISSIONS.INVOICE_ISSUE);

    // Intersect and expect empty, not `expect.not.arrayContaining`. The latter passes as soon as
    // *one* element of the sample is missing, so it would have accepted a role holding 17 of the
    // 18 new permissions — including `invoice:void` — while reading like a negative-space check.
    //
    // Client roles reach billing through the portal, which is scoped by membership rather than by
    // a permission. Handing them an internal permission would open the internal endpoints too.
    for (const roleKey of [
      ROLE_KEYS.INTERNAL_EMPLOYEE,
      ROLE_KEYS.CLIENT_ADMIN,
      ROLE_KEYS.CLIENT_EMPLOYEE,
    ]) {
      expect(
        grantsFor(after, roleKey).filter((key) =>
          PHASE_3_PERMISSIONS.includes(key as PermissionKey),
        ),
      ).toEqual([]);
    }
  });

  /**
   * The two workflow grants this branch changed, checked by name.
   *
   * The assertions above compare each role against `DEFAULT_ROLE_PERMISSIONS`, so they would move
   * with the constant if somebody changed it back. These say what the answer is supposed to be.
   */
  it('gives a project manager qa:verify-live and takes release:approve off testers', () => {
    // A release manager signing off the deployment they watched go out is the ordinary case, and
    // the QA workflow rules said so before anybody could act on it.
    expect(grantsFor(after, ROLE_KEYS.PROJECT_MANAGER)).toContain(PERMISSIONS.QA_VERIFY_LIVE);
    // A project that wants QA's signature names the QA_LEAD approver role; the permission on every
    // tester by default made that role decorative.
    expect(grantsFor(after, ROLE_KEYS.TESTER)).not.toContain(PERMISSIONS.RELEASE_APPROVE);
    expect(grantsFor(after, ROLE_KEYS.PROJECT_MANAGER)).toContain(PERMISSIONS.RELEASE_APPROVE);
    expect(grantsFor(after, ROLE_KEYS.TEAM_LEAD)).toContain(PERMISSIONS.RELEASE_APPROVE);
    // …and the tester keeps everything testing needs.
    expect(grantsFor(after, ROLE_KEYS.TESTER)).toEqual(
      expect.arrayContaining([PERMISSIONS.QA_RECORD_RESULT, PERMISSIONS.QA_VERIFY_LIVE]),
    );
  });

  it('leaves every permission row that already existed exactly as it was', () => {
    for (const row of before.permissions) {
      expect(after.permissions).toContainEqual(row);
    }
  });

  it('does not put back a description somebody edited', () => {
    const taskRead = after.permissions.find((row) => row.key === PERMISSIONS.TASK_READ);
    expect(taskRead?.description).toBe(EDITED_DESCRIPTION);
  });

  it('leaves the tenant’s custom role and its grants untouched', () => {
    const custom = after.grants.filter((row) => row.organization_id === fixture.organizationId);
    // Including `release:approve`, which the revocation takes off the system tester role only.
    expect(custom.map((row) => row.permission_key).sort()).toEqual(
      [PERMISSIONS.PROJECT_READ, PERMISSIONS.RELEASE_APPROVE, PERMISSIONS.TASK_READ].sort(),
    );
    expect(after.roles.find((row) => row.id === fixture.customRoleId)?.is_system).toBe(false);
  });

  it('leaves users, roles and memberships alone', () => {
    expect(after.users).toEqual(before.users);
    expect(after.roles).toEqual(before.roles);
    expect(after.memberships).toEqual(before.memberships);
  });

  it('changes nothing when the deployment runs again', async () => {
    // `prisma migrate deploy` skips a migration it has already recorded, so re-running a deployment
    // normally re-applies nothing at all. Re-executing the SQL itself is the stronger check: it is
    // what a restored backup, a re-baselined history or a hand-run would do.
    await applyMigrations(db, PERMISSION_ROLLOUT_MIGRATIONS);
    await applyMigrations(db, PERMISSION_ROLLOUT_MIGRATIONS);
    expect(await snapshot(db)).toEqual(after);
  });
});

describe('a fresh database', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('fresh_chain'));
    await applyMigrations(db, migrationNames());
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('has every permission after migrating, with no seed run', async () => {
    const { rows } = await db.query<{ key: string }>('SELECT key FROM permissions');
    expect(new Set(rows.map((row) => row.key))).toEqual(new Set(ALL_PERMISSION_KEYS));
  });

  it('has every system role, with no seed run', async () => {
    const { rows } = await db.query<{ key: string }>(
      'SELECT key FROM roles WHERE organization_id IS NULL AND is_system = true',
    );
    expect(new Set(rows.map((row) => row.key))).toEqual(new Set(ALL_ROLE_KEYS));
  });

  it('has the default grants, with no seed run', async () => {
    const snap = await snapshot(db);
    for (const roleKey of ALL_ROLE_KEYS) {
      expect(new Set(grantsFor(snap, roleKey))).toEqual(new Set(DEFAULT_ROLE_PERMISSIONS[roleKey]));
    }
  });

  it('leaves the permission rollout re-runnable', async () => {
    const before = await snapshot(db);
    await applyMigrations(db, PERMISSION_ROLLOUT_MIGRATIONS);
    expect(await snapshot(db)).toEqual(before);
  });
});

/**
 * A deployment that took another branch's revocation before it took this branch's migrations.
 *
 * Every other case in this file replays the migrations in sorted order, which is the order a fresh
 * database sees and the order the repository lists them in. It is not the order a real deployment
 * uses. `prisma migrate deploy` applies whatever is *pending*, and two branches that land on
 * different days leave a later-timestamped migration already applied while earlier-timestamped ones
 * are still waiting — so a file generated from the defaults as they were can run *after* a
 * hand-written migration that corrected them, and re-grant what was corrected. `ON CONFLICT DO
 * NOTHING` is no protection: the row has been deleted, so the insert succeeds.
 *
 * Reverse order is the cheapest arrangement that has that shape. What has to hold is that no
 * migration this branch adds restores the revoked grant, whichever order the pending ones run in.
 *
 * Only the *grant-writing* half is reversed. Reversing the schema half too would put a migration
 * that indexes a table before the migration that creates it, and `prisma migrate deploy` cannot
 * produce that: it always applies pending migrations in timestamp order, and what differs between
 * two installations is *which* of them are still pending, never the order they run in. The
 * adversarial thing here is the order grants land in — so the schema is built forwards, the
 * revocation lands on top of it, and only the grants are replayed backwards.
 */
describe('a revocation from another branch, applied before this branch’s migrations', () => {
  let db: Client;
  let drop: () => Promise<void>;

  const pending = migrationNames().filter((name) => name > LAST_PRE_PACKAGE_11_MIGRATION);
  const writesGrants = (name: string) => PERMISSION_ROLLOUT_MIGRATIONS.includes(name);
  const pendingGrants = pending.filter(writesGrants);

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('revocation_order'));
    await applyMigrations(
      db,
      migrationNames().filter((name) => name <= LAST_PRE_PACKAGE_11_MIGRATION),
    );
    await applyMigrations(
      db,
      pending.filter((name) => !writesGrants(name)),
    );
    await db.query(REVOCATION_SQL);
    await applyMigrations(db, [...pendingGrants].reverse());
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('has migrations of its own to apply, so the case is not vacuous', () => {
    expect(pending.length).toBeGreaterThan(0);
    // …and grant-writing ones among them, which are the half actually reversed above.
    expect(pendingGrants.length).toBeGreaterThan(0);
  });

  it('does not give a tester back release:approve', async () => {
    const snap = await snapshot(db);
    expect(grantsFor(snap, ROLE_KEYS.TESTER)).not.toContain(PERMISSIONS.RELEASE_APPROVE);
  });

  it('does not give it back when the permission migrations run again either', async () => {
    // The same files a restored backup or a re-baselined history would re-execute, this time in
    // sorted order. Once revoked, the grant must stay revoked however often they run.
    for (const name of pending) {
      if (migrationSql(name).includes('INSERT INTO permissions')) {
        await db.query(migrationSql(name));
      }
    }
    const snap = await snapshot(db);
    expect(grantsFor(snap, ROLE_KEYS.TESTER)).not.toContain(PERMISSIONS.RELEASE_APPROVE);
  });

  it('still applies the rest of the file — the revocation is one grant, not a veto', async () => {
    const snap = await snapshot(db);
    // One grant per branch whose permission migration is in the replayed set — package 11's and
    // the support platform's — so this stays a check on the files, not on whichever branch wrote
    // the suite. And the roles that should keep release:approve still do.
    expect(grantsFor(snap, ROLE_KEYS.TESTER)).toContain(PERMISSIONS.PROBLEM_READ);
    expect(grantsFor(snap, ROLE_KEYS.PROJECT_MANAGER)).toContain(PERMISSIONS.SUPPORT_TIER_MANAGE);
    expect(grantsFor(snap, ROLE_KEYS.PROJECT_MANAGER)).toContain(PERMISSIONS.RELEASE_APPROVE);
  });
});

describe('the migrations and the application constants', () => {
  /**
   * Every permission migration's SQL, concatenated.
   *
   * Not one named migration. A permission added in a later package ships in a later migration —
   * package 8c's product keys are the first to do so — and a check pinned to a single file would
   * report that legitimate arrangement as a missing row. What actually has to hold is that a key
   * in `packages/types` appears in *some* migration, which is what this reads.
   */
  const permissionMigrations = migrationNames().filter((name) =>
    migrationSql(name).includes('INSERT INTO permissions'),
  );
  const permissionMigrationSql = permissionMigrations.map((name) => migrationSql(name)).join('\n');

  it('has a migration row for every permission the application defines', () => {
    // A future phase that adds a key to `packages/types` without adding it to a migration would
    // ship a screen that 403s until somebody reseeds. This is the check that stops that.
    for (const key of ALL_PERMISSION_KEYS) {
      expect(permissionMigrationSql).toContain(`('${key}', `);
    }
  });

  it('has a migration row for every system role', () => {
    for (const roleKey of ALL_ROLE_KEYS) {
      expect(permissionMigrationSql).toContain(`('${roleKey}', '${ROLE_LABELS[roleKey]}')`);
    }
  });

  it('has a migration row for every default grant', () => {
    for (const roleKey of ALL_ROLE_KEYS) {
      for (const permissionKey of DEFAULT_ROLE_PERMISSIONS[roleKey]) {
        expect(permissionMigrationSql).toContain(`('${roleKey}', '${permissionKey}')`);
      }
    }
  });

  it('touches system roles only, and inserts conflict-free', () => {
    // Per migration rather than over the concatenation: the destructive-statement check only
    // means anything about a file that is *entirely* a permission migration.
    expect(permissionMigrations.length).toBeGreaterThan(0);
    for (const name of permissionMigrations) {
      const sql = migrationSql(name);
      expect({ name, guarded: sql.includes('ON CONFLICT (key) DO NOTHING') }).toEqual({
        name,
        guarded: true,
      });
      expect({
        name,
        guarded: sql.includes('ON CONFLICT (role_id, permission_id) DO NOTHING'),
      }).toEqual({ name, guarded: true });
      expect({ name, guarded: sql.includes('WHERE NOT EXISTS') }).toEqual({ name, guarded: true });
      expect({ name, systemOnly: sql.includes('r.is_system = true') }).toEqual({
        name,
        systemOnly: true,
      });
      expect({ name, systemOnly: sql.includes('r.organization_id IS NULL') }).toEqual({
        name,
        systemOnly: true,
      });
      // Anchored to the start of a line, because `client-update:publish` is a permission key and
      // an unanchored search for "update" finds it in half the rows.
      expect({
        name,
        destructive: /^\s*(DELETE|UPDATE|TRUNCATE|DROP|ALTER)\b/im.test(sql),
      }).toEqual({ name, destructive: false });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The guards, over HTTP, against the real application database
// ---------------------------------------------------------------------------------------------

/** One list endpoint per Phase 3 feature, with the permission its guard demands. */
const PHASE_3_ENDPOINTS: ReadonlyArray<{ path: string; permission: PermissionKey }> = [
  { path: '/api/v1/integrations', permission: PERMISSIONS.INTEGRATION_READ },
  { path: '/api/v1/release-notes', permission: PERMISSIONS.RELEASE_NOTE_READ },
  { path: '/api/v1/invoices', permission: PERMISSIONS.INVOICE_READ },
  { path: '/api/v1/payments', permission: PERMISSIONS.PAYMENT_READ },
  { path: '/api/v1/ai-summaries', permission: PERMISSIONS.AI_SUMMARY_READ },
];

const ROLE_ACCOUNTS: ReadonlyArray<{ roleKey: RoleKey; email: string }> = [
  { roleKey: ROLE_KEYS.PROJECT_MANAGER, email: DEMO.pm },
  { roleKey: ROLE_KEYS.TEAM_LEAD, email: DEMO.lead },
  { roleKey: ROLE_KEYS.DEVELOPER, email: DEMO.developer },
  { roleKey: ROLE_KEYS.TESTER, email: DEMO.tester },
  { roleKey: ROLE_KEYS.SUPPORT_EXECUTIVE, email: DEMO.support },
  { roleKey: ROLE_KEYS.INTERNAL_EMPLOYEE, email: DEMO.employee },
];

/**
 * Guard behaviour, against the seeded development database.
 *
 * Not evidence for the migration — see the note at the top of this file. What it does establish is
 * that a role's default grants and the guards agree, since the expectation for each case is read
 * from `DEFAULT_ROLE_PERMISSIONS` rather than written out.
 */
describe('Phase 3 endpoints, per standard role', () => {
  let app: INestApplication;
  const sessions = new Map<RoleKey, Session>();

  beforeAll(async () => {
    app = await createTestApp();
    for (const account of ROLE_ACCOUNTS) {
      sessions.set(account.roleKey, await loginAs(app, account.email));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  for (const account of ROLE_ACCOUNTS) {
    for (const endpoint of PHASE_3_ENDPOINTS) {
      // The expectation comes from the same constant the migration is generated from, so a role
      // whose grants drift from the defaults fails here rather than at a customer.
      const allowed = DEFAULT_ROLE_PERMISSIONS[account.roleKey].includes(endpoint.permission);
      const verb = allowed ? 'reaches' : 'is refused';

      it(`${account.roleKey} ${verb} ${endpoint.path}`, async () => {
        const session = sessions.get(account.roleKey)!;
        const response = await request(app.getHttpServer())
          .get(endpoint.path)
          .set('Authorization', bearer(session));

        if (allowed) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(403);
        }
      });
    }
  }

  /**
   * The repository picker takes a provider in the query string and would talk to GitHub, so this
   * one is checked at the guard rather than through the handler: the guard runs first, and a
   * refusal is a 403 whatever the handler would have done next.
   */
  it('refuses the repository picker to a role without repository:manage', async () => {
    for (const roleKey of [ROLE_KEYS.DEVELOPER, ROLE_KEYS.TESTER, ROLE_KEYS.INTERNAL_EMPLOYEE]) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/git/repositories?provider=GITHUB')
        .set('Authorization', bearer(sessions.get(roleKey)!));
      expect(response.status).toBe(403);
    }
  });

  it('lets a project manager past the guard on the repository picker', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/git/repositories?provider=GITHUB')
      .set('Authorization', bearer(sessions.get(ROLE_KEYS.PROJECT_MANAGER)!));
    expect(response.status).not.toBe(403);
  });

  it('carries the Phase 3 permissions in the session the API issues', () => {
    const session = sessions.get(ROLE_KEYS.PROJECT_MANAGER)!;
    expect(session.body.user.permissions).toEqual(
      expect.arrayContaining([
        PERMISSIONS.INVOICE_READ,
        PERMISSIONS.AI_SUMMARY_READ,
        PERMISSIONS.RELEASE_NOTE_READ,
      ]),
    );
  });
});
