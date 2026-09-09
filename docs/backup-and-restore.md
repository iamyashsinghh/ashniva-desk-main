# Backup and restore

PostgreSQL holds every record; object storage holds every attachment and invoice PDF. Losing
either loses the product. Redis holds queued and scheduled work and is not backed up — see §6.

An untested backup is not a backup. §5 is the drill; put it in the calendar.

---

## 1. What has to be backed up

| | Contents | If lost |
| --- | --- | --- |
| **PostgreSQL** | everything: users, projects, tickets, contracts, invoices, audit log | Total. There is no other copy |
| **Object storage** | file attachments, invoice PDFs | Every attachment 404s; the database still lists them |
| **Secret store** | `APP_ENCRYPTION_KEY`, JWT secrets, storage and database credentials | See §3 — the encryption key is unrecoverable |
| Redis | queues, job schedules | Recoverable. §6 |

### The encryption key is part of the backup

Integration credentials (git tokens, AI endpoint keys, IVR and SMTP credentials) are stored
encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM, `SecretCipherService`). **A database restored
without that key cannot decrypt any of them**, and there is no recovery — every integration has to
be reconfigured by hand, with credentials nobody may still have.

Store the key where the database backups are stored, and restore them together.

---

## 2. Taking a backup

### PostgreSQL

Use the custom format. It restores selectively and in parallel; plain SQL does neither.

```bash
export PGPASSWORD=...        # never on the command line
pg_dump \
  --host "$PGHOST" --username "$PGUSER" --dbname ashniva_desk \
  --format=custom --compress=9 --no-owner --no-privileges \
  --file "ashniva_desk-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

`--no-owner --no-privileges` so the dump restores into a database whose roles are named
differently. The row-level-security policies are part of the schema and do come back with the
dump.

**The `ashniva_app` grants do not, and `migrate deploy` will not bring them back.** The dump
includes `_prisma_migrations`, so a restored database reports every migration as already applied
and `migrate deploy` correctly does nothing — which means the grants that migration issued are
simply absent. The application sets `SET ROLE ashniva_app` on every connection, so it then fails
every query with `permission denied for table users`. §4.3 is the step that fixes this, and it is
not optional.

Verify the dump is readable before you trust it — a truncated file lists nothing:

```bash
pg_restore --list ashniva_desk-<stamp>.dump | tail -5
```

**Recommended schedule:** a full dump nightly, plus continuous WAL archiving (or your managed
provider's point-in-time recovery) if the business cannot lose a day of work. A nightly dump alone
means an RPO of up to 24 hours; say that number out loud and check somebody agrees with it.

### Object storage

Mirror the bucket somewhere the production credential cannot reach:

```bash
mc alias set prod   "$STORAGE_ENDPOINT" "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY"
mc alias set backup "$BACKUP_ENDPOINT" "$BACKUP_ACCESS_KEY" "$BACKUP_SECRET_KEY"
mc mirror --overwrite prod/ashniva-desk-prod backup/ashniva-desk-prod-$(date -u +%Y%m%d)
```

Better, where the provider supports it: enable **object versioning** and a lifecycle rule. A
deletion through the API is a real `DeleteObjectCommand`, and versioning is the only thing that
survives one.

### Retention

| Kind | Keep | Where |
| --- | --- | --- |
| Nightly database dump | 30 days | Off the database host, different credential |
| Weekly database dump | 12 weeks | Different region or provider |
| Object-storage mirror | 30 days | Different credential from production |
| `APP_ENCRYPTION_KEY` and JWT secrets | current + previous | Secret store, versioned |

Backups must not be readable by the production credentials. A compromise that can delete the
backups is a compromise that ends the company.

---

## 3. Before you restore

Answer, and write down:

1. **Which backup?** The most recent one *before* the damage — not the most recent one.
2. **What is lost?** Everything written after it. Name it: "tickets raised since 02:00".
3. **Do you have the matching `APP_ENCRYPTION_KEY`?** If not, integrations will need
   reconfiguring; find out now, not afterwards.
4. **Which image tag matches this schema?** Restoring a Wednesday database under Friday's code
   fails on the first query against a column the dump does not have.
5. **Who has decided?** A restore discards customer work. It is not an engineer's call alone.

---

## 4. Restoring

### 4.1 Stop the writers

```bash
# scale the API to zero — every instance, including the ones that only run jobs
```

Restoring underneath a running API produces a database that disagrees with itself: half the rows
from the dump, half written by jobs that kept going.

### 4.2 Restore into a new database

Never over the live one. The damaged database is evidence and may be the only place a lost record
still exists.

```bash
createdb --host "$PGHOST" --username "$PGUSER" ashniva_desk_restored

pg_restore \
  --host "$PGHOST" --username "$PGUSER" --dbname ashniva_desk_restored \
  --no-owner --no-privileges --jobs 4 \
  ashniva_desk-<stamp>.dump
```

`--jobs 4` restores in parallel; drop it if the host is small.

### 4.3 Re-issue the application role's grants

**Do this before starting an API instance.** The dump carried no GRANTs (§2), so the restored
database is unreadable by the application until they are re-issued. The script is idempotent.

```bash
psql --host "$PGHOST" --username "$PGUSER" --dbname ashniva_desk_restored \
  --file apps/api/prisma/sql/grant-app-role.sql
```

Confirm it took:

```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'ashniva_app';
-- four rows: SELECT, INSERT, UPDATE, DELETE. No rows means the API will not start working.
```

### 4.4 Check what you restored

```sql
SELECT count(*) FROM users;
SELECT count(*) FROM tickets;
SELECT max(created_at) FROM audit_logs;   -- how far the data actually reaches
SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;
```

The last `audit_logs` timestamp is the honest answer to "what did we lose".

### 4.5 Point the API at it and start one instance

Change `DATABASE_URL` to the restored database. Start **one** instance with the image tag that
matches the schema, and watch it:

```bash
curl -fsS https://<api-host>/api/v1/health | jq .
```

`migrate deploy` runs on start. Against a restored database of the same release it finds nothing
to do — which is correct, and is also exactly why §4.3 exists: a no-op `migrate deploy` re-issues
no grants. If it *does* apply migrations, you restored an older schema than the running image —
stop and go back to §3 question 4.

### 4.6 Restore the files

If object storage was lost too, mirror the backup back **before** letting users in; otherwise every
attachment 404s and people file bugs about it.

```bash
mc mirror --overwrite backup/ashniva-desk-prod-<date> prod/ashniva-desk-prod
```

### 4.7 Scale up, then tell people

Bring instances back one at a time, checking readiness between each. Then tell the affected
customers what window of work was lost. They will find out anyway; hearing it from you is the
difference between an incident and a scandal.

---

## 5. The restore drill

**Quarterly, in the calendar, with a named owner.** A backup nobody has restored is a hypothesis.

1. Take the most recent nightly dump.
2. Restore it into a scratch database on the staging host (§4.2).
3. Point a staging API at it, with the matching image tag.
4. Sign in as a real user. Open a ticket. Download an attachment.
5. Record: how long it took end to end, and anything that surprised you.
6. Drop the scratch database.

If step 5's number is larger than the recovery time you have promised anyone, that is the finding.
Fix the number or fix the promise.

### 5.1 The drill has been run once, and it found something

**2026-09-08, against a seeded database on a single host** (PostgreSQL 16, 4 vCPU, everything
co-located — so the *timings* below are not a staging estimate; the *findings* are).

| Step | Result |
| --- | --- |
| `pg_dump --format=custom --compress=9` of 47 applied migrations, 8 organizations, 24 users, 11 projects, 57 tasks, 28 tickets | 863 KB, under 1 s |
| `pg_restore --jobs 4` into a new database | 1 s |
| Row counts, migration count | identical to source, every table |
| RLS | 100 tables enabled, 100 forced, 104 policies, 0 tables with RLS and no policy |
| `app_tenant_id` / `app_user_id` / `app_tenant_is_provider` | present |
| Referential integrity | 386 foreign keys restored |
| `TESTER` holding `release:approve` | 0 rows, as on the source |
| `prisma migrate status` | "Database schema is up to date!" |
| `prisma migrate diff` | empty migration — no drift |
| **API start and sign-in** | **failed: `permission denied for table users`** |

Everything a checklist would normally verify passed, and the database was still unusable. The
cause is in §2 and the fix is §4.3: `--no-privileges` drops the `ashniva_app` grants, and because
`_prisma_migrations` comes back with the dump, `migrate deploy` is a no-op and never re-issues
them. After running `apps/api/prisma/sql/grant-app-role.sql` (1 s), sign-in succeeded and
`/auth/me`, `/projects`, `/tasks`, `/tickets` and `/dashboard` all returned 200.

**Two things worth taking from this.** A restore that verifies only counts, schema and migration
state proves nothing about whether the application can use the result — step 4 of the drill, signing
in, is the step that matters. And the drill is worth repeating on staging with a
production-sized database, because the timings above say nothing about a 50 GB restore.

### 5.2 Not yet drilled

- **Object storage.** §4.6 has not been exercised; only PostgreSQL has.
- **A production-sized dataset.** The rehearsal above is small enough that every step was
  sub-second.
- **`APP_ENCRYPTION_KEY` recovery.** §3's claim — that a database restored without the key cannot
  decrypt stored integration credentials — has not been tested by restoring without it.

---

## 6. Redis, and why it is not backed up

Redis holds BullMQ's queues and job schedules. Losing it costs:

- **queued jobs** — outbound messages waiting to send, summaries waiting to generate. Lost.
- **job schedules** — recreated automatically: every API instance re-registers its schedulers at
  startup, and `QueueSchedulerRegistrar` retries until they land.
- **failed-job history** — the retained failures. Diagnostic only.

Nothing in Redis is a system of record. After a Redis loss:

1. Confirm `GET /api/v1/health` reports `queues` as `up` on every instance (this is what proves the
   schedules came back). If not, restart one instance.
2. Look for outbound messages stuck in a claimed state: the stalled-send sweep on the `messaging`
   queue closes them within 15 minutes and records that delivery is unknown.
3. Nothing else. Do not attempt to reconstruct queues by hand.
