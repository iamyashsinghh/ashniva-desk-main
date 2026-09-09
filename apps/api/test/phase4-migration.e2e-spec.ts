import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Client } from 'pg';

/**
 * Phase 4's tables have to arrive the same way on a new installation and on a running one.
 *
 * A schema change that only works from empty is a change nobody can deploy, and one that only
 * works as an upgrade is one no new tenant can install. Both directions are proved here on
 * throwaway databases, because the development database has already been migrated and so can
 * answer neither question.
 *
 * The row-level-security assertions are the reason this file is not merely a smoke test. Ten of
 * the twelve new tables are provider-internal and two are client-visible, and the difference is
 * enforced in SQL rather than in a service. If a policy is missing, a client tenant reads a
 * staging credential; if the UAT branch is written too widely, a client reads another client's
 * testing. Neither would show up in an ordinary API test run as the provider.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

/** Every migration directory, in the order Prisma applies them. */
const ALL_MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((entry) => /^\d{14}_/.test(entry))
  .sort();

/**
 * Every Phase 4 migration, in order.
 *
 * Kept as a list rather than a prefix match so that adding one and forgetting it here is a
 * failure rather than a silent hole — the "before Phase 4" baseline is built by removing exactly
 * these, and a migration left in it would run against tables that do not exist yet.
 */
const PHASE_4_MIGRATIONS = [
  '20260907090000_phase4_testing_and_releases',
  '20260907091000_phase4_row_level_security',
  '20260907092000_phase4_grant_assignment_link',
  '20260907093000_phase4_uat_comments',
];

/** The tables Phase 4 introduces. Written out rather than derived: the point is to state them. */
const PHASE_4_TABLES = [
  'testing_assignments',
  'test_results',
  'test_environments',
  'test_accounts',
  'credential_grants',
  'credential_access_log',
  'releases',
  'release_items',
  'release_approvals',
  'release_history',
  'project_release_policy',
  'uat_requests',
  'uat_comments',
];

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

async function createDisposableDatabase(
  label: string,
): Promise<{ db: Client; drop: () => Promise<void> }> {
  const name = `ashniva_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await withAdmin((admin) => admin.query(`CREATE DATABASE "${name}"`));
  const db = new Client({ connectionString: serverUrl(name) });
  await db.connect();
  return {
    db,
    drop: async () => {
      await db.end();
      await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    },
  };
}

function migrationSql(name: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
}

async function apply(db: Client, names: string[]): Promise<void> {
  for (const name of names) {
    await db.query(migrationSql(name));
  }
}

/**
 * A Phase 3 installation: every migration up to, but not including, the first Phase 4 one.
 *
 * Deliberately a prefix of the list rather than "everything except the four", which is what this
 * was until package 11 arrived. A later migration is allowed to depend on a Phase 4 table —
 * `rca_reports.introduced_by_release_id` points at `releases`, which is exactly the link an RCA
 * needs — and removing only the Phase 4 four would have run that migration against a `releases`
 * table that does not exist yet. Taking a prefix says what the comment below always claimed: stop
 * at the moment before Phase 4, and stay correct however many migrations land after it.
 */
const firstPhase4 = ALL_MIGRATIONS.indexOf(PHASE_4_MIGRATIONS[0] as string);
const beforePhase4 = ALL_MIGRATIONS.slice(0, firstPhase4);

/** The four must be consecutive and in this order, or the baseline above is not what it says. */
if (
  firstPhase4 < 0 ||
  ALL_MIGRATIONS.slice(firstPhase4, firstPhase4 + 4).join() !== PHASE_4_MIGRATIONS.join()
) {
  throw new Error('The Phase 4 migrations are no longer a consecutive run; fix this baseline.');
}

async function tableExists(db: Client, table: string): Promise<boolean> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = $1`,
    [table],
  );
  return rows[0]?.count === '1';
}

describe('Phase 4 migrations — a fresh installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('p4_fresh'));
    await apply(db, ALL_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('creates every Phase 4 table', async () => {
    for (const table of PHASE_4_TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
  });

  it('protects every one of them with forced row-level security', async () => {
    // Enabled is not enough: without FORCE the policies do not apply to the table owner, and the
    // application connects as a role that would then read every tenant's rows.
    const { rows } = await db.query<{ relname: string; enabled: boolean; forced: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [PHASE_4_TABLES],
    );

    expect(rows).toHaveLength(PHASE_4_TABLES.length);
    for (const row of rows) {
      expect({ table: row.relname, enabled: row.enabled, forced: row.forced }).toEqual({
        table: row.relname,
        enabled: true,
        forced: true,
      });
    }
  });

  it('gives a test account no client-visible branch at all', async () => {
    // The strongest statement this file makes. A staging password must be unreachable by a client
    // tenant even in principle, so the policy has no `= app_tenant_id()` branch to widen later.
    const { rows } = await db.query<{ expr: string }>(
      `SELECT pg_get_expr(polqual, polrelid) AS expr
         FROM pg_policy WHERE polrelid = 'test_accounts'::regclass`,
    );
    const expression = rows[0]?.expr ?? '';
    expect(expression).toContain('app_tenant_is_provider');
    expect(expression).not.toContain('organization_id = app_tenant_id()');
  });

  it('lets a client reach its own UAT request and its own UAT assignment only', async () => {
    const uat = await db.query<{ expr: string }>(
      `SELECT pg_get_expr(polqual, polrelid) AS expr
         FROM pg_policy WHERE polrelid = 'uat_requests'::regclass`,
    );
    expect(uat.rows[0]?.expr ?? '').toContain('client_organization_id = app_tenant_id()');

    const assignments = await db.query<{ expr: string }>(
      `SELECT pg_get_expr(polqual, polrelid) AS expr
         FROM pg_policy WHERE polrelid = 'testing_assignments'::regclass`,
    );
    const expression = assignments.rows[0]?.expr ?? '';
    // Scoped by kind as well as by tenant: the client branch must not reach QA, retest or live
    // verification, whose rows carry no client organization at all.
    expect(expression).toContain('client_organization_id = app_tenant_id()');
    expect(expression).toContain('UAT');
  });

  it('has an index behind every foreign key the release detail reads', async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'release_items'`,
    );
    expect(rows.map((row) => row.indexname).join(' ')).toContain('release_id');
  });
});

describe('Phase 4 migrations — upgrading an existing Phase 3 installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('p4_upgrade'));
    // Stop one migration short of Phase 4, so this database is exactly a Phase 3 installation.
    await apply(db, beforePhase4);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('starts from an installation that has none of the Phase 4 tables', async () => {
    for (const table of PHASE_4_TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: false });
    }
  });

  it('adds them without disturbing the rows already there', async () => {
    // A representative Phase 3 row, written before the upgrade and read back after it.
    const organizationId = randomUUID();
    await db.query(
      `INSERT INTO organizations (id, name, slug, type, is_service_provider, updated_at)
       VALUES ($1, 'Upgrade Fixture', $2, 'OWN_GROUP', true, now())`,
      [organizationId, `upgrade-${organizationId.slice(0, 8)}`],
    );
    const permissionsBefore = await db.query<{ count: string }>(
      'SELECT count(*)::text FROM permissions',
    );

    await apply(db, PHASE_4_MIGRATIONS);

    for (const table of PHASE_4_TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
    const survivor = await db.query<{ name: string }>(
      'SELECT name FROM organizations WHERE id = $1',
      [organizationId],
    );
    expect(survivor.rows[0]?.name).toBe('Upgrade Fixture');

    const permissionsAfter = await db.query<{ count: string }>(
      'SELECT count(*)::text FROM permissions',
    );
    expect(permissionsAfter.rows[0]?.count).toBe(permissionsBefore.rows[0]?.count);
  }, 120_000);

  it('needed no new permission rows, because Phase 3 already shipped them', async () => {
    // The nine qa/release/uat keys were defined and migrated in 20260906200000. Phase 4 gives them
    // something to guard; it does not introduce a key, and so cannot depend on a seed to activate
    // one. This asserts that rather than trusting it.
    const { rows } = await db.query<{ key: string }>(
      `SELECT key FROM permissions
        WHERE key LIKE 'qa:%' OR key LIKE 'release:%' OR key LIKE 'test-%' OR key = 'uat:decide'
        ORDER BY key`,
    );
    expect(rows.map((row) => row.key)).toEqual([
      'qa:assign',
      'qa:record-result',
      'qa:verify-live',
      'release:approve',
      'release:manage',
      'release:publish',
      'test-account:manage',
      'test-credential:reveal',
      'uat:decide',
    ]);
  });
});
