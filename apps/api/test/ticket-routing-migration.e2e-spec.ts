import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Client } from 'pg';

/**
 * The routing tables have to arrive the same way on a new installation and on a running one, and
 * they have to arrive protected.
 *
 * The trail is the reason this file exists rather than a smoke test. It names people who were
 * passed over and says why — that one developer is on leave, that another is at their limit — and
 * a client tenant must not be able to read it even in principle. That is enforced in SQL, so the
 * policies are read back out of the catalogue rather than trusted from the migration text.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

const ALL_MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((entry) => /^\d{14}_/.test(entry))
  .sort();

const PACKAGE_8B_MIGRATION = '20260910090000_support_routing_engine';

const TABLES = ['ticket_routing_state', 'ticket_routing_trail'];

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

  const { rows } = await db.query<{ relname: string; enabled: boolean; forced: boolean }>(
    `SELECT c.relname, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    [TABLES],
  );
  expect(rows).toHaveLength(TABLES.length);
  for (const row of rows) {
    // Enabled is not enough: without FORCE the policies do not apply to the table owner, which is
    // the role the application connects as.
    expect({ table: row.relname, enabled: row.enabled, forced: row.forced }).toEqual({
      table: row.relname,
      enabled: true,
      forced: true,
    });
  }
}

describe('Support-routing migration — a fresh installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('rt_fresh'));
    await apply(db, ALL_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('creates both tables with forced row-level security', async () => {
    await assertShape(db);
  });

  it('gives neither of them a client-visible branch', async () => {
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
      expect({
        table,
        clientBranch: expression.includes('organization_id = app_tenant_id()'),
      }).toEqual({ table, clientBranch: false });
    }
  });

  it('activates the three ticket statuses routing needs', async () => {
    const { rows } = await db.query<{ label: string }>(
      `SELECT e.enumlabel AS label FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TicketStatus'`,
    );
    const labels = rows.map((row) => row.label);
    for (const status of ['AUTO_ASSIGNED', 'ACKNOWLEDGED', 'ESCALATED']) {
      expect({ status, present: labels.includes(status) }).toEqual({ status, present: true });
    }
  });
});

describe('Support-routing migration — an existing installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('rt_upgrade'));
    // Everything that came *before* this one, not everything except it: a later migration may
    // depend on the tables this one creates, and applying the future first would be a shape of
    // upgrade no installation ever performs.
    await apply(db, ALL_MIGRATIONS.slice(0, ALL_MIGRATIONS.indexOf(PACKAGE_8B_MIGRATION)));
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: false });
    }
    await apply(db, [PACKAGE_8B_MIGRATION]);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('adds the tables to a populated schema', async () => {
    await assertShape(db);
  });

  it('gives every existing project automatic routing rather than silently switching it off', async () => {
    const { rows } = await db.query<{ column_default: string; is_nullable: string }>(
      `SELECT column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'support_ownership' AND column_name = 'auto_route_enabled'`,
    );
    // A project that configured support ownership meant it to be used; defaulting to off would
    // quietly stop routing for every installation that upgrades.
    expect(rows[0]).toMatchObject({ column_default: 'true', is_nullable: 'NO' });
  });

  it('drops nothing: the migration is additive from end to end', () => {
    const sql = readFileSync(
      path.join(MIGRATIONS_DIR, PACKAGE_8B_MIGRATION, 'migration.sql'),
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
