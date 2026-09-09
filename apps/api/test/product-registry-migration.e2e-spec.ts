import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PERMISSIONS } from '@ashniva/types';
import { Client } from 'pg';

/**
 * The registry's tables and its two permissions have to arrive on a new installation and on a
 * running one, and they have to arrive protected.
 *
 * The permission half matters as much as the schema half. A permission that only the seed creates
 * returns 403 in production, so the rows come from a migration — and this checks the migration
 * actually contains them rather than trusting that somebody remembered to regenerate it.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

const ALL_MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((entry) => /^\d{14}_/.test(entry))
  .sort();

const SCHEMA_MIGRATION = '20260911090000_product_registry_and_support_ingress';
const PERMISSION_MIGRATION = '20260911091000_product_permissions';

const TABLES = [
  'products',
  'product_credentials',
  'external_requesters',
  'support_ingress_requests',
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

describe('Product registry migration — a fresh installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('pr_fresh'));
    await apply(db, ALL_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('creates all four tables with forced row-level security', async () => {
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
      expect({
        table,
        clientBranch: expression.includes('organization_id = app_tenant_id()'),
      }).toEqual({ table, clientBranch: false });
    }
  });

  it('activates both product permissions as data, not as seed', async () => {
    const { rows } = await db.query<{ key: string }>(
      `SELECT key FROM permissions WHERE key = ANY($1::text[])`,
      [[PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_MANAGE]],
    );
    expect(rows.map((row) => row.key).sort()).toEqual(['product:manage', 'product:read']);
  });

  it('grants product administration to super admin and the project manager', async () => {
    const { rows } = await db.query<{ role_key: string }>(
      `SELECT r.key AS role_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = $1 AND r.organization_id IS NULL`,
      [PERMISSIONS.PRODUCT_MANAGE],
    );
    const roles = rows.map((row) => row.role_key);
    expect(roles).toContain('SUPER_ADMIN');
    expect(roles).toContain('PROJECT_MANAGER');
    // A developer must not be able to mint a standing key into ticket creation.
    expect(roles).not.toContain('DEVELOPER');
  });

  it('keeps the credential secret out of the schema entirely', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'product_credentials'`,
    );
    const columns = rows.map((row) => row.column_name);
    // A hash, and nothing reversible: there is no ciphertext column to decrypt.
    expect(columns).toContain('secret_hash');
    expect(columns).not.toContain('secret_ciphertext');
    expect(columns).not.toContain('secret');
  });
});

describe('Product registry migration — an existing installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('pr_upgrade'));
    // Everything that came before, then this package's two migrations — the upgrade a running
    // installation actually performs.
    await apply(db, ALL_MIGRATIONS.slice(0, ALL_MIGRATIONS.indexOf(SCHEMA_MIGRATION)));
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: false });
    }
    await apply(db, [SCHEMA_MIGRATION, PERMISSION_MIGRATION]);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('adds the tables to a populated schema', async () => {
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
  });

  it('leaves every existing ticket untouched and unattached to any product', async () => {
    const { rows } = await db.query<{ is_nullable: string; column_default: string | null }>(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'product_id'`,
    );
    // Nullable with no default: a ticket raised before this package did not come from a product,
    // and the upgrade must not pretend otherwise.
    expect(rows[0]).toMatchObject({ is_nullable: 'YES', column_default: null });
  });

  it('drops nothing: both migrations are additive from end to end', () => {
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
