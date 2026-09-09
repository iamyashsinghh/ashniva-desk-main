-- Re-issue the application role's grants on a database restored from a dump.
--
-- **Why this file exists.** `pg_dump --no-privileges` deliberately omits GRANTs, so that a dump
-- restores into a database whose roles are named differently. That is the right flag, and
-- `docs/backup-and-restore.md` §2 is right to use it. What it costs is the `ashniva_app` grants,
-- and those are not optional: `TenantAwarePool` issues `SET ROLE ashniva_app` on every connection
-- checkout, because that role is `NOBYPASSRLS` and is therefore the thing that makes row-level
-- security apply at all. Without the grants the application connects, sets the role, and then
-- every query fails with `permission denied for table users`.
--
-- The obvious answer — "the migrations recreate them" — does not hold for a restore. The dump
-- includes `_prisma_migrations`, so a restored database reports every migration as already
-- applied and `prisma migrate deploy` correctly does nothing. The grants never come back.
--
-- This was found by running the drill in `docs/backup-and-restore.md` §5 against a real dump: the
-- restore reported success, every row count matched, RLS and all 104 policies were present, and
-- the API still could not read a single table.
--
-- **When to run it.** After `pg_restore`, before pointing an API instance at the database. It is
-- idempotent — safe to run twice, safe to run on a database that already has the grants — so it
-- costs nothing to run it whenever you are unsure.
--
--   psql --host "$PGHOST" --username "$PGUSER" --dbname ashniva_desk_restored \
--     --file apps/api/prisma/sql/grant-app-role.sql
--
-- Keep this in step with the grant block in
-- `prisma/migrations/20260905202714_row_level_security/migration.sql`. It is a deliberate copy
-- rather than a shared file: a migration is a historical record and must never change, whereas
-- this has to describe the schema as it is now.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ashniva_app') THEN
    CREATE ROLE ashniva_app NOLOGIN NOBYPASSRLS;
  END IF;
  -- The connecting user must be allowed to SET ROLE to the application role. On a restore into a
  -- differently-named role this is the line that matters most.
  EXECUTE format('GRANT ashniva_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO ashniva_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ashniva_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ashniva_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ashniva_app;

-- So that anything a later migration creates is covered too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashniva_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ashniva_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ashniva_app;
