import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PERMISSIONS } from '@ashniva/types';
import { Client } from 'pg';

/**
 * The nine problem, RCA and incident tables, and their protection.
 *
 * The property being proved here is the one the application tests cannot reach: **no table in this
 * package has a client-visible branch at all.** §19.2 is explicit that a client may never see
 * another client's ticket through a problem, so the policies have no `= app_tenant_id()` arm that
 * a later edit could widen — and a client tenant reading each table directly, with no WHERE
 * clause, gets nothing back.
 *
 * The four permissions are checked for the same reason the earlier packages check theirs: a
 * permission that only the seed creates returns 403 in production, so the migration has to
 * contain it rather than somebody having remembered to regenerate the seed.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

const ALL_MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((entry) => /^\d{14}_/.test(entry))
  .sort();

const SCHEMA_MIGRATION = '20260915090000_package11_problems_incidents_rca';
const PERMISSION_MIGRATION = '20260915091000_package11_permissions';
/**
 * The notification type the crossed threshold sends.
 *
 * In its own file because permission-rollout migrations must be purely additive inserts, and
 * `permission-rollout.e2e-spec` enforces that by refusing any ALTER in a file that inserts
 * permissions. An `ALTER TYPE … ADD VALUE` is worth having and is not worth weakening that rule
 * for, so it lives here instead — visible, named and narrow.
 */
const NOTIFICATION_MIGRATION = '20260915092000_package11_threshold_notification';

const PACKAGE_MIGRATIONS = [SCHEMA_MIGRATION, PERMISSION_MIGRATION, NOTIFICATION_MIGRATION];

const TABLES = [
  'similarity_matches',
  'problems',
  'problem_tickets',
  'problem_questions',
  'rca_reports',
  'rca_actions',
  'incidents',
  'incident_timeline_entries',
  'incident_links',
];

const NEW_PERMISSIONS = [
  PERMISSIONS.INCIDENT_MANAGE,
  PERMISSIONS.INCIDENT_READ,
  PERMISSIONS.PROBLEM_ADD_PREVENTIVE_TEST,
  PERMISSIONS.PROBLEM_READ,
].sort();

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

async function apply(db: Client, names: string[]): Promise<void> {
  for (const name of names) {
    await db.query(readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
  }
}

async function tableExists(db: Client, table: string): Promise<boolean> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = $1`,
    [table],
  );
  return rows[0]?.count === '1';
}

describe('Package 11 migration — a fresh installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('p11_fresh'));
    await apply(db, ALL_MIGRATIONS);
  }, 180_000);

  afterAll(async () => {
    await drop();
  });

  it('creates all nine tables with forced row-level security', async () => {
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
    const { rows } = await db.query<{ relname: string; enabled: boolean; forced: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [TABLES],
    );
    expect(rows).toHaveLength(TABLES.length);
    for (const row of rows) {
      expect({ table: row.relname, enabled: row.enabled, forced: row.forced }).toEqual({
        table: row.relname,
        enabled: true,
        forced: true,
      });
    }
  });

  /**
   * One policy per table, and it goes through the provider check.
   *
   * Deliberately not a search of the policy text for the *absence* of a client branch. Reading
   * `app_tenant_id()` and `=` out of an expression and calling their co-occurrence a client branch
   * is a claim the string cannot support — a policy written `IS NOT DISTINCT FROM`, or one
   * admitting a client through a parent table, passes it while being exactly what it was written
   * to catch. The behavioural test below is the one that falsifies, so this one only states what a
   * string can honestly state: there is one policy, and it consults the provider helper.
   */
  it('gives each of the nine a single policy, through the provider check', async () => {
    for (const table of TABLES) {
      const { rows } = await db.query<{ expr: string }>(
        `SELECT pg_get_expr(polqual, polrelid) AS expr
           FROM pg_policy WHERE polrelid = $1::regclass`,
        [table],
      );
      expect({ table, policies: rows.length }).toEqual({ table, policies: 1 });
      const expression = rows[0]?.expr ?? '';
      expect({ table, provider: expression.includes('app_tenant_is_provider') }).toEqual({
        table,
        provider: true,
      });
    }
  });

  /**
   * The same claim, made against real rows rather than against the policy text.
   *
   * A policy can read correctly and still be wrong — the wrong helper, a table missing FORCE, a
   * grant that lets the owner past it. Stamping a client tenant on the connection and counting
   * what comes back is the only version of this test that cannot be satisfied by a typo.
   */
  it('shows a client tenant zero rows in every one of the nine', async () => {
    const clientId = randomUUID();
    const providerId = randomUUID();
    const userId = randomUUID();
    await db.query(
      `INSERT INTO organizations (id, name, slug, type, is_service_provider, updated_at)
       VALUES ($1, 'Provider', 'p11-provider', 'OWN_GROUP', true, now()),
              ($2, 'Client', 'p11-client', 'CORPORATE_CUSTOMER', false, now())`,
      [providerId, clientId],
    );
    await db.query(
      `INSERT INTO users (id, email, name, password_hash, status, updated_at)
       VALUES ($1, 'p11@example.com', 'P11', 'x', 'ACTIVE', now())`,
      [userId],
    );
    const problemId = randomUUID();
    const incidentId = randomUUID();
    const ticketId = randomUUID();
    await db.query(
      `INSERT INTO tickets (id, organization_id, client_organization_id, number, title, description, requester_id, updated_at)
       VALUES ($1, $2, $3, 1, 'T', 'D', $4, now())`,
      [ticketId, providerId, clientId, userId],
    );
    await db.query(
      `INSERT INTO problems (id, organization_id, number, title, created_by_id, updated_at)
       VALUES ($1, $2, 1, 'A recurring fault', $3, now())`,
      [problemId, providerId, userId],
    );
    await db.query(
      `INSERT INTO problem_tickets (problem_id, ticket_id, organization_id) VALUES ($1, $2, $3)`,
      [problemId, ticketId, providerId],
    );
    await db.query(
      `INSERT INTO problem_questions (id, organization_id, problem_id, body, asked_by_id)
       VALUES ($1, $2, $3, 'Why?', $4)`,
      [randomUUID(), providerId, problemId, userId],
    );
    const rcaId = randomUUID();
    await db.query(
      `INSERT INTO rca_reports (id, organization_id, problem_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [rcaId, providerId, problemId],
    );
    await db.query(
      `INSERT INTO rca_actions (id, organization_id, rca_report_id, kind, description, updated_at)
       VALUES ($1, $2, $3, 'CORRECTIVE', 'Fix it', now())`,
      [randomUUID(), providerId, rcaId],
    );
    await db.query(
      `INSERT INTO similarity_matches (id, organization_id, ticket_id, candidate_ticket_id, score)
       VALUES ($1, $2, $3, $3, 3.0)`,
      [randomUUID(), providerId, ticketId],
    );
    await db.query(
      `INSERT INTO incidents (id, organization_id, number, title, description, started_at, detected_at, created_by_id, updated_at)
       VALUES ($1, $2, 1, 'Down', 'All of it', now(), now(), $3, now())`,
      [incidentId, providerId, userId],
    );
    await db.query(
      `INSERT INTO incident_timeline_entries (id, organization_id, incident_id, kind, body)
       VALUES ($1, $2, $3, 'OPENED', 'Opened')`,
      [randomUUID(), providerId, incidentId],
    );
    await db.query(
      `INSERT INTO incident_links (id, organization_id, incident_id, kind, ticket_id)
       VALUES ($1, $2, $3, 'TICKET', $4)`,
      [randomUUID(), providerId, incidentId, ticketId],
    );

    // As the application role, stamped with the client tenant, exactly as a request is.
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE ashniva_app');
    await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [clientId]);
    for (const table of TABLES) {
      const { rows } = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
      expect({ table, rows: rows[0]?.n }).toEqual({ table, rows: '0' });
    }
    // The client can still see its own ticket, so the zeroes above are the policies working
    // rather than the session being broken.
    const own = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM tickets`);
    expect(own.rows[0]?.n).toBe('1');
    await db.query('ROLLBACK');

    // And the provider sees all nine, so the policies are not simply refusing everybody.
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE ashniva_app');
    await db.query(`SELECT set_config('app.tenant_id', $1, true)`, [providerId]);
    for (const table of TABLES) {
      const { rows } = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
      expect({ table, rows: rows[0]?.n }).toEqual({ table, rows: '1' });
    }
    await db.query('ROLLBACK');
  });

  it('activates the four new permissions as data, not as seed', async () => {
    const { rows } = await db.query<{ key: string }>(
      `SELECT key FROM permissions
        WHERE key IN ('problem:read', 'problem:add-preventive-test', 'incident:read', 'incident:manage')
        ORDER BY key`,
    );
    expect(rows.map((row) => row.key)).toEqual(NEW_PERMISSIONS);
  });

  it('gives no client role any of them', async () => {
    // The reason the four exist at all: every client role already holds `ticket:read`, so reusing
    // it would have handed one client the list of the others.
    const { rows } = await db.query<{ role_key: string; key: string }>(
      `SELECT r.key AS role_key, p.key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = ANY($1::text[]) AND r.key LIKE 'CLIENT%'`,
      [NEW_PERMISSIONS],
    );
    expect(rows).toEqual([]);
  });

  it('gives QA exactly one write on a problem and no more', async () => {
    const { rows } = await db.query<{ key: string }>(
      `SELECT p.key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.key = 'TESTER' AND r.organization_id IS NULL
          AND (p.key LIKE 'problem:%' OR p.key = 'rca:submit')
        ORDER BY p.key`,
    );
    expect(rows.map((row) => row.key)).toEqual([
      'problem:add-preventive-test',
      'problem:read',
      'problem:suggest-duplicate',
    ]);
  });

  it('does not let a support executive submit an analysis', async () => {
    const { rows } = await db.query<{ role_key: string }>(
      `SELECT r.key AS role_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = 'rca:submit' AND r.organization_id IS NULL
        ORDER BY r.key`,
    );
    expect(rows.map((row) => row.role_key)).toEqual(['DEVELOPER', 'SUPER_ADMIN', 'TEAM_LEAD']);
  });

  it('adds the notification type the crossed threshold sends', async () => {
    const { rows } = await db.query<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'NotificationType' AND e.enumlabel = 'PROBLEM_THRESHOLD_REACHED'`,
    );
    // Without it the senior cannot be told at all: the column is an enum, so a type the code
    // knows and the database does not is a failed insert at the moment it matters.
    expect(rows).toHaveLength(1);
  });

  it('keeps the duplicate threshold where the support settings screen already is', async () => {
    const { rows } = await db.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_name = 'support_ownership'
          AND column_name IN ('duplicate_threshold', 'similarity_enabled')
        ORDER BY column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'duplicate_threshold',
      'similarity_enabled',
    ]);
    expect(rows[0]?.column_default).toContain('3');
  });

  it('indexes the keyword array with GIN, because a btree cannot answer overlap', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'tickets'`,
    );
    const definitions = rows.map((row) => row.indexdef);
    expect(definitions.some((def) => /USING gin \(keywords\)/i.test(def))).toBe(true);
    expect(definitions.some((def) => /\(organization_id, fingerprint\)/.test(def))).toBe(true);
  });

  it('leaves the file policy alone, so an RCA attachment stays invisible without touching it', async () => {
    for (const migration of PACKAGE_MIGRATIONS) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, migration, 'migration.sql'), 'utf8');
      expect({ migration, touchesFilePolicy: /POLICY[^;]*ON files/i.test(sql) }).toEqual({
        migration,
        touchesFilePolicy: false,
      });
    }
  });
});

describe('Package 11 migration — an existing installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('p11_upgrade'));
    await apply(db, ALL_MIGRATIONS.slice(0, ALL_MIGRATIONS.indexOf(SCHEMA_MIGRATION)));
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: false });
    }
    await apply(db, PACKAGE_MIGRATIONS);
  }, 180_000);

  afterAll(async () => {
    await drop();
  });

  it('adds the tables to a populated schema', async () => {
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
  });

  it('leaves every existing ticket unmatched rather than guessing at one', async () => {
    const { rows } = await db.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name IN ('keywords', 'fingerprint', 'product_version', 'problem_id')
        ORDER BY column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'fingerprint',
      'keywords',
      'problem_id',
      'product_version',
    ]);
    // No backfill: a fingerprint computed from a description written before the rules existed
    // would be a guess presented as a fact, and the matcher would rank on it.
    const fingerprint = rows.find((row) => row.column_name === 'fingerprint');
    expect(fingerprint?.column_default).toBeNull();
  });

  it('drops no data: the three migrations are additive from end to end', () => {
    for (const migration of PACKAGE_MIGRATIONS) {
      const sql = readFileSync(
        path.join(MIGRATIONS_DIR, migration, 'migration.sql'),
        'utf8',
      ).toUpperCase();
      for (const statement of [
        'DROP TABLE',
        'DROP COLUMN',
        'DROP CONSTRAINT',
        'TRUNCATE',
        'DELETE FROM',
      ]) {
        expect({ migration, statement, present: sql.includes(statement) }).toEqual({
          migration,
          statement,
          present: false,
        });
      }
    }
  });
});
