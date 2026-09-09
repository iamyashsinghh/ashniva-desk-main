/**
 * Emits the SQL for a permission data migration, from the constants in `packages/types`.
 *
 * Permissions and their role grants live in `packages/types` and reach the database through the
 * seed. A seed is a development tool — it rewrites system roles wholesale — so it must never be
 * the thing that activates a permission in production. A migration is what production runs, so
 * the rows have to come from a migration too.
 *
 * Writing that SQL by hand would mean transcribing a hundred key names, so this generates it.
 * Redirect the output into a new timestamped migration, and let
 * `test/permission-rollout.e2e-spec.ts` check that the migrations and the constants still agree —
 * it fails if a key or a default grant has no row in any migration.
 *
 *   pnpm --filter @ashniva/api exec tsx scripts/generate-permission-migration.ts \
 *     > apps/api/prisma/migrations/<timestamp>_<change>/migration.sql
 */
import {
  ALL_PERMISSION_KEYS,
  ALL_ROLE_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_LABELS,
} from '@ashniva/types';

/** Postgres string literal. Doubling a quote is the whole escape rule for a literal. */
function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const permissionRows = ALL_PERMISSION_KEYS.map(
  (key) => `  (${sql(key)}, ${sql(PERMISSION_DESCRIPTIONS[key])})`,
).join(',\n');

const roleRows = ALL_ROLE_KEYS.map((key) => `  (${sql(key)}, ${sql(ROLE_LABELS[key])})`).join(
  ',\n',
);

const grantRows = ALL_ROLE_KEYS.flatMap((roleKey) =>
  DEFAULT_ROLE_PERMISSIONS[roleKey].map(
    (permissionKey) => `  (${sql(roleKey)}, ${sql(permissionKey)})`,
  ),
).join(',\n');

process.stdout.write(`-- Permissions and their default role grants, as data rather than as a seed.
--
-- Everything here is additive and idempotent:
--
--   * permissions are matched on their stable \`key\`, never on an id, and an existing row is left
--     exactly as it is — including its description, in case somebody edited one;
--   * grants are matched on (role key, permission key) and inserted only where the pair is
--     missing, so a grant that already exists is untouched and none is ever removed;
--   * only system roles are touched. A custom role is a tenant's own decision about who may do
--     what, and a deployment has no business editing it.
--
-- Safe to run on a fresh database (nothing exists, so all three statements insert) and on an
-- existing one (the rows are there, so only what is missing appears).

-- ---------------------------------------------------------------------------------------------
-- Every permission the application knows about.
-- ---------------------------------------------------------------------------------------------

INSERT INTO permissions (id, key, description, created_at)
SELECT gen_random_uuid(), v.key, v.description, NOW()
FROM (VALUES
${permissionRows}
) AS v(key, description)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- The system roles.
--
-- \`ux_roles_system_key\` (from the first migration) is a partial unique index over \`key\` where the
-- organization is NULL — exactly the rows this statement inserts — so the conflict target names
-- that predicate. A read-then-write (\`WHERE NOT EXISTS\`) would look equivalent and is not: two
-- deploys racing each other both see no row, both insert, and the loser dies on the index,
-- leaving a failed entry in \`_prisma_migrations\` that blocks every later deploy. Letting the
-- database arbitrate costs nothing.
--
-- A tenant's custom role is untouched: it carries an organization, so the index does not cover it
-- and \`is_system = false\` keeps it out of the grants below.
--
-- \`name\` is only set on insert: renaming a role is a decision somebody made, and a deployment
-- should not undo it. \`audience\` is left to the column default, which is what the seed does too.
-- ---------------------------------------------------------------------------------------------

INSERT INTO roles (id, organization_id, key, name, is_system, created_at, updated_at)
SELECT gen_random_uuid(), NULL, v.key, v.name, true, NOW(), NOW()
FROM (VALUES
${roleRows}
) AS v(key, name)
ON CONFLICT (key) WHERE organization_id IS NULL DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- The default grants, for system roles only.
--
-- \`is_system\` and a NULL organization together identify a system role; a tenant's custom role has
-- an organization and \`is_system = false\`, and is excluded by both conditions.
-- ---------------------------------------------------------------------------------------------

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
${grantRows}
) AS v(role_key, permission_key)
JOIN roles r
  ON r.key = v.role_key
 AND r.is_system = true
 AND r.organization_id IS NULL
 AND r.deleted_at IS NULL
JOIN permissions p
  ON p.key = v.permission_key
ON CONFLICT (role_id, permission_id) DO NOTHING;
`);
