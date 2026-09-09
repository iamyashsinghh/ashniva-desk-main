-- Trigram indexes for the search boxes, so `GET /search` and the thirteen list endpoints behind
-- it stop reading whole tables.
--
-- **What the application actually issues.** Every `search` parameter in Desk is a Prisma
-- `contains` with `mode: 'insensitive'`, which compiles to `column ILIKE '%term%'`, several of
-- them OR-ed together. Nothing anywhere issues a `to_tsvector`/`@@` query — including against
-- `ix_tasks_search`, the GIN full-text index `20260905164744_phase1_core` created for a task
-- search box that was then written with `contains`. That index has never been usable by any
-- query the product sends, and it is left alone here rather than dropped: removing an index is a
-- decision that wants `pg_stat_user_indexes` from a real deployment behind it.
--
-- **Why trigrams and not full text.** Full-text search is faster on whole-word queries and it is
-- the wrong tool here, for two reasons that are not about speed.
--
--   1. A tsquery cannot answer `%term%`. Switching to it means rewriting the query shape in all
--      thirteen repositories — or, worse, only in the search module, which would give the global
--      search a *different* query from the list endpoint it is supposed to mirror. The entire
--      guarantee of `GET /search` is that a group holds exactly what that module's own list would
--      return the same caller; a second query shape is the first crack in that.
--   2. Substrings are what people type here. `to_tsvector('simple', …)` indexes whole words, so
--      "acm" would not find "ACME", "T-31" would not find the ticket, and "2026-0007" would not
--      find the contract. Half the searched columns in this product are identifiers.
--
--   A GIN trigram index serves `ILIKE '%…%'` with the query left exactly as it is. Nothing above
--   the database changes at all.
--
-- **Measured**, on a throwaway database with 200k tasks, `EXPLAIN (ANALYZE, BUFFERS)` on the task
-- search the list endpoint issues (title/description/module ILIKE, one matching row):
--
--   before   116.694 ms   6080 buffers   parallel sequential scan
--   after      0.235 ms     40 buffers   BitmapOr of three trigram index scans
--
-- Take the "after" number from a settled index, not a fresh one. A GIN index buffers new entries
-- in a pending list and only merges them on vacuum, so the same query measured immediately after
-- the bulk load — before autovacuum had been anywhere near the table — read 1238 buffers in
-- 8.310 ms. That is still forty times better than the scan, and it is the number to expect for a
-- few minutes after this migration runs; the 0.235 ms above is the steady state.
--
-- **All the columns of an OR, or none of them.** The plans above are a `BitmapOr`, and PostgreSQL
-- can only build one when *every* branch is indexable: leave `module` out and the whole
-- three-branch OR goes back to a sequential scan. So each table below has an index for every
-- column its own `search` parameter touches, and `organizations.name` is here because contract
-- and invoice search match on the client organization's name through a join.
--
-- **Three characters.** A trigram index cannot serve a pattern shorter than three characters. The
-- same query with a two-character term, with every index below in place, plans a parallel
-- sequential scan and takes 101.516 ms / 5972 buffers — the "before" number, unchanged. `GET /search`
-- refuses anything shorter (SEARCH_MIN_QUERY_LENGTH); the module list endpoints still accept it,
-- and still pay for it, which is the same bill they pay today.
--
-- **Not indexed: `audit_logs` and `ai_summaries`.** Their `search` parameters exist and still
-- scan. Neither is in the global fan-out — audit search matches an action name and an entity id,
-- which is a forensic filter on one screen rather than something a person looks for by name — and
-- `audit_logs` is the highest-write table in the product, where a GIN index is charged to every
-- audited action. If the audit screen becomes slow, that is a measurement to take then.
--
-- **The extension.** `pg_trgm` is trusted from PostgreSQL 13, so the database owner can create it
-- without superuser. A deployment whose migration role owns neither will need an operator to run
-- `CREATE EXTENSION pg_trgm;` once, before deploying; the statement below is `IF NOT EXISTS` so
-- that costs nothing when they have.
--
-- **Deploying this against large tables.** A plain `CREATE INDEX` takes a SHARE lock, which blocks
-- writes to the table until the build finishes, and `prisma migrate deploy` wraps this whole file
-- in one transaction — so the locks below are held together, for the sum of every build, and
-- `tasks` and `tickets` pay longest. `CONCURRENTLY` is the answer and Prisma cannot express it: it
-- is illegal inside a transaction. So for an installation large enough to care — roughly a million
-- rows in any one of these tables — the procedure is the one
-- `20260919090000_soft_delete_partial_indexes` and `20260922090000_list_ordering_indexes`
-- document:
--
--   1. Before deploying, on the primary, outside any transaction, one statement at a time:
--        CREATE EXTENSION IF NOT EXISTS pg_trgm;
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_title_trgm_idx"
--          ON "tasks" USING GIN ("title" gin_trgm_ops);
--      …and the rest, copied from below with CONCURRENTLY added.
--   2. Deploy. `IF NOT EXISTS` makes each statement here a no-op for an index already built.
--
-- Without `IF NOT EXISTS` an operator who took step 1 would meet 42P07 and a failed deployment —
-- which is exactly the person who was being careful. Time the whole file against a restored copy
-- before running it anywhere with real data.
--
-- Written as SQL rather than as Prisma `@@index` attributes for the same reason as the two index
-- migrations named above: Prisma cannot express an operator class without a preview feature, and
-- keeping a family of indexes in one place beats splitting it across two files.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tasks: title, description and module — the task list's search box and the global search.
CREATE INDEX IF NOT EXISTS "tasks_title_trgm_idx" ON "tasks" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "tasks_description_trgm_idx"
  ON "tasks" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "tasks_module_trgm_idx" ON "tasks" USING GIN ("module" gin_trgm_ops);

-- Tickets: title and description. (The numeric branch of ticket search is an equality on
-- `number`, which `tickets_organization_id_number_key` already serves.)
CREATE INDEX IF NOT EXISTS "tickets_title_trgm_idx" ON "tickets" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "tickets_description_trgm_idx"
  ON "tickets" USING GIN ("description" gin_trgm_ops);

-- Projects: name and code.
CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx" ON "projects" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "projects_code_trgm_idx" ON "projects" USING GIN ("code" gin_trgm_ops);

-- Contracts: title and the "CT-2026-0007" label.
CREATE INDEX IF NOT EXISTS "contracts_title_trgm_idx"
  ON "contracts" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "contracts_number_label_trgm_idx"
  ON "contracts" USING GIN ("number_label" gin_trgm_ops);

-- Invoices: the "AD/2026-27/0042" label.
CREATE INDEX IF NOT EXISTS "invoices_number_label_trgm_idx"
  ON "invoices" USING GIN ("number_label" gin_trgm_ops);

-- Organizations: contract and invoice search both match the client company's name through a join,
-- so without this one the OR on either table cannot become a BitmapOr.
CREATE INDEX IF NOT EXISTS "organizations_name_trgm_idx"
  ON "organizations" USING GIN ("name" gin_trgm_ops);

-- Change requests: title and description.
CREATE INDEX IF NOT EXISTS "change_requests_title_trgm_idx"
  ON "change_requests" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "change_requests_description_trgm_idx"
  ON "change_requests" USING GIN ("description" gin_trgm_ops);

-- Problems: title and module.
CREATE INDEX IF NOT EXISTS "problems_title_trgm_idx"
  ON "problems" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "problems_module_trgm_idx"
  ON "problems" USING GIN ("module" gin_trgm_ops);

-- Incidents: title and impact.
CREATE INDEX IF NOT EXISTS "incidents_title_trgm_idx"
  ON "incidents" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "incidents_impact_trgm_idx"
  ON "incidents" USING GIN ("impact" gin_trgm_ops);

-- Approval requests: title and the client-visible summary.
CREATE INDEX IF NOT EXISTS "approval_requests_title_trgm_idx"
  ON "approval_requests" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "approval_requests_summary_trgm_idx"
  ON "approval_requests" USING GIN ("summary" gin_trgm_ops);

-- Releases: version and title.
CREATE INDEX IF NOT EXISTS "releases_version_trgm_idx"
  ON "releases" USING GIN ("version" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "releases_title_trgm_idx"
  ON "releases" USING GIN ("title" gin_trgm_ops);

-- People: name and email, both matched by the Users & teams search box.
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
