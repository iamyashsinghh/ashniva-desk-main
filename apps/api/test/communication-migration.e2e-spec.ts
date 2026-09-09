import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PERMISSIONS } from '@ashniva/types';
import { Client } from 'pg';

/**
 * The conversation tables, their protection, and the four communication permissions.
 *
 * The property being proved here is the strongest one in the package and the one the application
 * tests cannot reach: **no table in this module has a client-visible branch at all.** An internal
 * conversation has no portal form, so there is nothing for a policy to admit a client to — and if
 * somebody later adds a client mapper, the database still refuses.
 */

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

const ALL_MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((entry) => /^\d{14}_/.test(entry))
  .sort();

const SCHEMA_MIGRATION = '20260913090000_internal_communication';
const PERMISSION_MIGRATION = '20260913091000_conversation_permissions';
const ANCHOR_MIGRATION = '20260913092000_conversation_anchor_key';
/** Added later, when editing a message was given a rule. Applies to an existing installation too. */
const REVISIONS_MIGRATION = '20260916091000_message_revisions';
/** Scope messaging: the two project-less kinds, and the anchor re-based on the tenant. */
const SCOPE_MIGRATION = '20260926090000_messaging_scope_and_groups';

const TABLES = [
  'conversations',
  'conversation_members',
  'messages',
  // Added by 20260916090000: an edit keeps what it replaced, and the kept copy has to live under
  // exactly the same protection as the message it supersedes or it is a second, weaker home for
  // everything anybody ever typed.
  'message_revisions',
  'communication_settings',
  'call_participants',
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

describe('Internal communication migration — a fresh installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('comm_fresh'));
    await apply(db, ALL_MIGRATIONS);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('creates every conversation table with forced row-level security', async () => {
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
      // No `organization_id = app_tenant_id()`, and no reference to a client-facing parent. An
      // internal conversation has no shape a client could be admitted to.
      expect({
        table,
        clientBranch: expression.includes('app_tenant_id()') && expression.includes('='),
      }).toEqual({ table, clientBranch: false });
    }
  });

  it('activates every conversation permission as data, not as seed', async () => {
    const { rows } = await db.query<{ key: string }>(
      `SELECT key FROM permissions WHERE key LIKE 'conversation:%' ORDER BY key`,
    );
    expect(rows.map((row) => row.key)).toEqual([
      'conversation:call',
      'conversation:inspect',
      'conversation:participate',
      // Added with scope messaging. A permission that only the seed creates is a permission that
      // returns 403 in production, so it arrives in a migration like the other five.
      'conversation:reach-organization',
      'conversation:recording-play',
      'conversation:settings-manage',
    ]);
  });

  it('gives tenant-wide messaging reach to the super admin and to nobody else', async () => {
    const { rows } = await db.query<{ role_key: string }>(
      `SELECT r.key AS role_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = $1 AND r.organization_id IS NULL`,
      [PERMISSIONS.CONVERSATION_REACH_ORGANIZATION],
    );
    // Everybody else's reach outside a project is derived from projects and teams, which is how a
    // developer gets none: there is no grant to leave out, there is simply no relation.
    expect(rows.map((row) => row.role_key)).toEqual(['SUPER_ADMIN']);
  });

  it('grants oversight to the super admin and to nobody else', async () => {
    const { rows } = await db.query<{ role_key: string }>(
      `SELECT r.key AS role_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = $1 AND r.organization_id IS NULL`,
      [PERMISSIONS.CONVERSATION_INSPECT],
    );
    expect(rows.map((row) => row.role_key)).toEqual(['SUPER_ADMIN']);
  });

  it('does not give a developer or a tester recording playback', async () => {
    const { rows } = await db.query<{ role_key: string }>(
      `SELECT r.key AS role_key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = $1 AND r.organization_id IS NULL`,
      [PERMISSIONS.CONVERSATION_RECORDING_PLAY],
    );
    const roles = rows.map((row) => row.role_key).sort();
    // Having been on a call is not a reason to be able to listen to it again.
    expect(roles).toEqual(['PROJECT_MANAGER', 'SUPER_ADMIN', 'TEAM_LEAD']);
  });

  it('lets a developer and a tester take part and call, which is the point of two permissions', async () => {
    const { rows } = await db.query<{ role_key: string; key: string }>(
      `SELECT r.key AS role_key, p.key
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key IN ($1, $2) AND r.organization_id IS NULL AND r.key IN ('DEVELOPER','TESTER')`,
      [PERMISSIONS.CONVERSATION_PARTICIPATE, PERMISSIONS.CONVERSATION_CALL],
    );
    expect(rows).toHaveLength(4);
  });

  it('lets a conversation have no project, for the two kinds that have none', async () => {
    for (const table of ['conversations', 'messages']) {
      const { rows } = await db.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'project_id'`,
        [table],
      );
      // Inverted deliberately. It used to be NOT NULL because every kind derived its permission
      // from a project; the two scope kinds derive theirs from a management relationship instead,
      // and a project column filled in with something plausible would be a lie the policy would
      // then be tempted to read.
      expect({ table, nullable: rows[0]?.is_nullable }).toEqual({ table, nullable: 'YES' });
    }

    // The cascade still cascades for the rows that do name a project.
    const { rows: fks } = await db.query<{ confdeltype: string }>(
      `SELECT confdeltype FROM pg_constraint
        WHERE conname = 'conversations_project_id_fkey'`,
    );
    expect(fks[0]?.confdeltype).toBe('c');
  });

  it('enforces one thread per anchor over columns that cannot be null', async () => {
    // The regression this exists for: the first shape of this index spanned the nullable anchor
    // columns, and PostgreSQL treats nulls as distinct — so every kind, each of which leaves at
    // least one of them null, was exempt from the constraint meant to hold it to one thread.
    // Three people opening one task produced two threads. A non-null key is what fixed it.
    //
    // `project_id` becoming nullable is that same trap a second time: `(project_id, anchor_key)`
    // would have stopped enforcing anything for exactly the new kinds. The index therefore spans
    // `(organization_id, anchor_key)` — two columns that can never be null — and the project's id
    // moved into the key for the kinds that have one.
    const { rows: columns } = await db.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'anchor_key'`,
    );
    expect(columns[0]?.is_nullable).toBe('NO');

    const { rows: indexes } = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'conversations' AND indexdef LIKE '%UNIQUE%'`,
    );
    const definitions = indexes.map((row) => row.indexdef);
    expect(definitions.some((def) => /\(organization_id, anchor_key\)/.test(def))).toBe(true);
    // And neither index that could not bite is left suggesting it is still the guard.
    expect(definitions.some((def) => def.includes('direct_key'))).toBe(false);
    expect(definitions.some((def) => /\(project_id, anchor_key\)/.test(def))).toBe(false);
  });

  it('indexes the predicates the busy paths actually use', async () => {
    const { rows } = await db.query<{ tablename: string; indexdef: string }>(
      `SELECT tablename, indexdef FROM pg_indexes
        WHERE tablename IN ('messages', 'conversation_members')`,
    );
    const definitions = rows.map((row) => row.indexdef);
    // Paging a thread is `conversation_id = $1 AND id < $2 ORDER BY id DESC`, and had no index.
    expect(definitions.some((def) => /messages.*\(conversation_id, id DESC\)/.test(def))).toBe(
      true,
    );
    // "The conversations this person is in" cannot use a conversation-first primary key.
    expect(
      definitions.some((def) => /conversation_members.*\(user_id, conversation_id\)/.test(def)),
    ).toBe(true);
  });

  it('makes membership something a person can hold, be given and leave', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'conversation_members'`,
    );
    const columns = rows.map((row) => row.column_name);
    expect(columns).toEqual(
      expect.arrayContaining(['role', 'joined_at', 'left_at', 'added_by_id']),
    );
    // `muted_at` was created with the table and never read or written by anything. A column that
    // has never meant anything is worse than no column, so it is gone rather than left to be
    // rediscovered by the next person to read the schema.
    expect(columns).not.toContain('muted_at');
  });

  it('stores no audio for an internal call', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'call_logs'`,
    );
    const columns = rows.map((row) => row.column_name);
    expect(columns).toContain('recording_ref');
    expect(columns).toContain('conversation_id');
    expect(columns).not.toContain('recording_audio');
  });
});

describe('Internal communication migration — an existing installation', () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('comm_upgrade'));
    await apply(db, ALL_MIGRATIONS.slice(0, ALL_MIGRATIONS.indexOf(SCHEMA_MIGRATION)));
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: false });
    }
    await apply(db, [
      SCHEMA_MIGRATION,
      PERMISSION_MIGRATION,
      ANCHOR_MIGRATION,
      REVISIONS_MIGRATION,
    ]);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('adds the tables to a populated schema', async () => {
    for (const table of TABLES) {
      expect({ table, exists: await tableExists(db, table) }).toEqual({ table, exists: true });
    }
  });

  it('leaves every existing call a support call', async () => {
    const { rows } = await db.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'call_logs' AND column_name = 'kind'`,
    );
    // Package 9's calls were all support calls and stay that way; nothing is reclassified.
    expect(rows[0]?.column_default).toContain('SUPPORT');
  });

  it('relaxes the ticket link without losing one', async () => {
    const { rows } = await db.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'call_logs' AND column_name = 'ticket_id'`,
    );
    // Nullable now, because an internal call belongs to a conversation. Every row that existed
    // still names its ticket — dropping a NOT NULL removes no data.
    expect(rows[0]?.is_nullable).toBe('YES');
  });

  it('drops no data: the migrations are additive from end to end', () => {
    // The anchor migration drops one index — the broken one it replaces, after the working one
    // exists. That is the only DROP in the four, and it removes no row and no column.
    for (const migration of [
      SCHEMA_MIGRATION,
      PERMISSION_MIGRATION,
      ANCHOR_MIGRATION,
      REVISIONS_MIGRATION,
    ]) {
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

/**
 * The anchor re-base, run over threads that already exist.
 *
 * The other two describes build their databases from empty migrations, so the backfill in
 * `20260926090000` runs against nothing and proves nothing. This one puts a project channel, a
 * task thread and a project-anchored direct conversation in *first*, with the keys the old code
 * wrote, and then runs the migration — because the risk of moving a unique index is not that it
 * fails, it is that it silently re-keys a live thread into a different one.
 */
describe('Internal communication migration — threads that already exist', () => {
  let db: Client;
  let drop: () => Promise<void>;

  const ORG = '11111111-1111-4111-8111-111111111111';
  const USER = '22222222-2222-4222-8222-222222222222';
  const PROJECT_A = '33333333-3333-4333-8333-333333333333';
  const PROJECT_B = '44444444-4444-4444-8444-444444444444';

  beforeAll(async () => {
    ({ db, drop } = await createDisposableDatabase('comm_anchor'));
    await apply(db, ALL_MIGRATIONS.slice(0, ALL_MIGRATIONS.indexOf(SCOPE_MIGRATION)));

    await db.query(
      `INSERT INTO organizations (id, name, slug, type, is_service_provider, updated_at)
       VALUES ($1, 'Fixture', 'fixture', 'OWN_GROUP', true, NOW())`,
      [ORG],
    );
    await db.query(
      `INSERT INTO users (id, email, name, status, updated_at)
       VALUES ($1, 'anchor@example.com', 'Anchor', 'ACTIVE', NOW())`,
      [USER],
    );
    for (const [id, code] of [
      [PROJECT_A, 'AAA'],
      [PROJECT_B, 'BBB'],
    ] as const) {
      await db.query(
        `INSERT INTO projects (id, organization_id, code, name, type, status, created_by_id, updated_at)
         VALUES ($1, $2, $3, $3, 'FIXED_PRICE', 'ACTIVE', $4, NOW())`,
        [id, ORG, code, USER],
      );
    }
    // The keys the pre-migration code wrote: a project channel keyed by its kind alone, and a
    // direct conversation keyed by the pair alone. Both were unique only *within* a project.
    await db.query(
      `INSERT INTO conversations
         (id, organization_id, project_id, kind, direct_key, anchor_key, created_by_id, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, 'PROJECT', NULL,  'PROJECT',     $4, NOW()),
         (gen_random_uuid(), $1, $3, 'PROJECT', NULL,  'PROJECT',     $4, NOW()),
         (gen_random_uuid(), $1, $2, 'DIRECT',  'a:b', 'DIRECT:a:b',  $4, NOW()),
         (gen_random_uuid(), $1, $3, 'DIRECT',  'a:b', 'DIRECT:a:b',  $4, NOW())`,
      [ORG, PROJECT_A, PROJECT_B, USER],
    );

    await apply(db, [SCOPE_MIGRATION]);
  }, 120_000);

  afterAll(async () => {
    await drop();
  });

  it('re-keys the two kinds whose key was only unique within a project', async () => {
    const { rows } = await db.query<{ project_id: string; kind: string; anchor_key: string }>(
      `SELECT project_id, kind, anchor_key FROM conversations ORDER BY anchor_key`,
    );
    expect(rows.map((row) => row.anchor_key)).toEqual([
      `DIRECT:${PROJECT_A}:a:b`,
      `DIRECT:${PROJECT_B}:a:b`,
      `PROJECT:${PROJECT_A}`,
      `PROJECT:${PROJECT_B}`,
    ]);
    // Four threads in, four threads out: the two projects' channels did not collide into one.
    expect(rows).toHaveLength(4);
  });

  it('keeps a second thread for the same anchor out, now over the tenant', async () => {
    await expect(
      db.query(
        `INSERT INTO conversations (id, organization_id, project_id, kind, anchor_key, created_by_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'PROJECT', $3, $4, NOW())`,
        [ORG, PROJECT_A, `PROJECT:${PROJECT_A}`, USER],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('admits a conversation with no project, and holds it to one thread per pair', async () => {
    await db.query(
      `INSERT INTO conversations (id, organization_id, project_id, kind, anchor_key, created_by_id, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, 'SCOPE_DIRECT', 'SCOPE_DIRECT:a:b', $2, NOW())`,
      [ORG, USER],
    );
    // The whole point of moving the index: with `(project_id, anchor_key)` this second row would
    // have been admitted, because PostgreSQL treats the two NULLs as distinct.
    await expect(
      db.query(
        `INSERT INTO conversations (id, organization_id, project_id, kind, anchor_key, created_by_id, updated_at)
         VALUES (gen_random_uuid(), $1, NULL, 'SCOPE_DIRECT', 'SCOPE_DIRECT:a:b', $2, NOW())`,
        [ORG, USER],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('keeps every membership, and dates it from when the row was made', async () => {
    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*)::text FROM conversation_members WHERE joined_at <> created_at`,
    );
    expect(rows[0]?.count).toBe('0');
  });
});
