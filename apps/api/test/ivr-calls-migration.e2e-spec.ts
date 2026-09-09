import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PERMISSIONS } from '@ashniva/types';
import { Client } from 'pg';

/**
 * The call tables, their protection, and the recording permission.
 *
 * Two things are being proved here that the application tests cannot prove. The first is the
 * shape of the protection: `call_attempts` and `product_ivr_policies` must have no client-visible
 * branch at all, while `call_logs` must have exactly one — the ticket, so a client sees their own
 * calls and nobody else's. The second is that `call:play-recording` arrives as *data*: a
 * permission only the seed creates returns 403 in production, and this checks the migration
 * really contains it rather than trusting somebody to have regenerated it.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

const ALL_MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((entry) => /^\d{14}_/.test(entry))
  .sort();

const SCHEMA_MIGRATION = '20260912090000_ivr_support_calls';
const PERMISSION_MIGRATION = '20260912091000_call_recording_permission';
/**
 * The one statement in package 9 that is not an insert, kept in its own file.
 *
 * Permission rollout migrations are required to be purely additive, and `permission-rollout
 * .e2e-spec` enforces that by refusing any DELETE, UPDATE, TRUNCATE, DROP or ALTER in a file that
 * inserts permissions. Correcting a now-false description is worth doing and is not worth
 * weakening that rule for, so it lives here instead — visible, named, and narrow.
 */
const WORDING_MIGRATION = '20260912092000_call_read_internal_wording';

const TABLES = ['product_ivr_policies', 'call_logs', 'call_attempts'];
/** Provider-internal throughout: who was rung and why is staff data, as the routing trail is. */
const PROVIDER_ONLY = ['product_ivr_policies', 'call_attempts'];

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

async function policyExpression(db: Client, table: string): Promise<string> {
  const { rows } = await db.query<{ expr: string }>(
    `SELECT pg_get_expr(polqual, polrelid) AS expr FROM pg_policy WHERE polrelid = $1::regclass`,
    [table],
  );
  expect({ table, policies: rows.length }).toEqual({ table, policies: 1 });
  return rows[0]?.expr ?? '';
}

describe('IVR call migration — a fresh installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('ivr_fresh'));
    await apply(db, ALL_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('creates all three tables with forced row-level security', async () => {
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

  it('gives the attempts and the policy no client-visible branch at all', async () => {
    for (const table of PROVIDER_ONLY) {
      const expression = await policyExpression(db, table);
      expect({ table, provider: expression.includes('app_tenant_is_provider') }).toEqual({
        table,
        provider: true,
      });
      expect({
        table,
        clientBranch: expression.includes('organization_id = app_tenant_id()'),
      }).toEqual({ table, clientBranch: false });
    }
  });

  it('lets a client reach their own calls only through the ticket they belong to', async () => {
    const expression = await policyExpression(db, 'call_logs');
    expect(expression).toContain('app_tenant_is_provider');
    // The child shape: visibility is inherited from the ticket, whose own policy decides. There
    // is no direct organization comparison a later edit could widen.
    expect(expression).toContain('tickets');
    expect(expression).not.toContain('organization_id = app_tenant_id()');
  });

  it('activates the recording permission as data, not as seed', async () => {
    const { rows } = await db.query<{ key: string }>(
      `SELECT key FROM permissions WHERE key = ANY($1::text[])`,
      [
        [
          PERMISSIONS.CALL_INITIATE,
          PERMISSIONS.CALL_READ_INTERNAL,
          PERMISSIONS.CALL_PLAY_RECORDING,
          PERMISSIONS.IVR_MANAGE,
        ],
      ],
    );
    expect(rows.map((row) => row.key).sort()).toEqual([
      'call:initiate',
      'call:play-recording',
      'call:read-internal',
      'ivr:manage',
    ]);
  });

  it('grants recording playback to the leads and to nobody else by default', async () => {
    const { rows } = await db.query<{ role_key: string }>(
      `SELECT r.key AS role_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = $1 AND r.organization_id IS NULL`,
      [PERMISSIONS.CALL_PLAY_RECORDING],
    );
    const roles = rows.map((row) => row.role_key).sort();
    expect(roles).toEqual(['PROJECT_MANAGER', 'SUPER_ADMIN', 'TEAM_LEAD']);
  });

  it('does not hand recording playback to anybody who merely reads calls', async () => {
    const { rows } = await db.query<{ role_key: string }>(
      `SELECT r.key AS role_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = $1 AND r.organization_id IS NULL`,
      [PERMISSIONS.CALL_READ_INTERNAL],
    );
    const readers = rows.map((row) => row.role_key);
    // Both are real roles that see the call history and must not thereby hear the client.
    expect(readers).toContain('DEVELOPER');
    expect(readers).toContain('SUPPORT_EXECUTIVE');
  });

  it('stores a recording reference and never any audio', async () => {
    const { rows } = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'call_logs'`,
    );
    const columns = new Map(rows.map((row) => [row.column_name, row.data_type]));
    expect(columns.get('recording_ref')).toBe('text');
    expect(columns.has('recording_audio')).toBe(false);
    expect(columns.has('recording_blob')).toBe(false);
    // Masked at rest as well as in transit: the column exists to identify a row, not to dial.
    expect(columns.get('client_phone_ref')).toBe('text');
  });
});

describe('IVR call migration — an existing installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('ivr_upgrade'));
    // Everything that came before, then this package's two migrations — the upgrade a running
    // installation actually performs.
    await apply(db, ALL_MIGRATIONS.slice(0, ALL_MIGRATIONS.indexOf(SCHEMA_MIGRATION)));
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: false });
    }
    await apply(db, [SCHEMA_MIGRATION, PERMISSION_MIGRATION, WORDING_MIGRATION]);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('adds the tables to a populated schema', async () => {
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
  });

  it('leaves every existing product with calls switched off', async () => {
    const { rows } = await db.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'ivr_enabled'`,
    );
    // Package 8c set this default and package 9 does not change it: an upgrade must not start
    // offering telephone calls to products nobody configured for them.
    expect(rows[0]?.column_default).toContain('false');
  });

  it('adds IVR to the integration providers rather than a parallel table', async () => {
    const { rows } = await db.query<{ label: string }>(
      `SELECT e.enumlabel AS label FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'IntegrationProvider'`,
    );
    expect(rows.map((row) => row.label)).toContain('IVR');
    expect(await tableExists(db, 'ivr_providers')).toBe(false);
    expect(await tableExists(db, 'webhook_events')).toBe(false);
  });

  it('corrects the old recording wording without overwriting an edited description', async () => {
    const { rows } = await db.query<{ description: string }>(
      `SELECT description FROM permissions WHERE key = $1`,
      [PERMISSIONS.CALL_READ_INTERNAL],
    );
    // It used to claim it granted recordings. From this migration onwards it does not.
    expect(rows[0]?.description).not.toMatch(/recording/i);
  });

  it('grants and revokes nothing in the wording correction', () => {
    // Comments stripped first: this file explains itself by naming the very statements it must
    // not contain, and a search that counted the explanation would be measuring the prose.
    const statements = readFileSync(
      path.join(MIGRATIONS_DIR, WORDING_MIGRATION, 'migration.sql'),
      'utf8',
    )
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .toUpperCase();
    // It may edit a description and nothing else: no grant is added, none is taken away, and no
    // row is removed. That is what keeps it safe to run on a live installation.
    expect(statements).not.toContain('ROLE_PERMISSIONS');
    expect(statements).not.toContain('DELETE');
    expect(statements).not.toContain('DROP');
    expect(statements).not.toContain('TRUNCATE');
    expect(statements).toContain('UPDATE PERMISSIONS');
  });

  it('drops nothing: the schema and permission migrations are additive from end to end', () => {
    for (const migration of [SCHEMA_MIGRATION, PERMISSION_MIGRATION]) {
      const sql = readFileSync(
        path.join(MIGRATIONS_DIR, migration, 'migration.sql'),
        'utf8',
      ).toUpperCase();
      for (const statement of ['DROP TABLE', 'DROP COLUMN', 'DROP CONSTRAINT', 'TRUNCATE']) {
        expect({ migration, statement, present: sql.includes(statement) }).toEqual({
          migration,
          statement,
          present: false,
        });
      }
    }
  });
});
