# Incident procedure

Something is broken in production. Work down this page.

Related: `production-runbook.md` (what the pieces are), `rollback-procedure.md` (undoing a
release), `backup-and-restore.md` (when data is gone).

---

## 1. First five minutes

Do these in order. Do not investigate first.

1. **Declare.** Post in the incident channel: what you see, when it started, and that you are
   incident lead. One sentence. A declared incident that turns out to be nothing costs nothing;
   an undeclared one costs an hour of everybody guessing separately.
2. **Establish the blast radius.**
   ```bash
   curl -sS https://<api-host>/api/v1/health | jq .
   curl -sS https://<api-host>/api/v1/health/live
   curl -sS https://<web-host>/ -o /dev/null -w '%{http_code}\n'
   ```
   `health` names which of the five components is down. `live` answering while `health` does not
   means the process is up and a dependency is not.
3. **Did anything change?** A deployment, a migration, a configuration change, a certificate
   expiry, a provider's own incident. Most incidents are the last change.
4. **Assign severity** (§2) and, if Sev-1 or Sev-2, say so to whoever handles customers. They will
   be asked before you are.

---

## 2. Severity

| | Meaning | Response |
| --- | --- | --- |
| **Sev-1** | Nobody can work, or data is being lost or exposed | Page immediately. Roll back or stop writes without waiting for consensus |
| **Sev-2** | A core workflow is broken (sign-in, raising a ticket, the client portal) | Respond now, in hours. Roll back if the cause is not obvious within 30 minutes |
| **Sev-3** | A feature is degraded with a workaround; background work is behind | Next working day. Fix forward |
| **Sev-4** | Cosmetic or single-user | Ticket it |

Data being lost or exposed is **always** Sev-1, however few people it affects.

---

## 3. Triage by symptom

### "The whole thing is down"

```bash
curl -sS https://<api-host>/api/v1/health/live     # is the process alive?
```

- **No answer at all** → load balancer, DNS, certificate, or every instance is dead. Check the
  platform's own status before anything in this repository.
- **`live` answers, `health` is 503** → a dependency. The body names it; go to the runbook's
  readiness table.
- **Both answer but users cannot sign in** → check `CORS_ORIGINS` against the origin the browser
  actually uses, and the browser console. A CORS failure looks exactly like an outage to a user
  and like a healthy service to you.

### "Everything is slow"

```bash
curl -sS -H "Authorization: Bearer $METRICS_TOKEN" https://<api-host>/api/metrics \
  | grep -E 'db_pool_connections|http_request_duration_seconds_count'
```

- `db_pool_connections{state="waiting"} > 0` → the pool is the bottleneck. Look for a long
  transaction before raising `DB_POOL_MAX`:
  ```sql
  SELECT pid, state, now() - xact_start AS age, left(query, 80)
  FROM pg_stat_activity
  WHERE state <> 'idle' ORDER BY xact_start;
  ```
  `idle in transaction` rows older than a few seconds are the cause, not the symptom.
- Pool fine, PostgreSQL slow → locks, autovacuum, or disk. `pg_locks`, then the host's IO.
- One route slow, everything else fine → a query, not the infrastructure. Runbook §7.

### "Rate limited / 429 for everybody"

Almost always `TRUST_PROXY`. With no trusted proxy every request behind a load balancer carries
the balancer's address, so the whole deployment shares one bucket and any single busy client
locks out the rest.

```bash
# confirm from the running configuration, not from what you think is deployed
echo "$TRUST_PROXY"    # should be the number of proxies in front of the API
```

Set it to the hop count and redeploy. Never `true` — the API refuses it, because a blanket `true`
lets a client prepend `X-Forwarded-For` entries and pick its own bucket.

### "Notifications / reminders / SLA warnings stopped"

```bash
curl -sS https://<api-host>/api/v1/health | jq .components.queues
```

`down` names the queue and job. This is the failure mode that used to be invisible: the API serves
every request correctly and does no background work at all. Runbook §5.

### "Live updates and chat are patchy"

Check the `realtime` component's message. `in-process adapter` on a multi-instance deployment means
events are not crossing instances: a user on one instance sees none of another's. Check Redis, and
that the load balancer is not closing the websocket.

### "Files are missing"

The database still lists a file whose bytes are gone. Check `STORAGE_BUCKET` against what is
actually deployed first — pointing at the wrong bucket looks identical to data loss and is
instantly fixable. Then `backup-and-restore.md`.

### "A tenant can see another tenant's data"

**Stop. Sev-1, and treat it as a security incident.**

1. Do not fix it in place. Capture evidence: the request id, the responses, the user.
2. Consider taking the affected endpoint out of service.
3. Escalate to whoever owns security decisions before deciding what customers are told.

The API enforces tenancy in two layers — `organizationId` in repositories and PostgreSQL
row-level security — so a leak means both failed, or a path ran as the system actor when it should
not have. That is a code fix, reviewed, not a hot patch.

---

## 4. While you are working

- **One incident lead.** They coordinate and communicate; they do not also debug.
- **Timestamp everything in the channel.** UTC. The timeline is written as you go or it is written
  wrong.
- **Change one thing at a time**, and say what you changed before you change it. Two people
  restarting different things at once is how a 20-minute incident becomes two hours.
- **Prefer stopping the bleeding over understanding.** Roll back, then investigate. The evidence
  keeps; the customers do not.
- **Every error response carries a `requestId`.** Ask the reporter for it — it is the join key into
  the logs.

---

## 5. Communication

| Severity | Who to tell | How often |
| --- | --- | --- |
| Sev-1 | affected customers, everybody internally | at declaration, every 30 minutes, at resolution |
| Sev-2 | affected customers, the team | at declaration, hourly, at resolution |
| Sev-3 | the team; customers only if they asked | at resolution |

Say what is affected and what people should do instead. Do not say what caused it until you know —
a wrong cause stated confidently is worse than no cause.

---

## 6. Closing

An incident is over when the service is healthy **and** somebody has confirmed it from a user's
seat: sign in, open a ticket, upload a file. `health` returning 200 is not the same as the product
working.

Then, before the next working day ends:

- Write the timeline: what happened, when, what was done, what worked.
- Record the customer impact in the plainest possible words, including work that was lost.
- Note which parts of these documents were wrong or missing and fix them **now**, while you
  remember. This is the highest-value thing you will do all week.
- Open tickets for the fixes, with owners. An incident with no ticket happens again.

Write it blameless. The question is what let a person's ordinary mistake reach production, not who
made it.
