-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EmailEncryption" AS ENUM ('NONE', 'STARTTLS', 'TLS');

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient_user_id" UUID,
    "destination" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbound_messages_organization_id_channel_queued_at_idx" ON "outbound_messages"("organization_id", "channel", "queued_at");

-- CreateIndex
CREATE INDEX "outbound_messages_organization_id_status_idx" ON "outbound_messages"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_organization_id_channel_idempotency_key_key" ON "outbound_messages"("organization_id", "channel", "idempotency_key");

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Row-level security
--
-- Outbound messages are provider-side operational records: recipient addresses, template keys,
-- provider errors. A client organization has no reason to read them, and the destination column
-- would expose staff contact details, so the policy is provider-only rather than dual-scoped.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbound_messages
  USING (
    app_tenant_id() IS NULL
    OR (app_tenant_is_provider() AND organization_id = app_tenant_id())
  );
