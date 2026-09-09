-- Duplicate and related work items: a typed link between two tickets, and the same between two
-- tasks.
--
-- Additive only. Nothing existing is altered except the notification enum, which gains one value.
-- Marking a ticket a duplicate writes a row here and closes the duplicate with a note; it moves no
-- reply, no attachment, no SLA record and no audit entry between the two tickets, so there is no
-- backfill and nothing to undo.
--
-- The unique index on the ordered pair is what stops one pair carrying two links: symmetric
-- relations are stored with the ids in ascending order, so "link B to A" collides with the row
-- created by "link A to B" rather than making a second one.

-- CreateEnum
CREATE TYPE "WorkRelationType" AS ENUM ('DUPLICATE_OF', 'RELATED_TO');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TICKET_DUPLICATE';

-- CreateTable
CREATE TABLE "ticket_relations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "WorkRelationType" NOT NULL,
    "source_ticket_id" UUID NOT NULL,
    "target_ticket_id" UUID NOT NULL,
    "note" TEXT,
    "closed_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "linked_by_id" UUID,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_relations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "WorkRelationType" NOT NULL,
    "source_task_id" UUID NOT NULL,
    "target_task_id" UUID NOT NULL,
    "note" TEXT,
    "linked_by_id" UUID,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_relations_target_ticket_id_idx" ON "ticket_relations"("target_ticket_id");

-- CreateIndex
CREATE INDEX "ticket_relations_organization_id_type_idx" ON "ticket_relations"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_relations_source_ticket_id_target_ticket_id_key" ON "ticket_relations"("source_ticket_id", "target_ticket_id");

-- CreateIndex
CREATE INDEX "task_relations_target_task_id_idx" ON "task_relations"("target_task_id");

-- CreateIndex
CREATE INDEX "task_relations_organization_id_type_idx" ON "task_relations"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "task_relations_source_task_id_target_task_id_key" ON "task_relations"("source_task_id", "target_task_id");

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_source_ticket_id_fkey" FOREIGN KEY ("source_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_target_ticket_id_fkey" FOREIGN KEY ("target_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_source_task_id_fkey" FOREIGN KEY ("source_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_target_task_id_fkey" FOREIGN KEY ("target_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security.
--
-- Written longhand, as every policy since Phase 2 has been; FORCE matters, because without it the
-- policy does not apply to the table owner, which is the role the application connects as.
--
-- `ticket_relations` is the interesting one. A link is a disclosure: if a reader can see ticket A
-- and A points at ticket B, they have learnt that B exists. Two different clients can legitimately
-- report the same fault, so the client branch admits a row only when *both* ends belong to the
-- reader's own organization. That is deliberately stricter than the service needs — the service
-- already drops what a caller may not read — because this is the layer that still holds if a
-- future mapper forgets to.
--
-- `task_relations` takes the provider-only shape: tasks have no client-facing read anywhere in the
-- product, so the policy admits no client tenant at all rather than admitting one under a
-- condition somebody could later loosen.

ALTER TABLE ticket_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_relations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticket_relations USING (
  app_tenant_id() IS NULL
  OR app_tenant_is_provider()
  OR (
    EXISTS (
      SELECT 1 FROM tickets s
       WHERE s.id = ticket_relations.source_ticket_id
         AND s.client_organization_id = app_tenant_id())
    AND EXISTS (
      SELECT 1 FROM tickets t
       WHERE t.id = ticket_relations.target_ticket_id
         AND t.client_organization_id = app_tenant_id())
  )
);

ALTER TABLE task_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_relations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON task_relations
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());
