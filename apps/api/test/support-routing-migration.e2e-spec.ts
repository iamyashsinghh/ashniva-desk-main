import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Client } from 'pg';

/**
 * The support-configuration tables have to arrive the same way on a new installation and on a
 * running one, and they have to arrive protected.
 *
 * All four are provider-internal: a rota, an attendance state and an on-call roster are staff
 * records, and none of them has a client-visible branch at all. That is enforced in SQL, so this
 * file reads the policies back out of the catalogue rather than trusting the migration text —
 * a policy written with a client branch would never show up in an API test run as the provider.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

const ALL_MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((entry) => /^\d{14}_/.test(entry))
  .sort();

const PACKAGE_8A_MIGRATION = '20260909090000_support_ownership_and_availability';

/** The tables package 8a introduces. Written out rather than derived: the point is to state them. */
const TABLES = [
  'user_work_schedules',
  'user_availability',
  'on_call_schedule',
  'support_ownership',
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

async function assertShape(db: Client): Promise<void> {
  for (const table of TABLES) {
    expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
  }

  // Enabled is not enough: without FORCE the policies do not apply to the table owner, and the
  // application connects as a role that would then read every tenant's rows.
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
}

describe('Support-configuration migration — a fresh installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('sr_fresh'));
    await apply(db, ALL_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('creates all four tables with forced row-level security', async () => {
    await assertShape(db);
  });

  it('gives none of them a client-visible branch', async () => {
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
      // No `organization_id = app_tenant_id()` branch to widen later: a client tenant must not be
      // able to read staff rotas even in principle.
      expect({
        table,
        clientBranch: expression.includes('organization_id = app_tenant_id()'),
      }).toEqual({ table, clientBranch: false });
    }
  });
});

describe('Support-configuration migration — an existing installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('sr_upgrade'));
    // Everything that came *before* this one, not everything except it: a later migration may
    // depend on the tables this one creates, and applying the future first would be a shape of
    // upgrade no installation ever performs.
    await apply(db, ALL_MIGRATIONS.slice(0, ALL_MIGRATIONS.indexOf(PACKAGE_8A_MIGRATION)));
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: false });
    }
    await apply(db, [PACKAGE_8A_MIGRATION]);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('adds the tables to a populated schema without touching anything else', async () => {
    await assertShape(db);
  });

  it('drops nothing: the migration is additive from end to end', () => {
    const sql = readFileSync(
      path.join(MIGRATIONS_DIR, PACKAGE_8A_MIGRATION, 'migration.sql'),
      'utf8',
    ).toUpperCase();
    for (const statement of [
      'DROP TABLE',
      'DROP COLUMN',
      'DROP CONSTRAINT',
      'TRUNCATE',
      'DELETE FROM',
    ]) {
      expect({ statement, present: sql.includes(statement) }).toEqual({
        statement,
        present: false,
      });
    }
  });
});
