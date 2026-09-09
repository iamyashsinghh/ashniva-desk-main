# Rollback procedure

Undoing a release that is making things worse. Read §1 before you need it — the decision it
describes cannot be made well at 2am.

---

## 1. The thing you must know first

**`apps/api/Dockerfile` applies migrations on start.** The entrypoint runs
`prisma migrate deploy` before `node dist/main.js`, so the moment a new image starts, its
migrations are applied. There is no approval step and **no automatic reversal**: Prisma generates
no `down` migration, and `migrate deploy` has no undo.

That splits every rollback into two cases, and which one you are in is decided *before* you deploy,
by what the release's migrations did:

| | Case A — additive migrations | Case B — destructive migrations |
| --- | --- | --- |
| What the migration did | added tables, added nullable columns, added indexes, added enum values | dropped or renamed a column or table, narrowed a type, made a column `NOT NULL`, removed an enum value |
| Old image against the new schema | runs fine — it ignores what it does not know about | breaks, or writes wrong data |
| Rollback | redeploy the previous image. Nothing else | restore the database (§4). Expect data loss |

**Every migration on this branch and every migration to date is Case A.** Keep it that way: the
release checklist asks you to classify migrations before deploying, and a Case B release must ship
its own written reversal, reviewed with the migration.

---

## 2. Decide

Answer these in order. Stop at the first "yes".

1. **Is data being corrupted or lost right now?** → §4, immediately. Every minute of running makes
   the restore lose more.
2. **Is the service down or erroring for most users?** → §3, roll back the image.
3. **Is one feature broken and the rest fine?** → prefer a fix-forward. A rollback of a Case A
   release is cheap, but it also un-ships everything else in it.

Write the time and the decision in the incident channel before you act. `incident-procedure.md`
has the rest of the communication.

---

## 3. Roll back the image (Case A)

The previous image tag is the one recorded in the release checklist for the last good release. If
it is not written down, use the registry's tag list; do not guess from git.

```bash
# 1. Confirm the tag exists before you need it
docker manifest inspect <registry>/ashniva-desk/api:<previous-tag> > /dev/null

# 2. Deploy it — the same command the release used, with the older tag
#    (kubectl set image / docker compose pull && up -d / your platform's equivalent)

# 3. Watch readiness come back
watch -n 2 'curl -fsS https://<api-host>/api/v1/health | jq -c .components'
```

Roll the **web** image back to the matching tag too. A new web bundle calling an old API is a
second, subtler outage: the API answers 400 or 404 for fields the old version does not know.

### Verify, in this order

```bash
curl -fsS https://<api-host>/api/v1/health | jq .status          # "up"
curl -fsS https://<api-host>/api/v1/health | jq .components      # all five up
curl -fsS https://<api-host>/api/v1/health | jq .version         # the previous version
```

Then, by hand:

- sign in as a real internal user
- open a ticket list and a ticket
- confirm the queues component is `up` — if it is `down`, the rolled-back instances have not
  re-registered their schedules yet; give it a minute, then restart one

The migrations from the rolled-back release **stay applied**. That is intended and safe for Case A.
Note in the incident record which migrations are ahead of the running code, so the next release
does not treat them as new.

---

## 4. Restore the database (Case B, or data loss)

This loses every write since the backup. It is the last resort and it needs a decision-maker, not
just an engineer.

1. **Stop the writers first.** Scale the API to zero instances. A restore underneath a running API
   produces a database that disagrees with itself.
2. Follow `backup-and-restore.md` §4. Restore to a **new** database and repoint, rather than
   restoring over the live one — the broken database is evidence, and you may need it.
3. Deploy the image that matches the restored schema (the previous release's tag).
4. Bring instances back one at a time, checking readiness between each.
5. Reconcile: work out what was written between the backup and the incident, and tell the people
   whose work it was. This is the part that takes days, and the part customers remember.

---

## 5. What cannot be rolled back

Say these out loud during the decision; a rollback does not undo them.

| Already happened | Why it stays |
| --- | --- |
| Emails and WhatsApp messages sent | Delivered. Sending a correction is a business decision |
| Telephone calls placed by the IVR | The call happened |
| Files deleted from object storage | `DELETE` is immediate and there is no versioning unless the bucket has it |
| Webhooks delivered to a client's product | Their system has it |
| Invoice PDFs a client already downloaded | They hold the file |

If a release caused any of these wrongly, the rollback stops the bleeding; the correction is a
separate, deliberate action, recorded in the incident.

---

## 6. Rolling back a migration you must reverse

Only when the release was Case B and a restore is not acceptable. This is surgery, and it is done
with a **new forward migration**, never by editing history:

1. Write the reversal as a normal migration on a `fix/` branch, reviewed like any other.
2. Reserve a timestamp *after* the migration being reversed.
3. Test it against a restored copy of the production database, not a seeded one. A reversal that
   works on empty tables proves nothing.
4. Deploy it as an ordinary release.

Never delete or edit a migration directory that has been applied anywhere. Prisma records applied
migrations by name and checksum; changing one makes `migrate deploy` refuse to run at all, which
turns a bad release into an undeployable one.
