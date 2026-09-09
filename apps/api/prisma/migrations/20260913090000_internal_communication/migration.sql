-- Internal project communication (Phase 4, package 9b).
--
-- Additive: four new enums, five new tables, two new nullable columns and one relaxation.
-- `call_logs.ticket_id` becomes nullable because a call can now belong to a conversation instead
-- of a ticket; every row that exists keeps its ticket, and nothing is dropped or rewritten.
--
-- The tables below store who a conversation is *for*. Whether somebody may act on it is decided
-- by `CommunicationPolicyService` from live project membership on every request — which is why
-- `conversation_members` carries a read cursor and not a grant, and why removing a developer from
-- a project removes their access without any row here changing.

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('PROJECT', 'TASK', 'TICKET', 'DIRECT');

-- CreateEnum
CREATE TYPE "MessageSystemKind" AS ENUM ('CALL_STARTED', 'CALL_ENDED', 'CONVERSATION_CREATED');

-- CreateEnum
CREATE TYPE "CallKind" AS ENUM ('SUPPORT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "InternalCallFallback" AS ENUM ('NONE', 'PROJECT_LEAD');

-- AlterTable
ALTER TABLE "call_logs" ADD COLUMN     "conversation_id" UUID,
ADD COLUMN     "kind" "CallKind" NOT NULL DEFAULT 'SUPPORT',
ADD COLUMN     "task_id" UUID,
ALTER COLUMN "ticket_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "message_id" UUID;

-- AlterEnum
-- Two more notification types. Additive: nothing that exists is renamed or removed.
ALTER TYPE "NotificationType" ADD VALUE 'CONVERSATION_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE 'CONVERSATION_MENTION';

-- CreateTable
CREATE TABLE "communication_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "chat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "calling_enabled" BOOLEAN NOT NULL DEFAULT false,
    "recording_policy" "RecordingPolicy" NOT NULL DEFAULT 'DISABLED',
    "recording_playback_scope" "RecordingPlaybackScope" NOT NULL DEFAULT 'LEADS_ONLY',
    "internal_call_fallback" "InternalCallFallback" NOT NULL DEFAULT 'NONE',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "task_id" UUID,
    "ticket_id" UUID,
    "title" TEXT,
    "direct_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "muted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "sender_id" UUID,
    "body" TEXT NOT NULL,
    "system_kind" "MessageSystemKind",
    "client_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_participants" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "is_initiator" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),

    CONSTRAINT "call_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communication_settings_organization_id_key" ON "communication_settings"("organization_id");

-- CreateIndex
CREATE INDEX "conversations_organization_id_last_message_at_idx" ON "conversations"("organization_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_project_id_kind_idx" ON "conversations"("project_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_project_id_kind_task_id_ticket_id_direct_key_key" ON "conversations"("project_id", "kind", "task_id", "ticket_id", "direct_key");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_organization_id_created_at_idx" ON "messages"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_client_message_id_key" ON "messages"("conversation_id", "client_message_id");

-- CreateIndex
CREATE INDEX "call_participants_user_id_idx" ON "call_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_participants_call_id_user_id_key" ON "call_participants"("call_id", "user_id");

-- CreateIndex
CREATE INDEX "call_logs_conversation_id_requested_at_idx" ON "call_logs"("conversation_id", "requested_at");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_settings" ADD CONSTRAINT "communication_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_settings" ADD CONSTRAINT "communication_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
--
-- All five tables are provider-internal, and this is the one place in the product where that is
-- not merely the common case but the whole definition: an internal conversation has no
-- client-visible form. So the policy is the provider-only shape with no `= app_tenant_id()`
-- branch a later edit could widen, and a client session reads nothing from any of them —
-- underneath the controller that refuses them, the socket that refuses their subscription, and
-- the absence of any client mapper that could serialise one.
--
-- `files` is deliberately not touched. Its existing policy admits a client only for a row whose
-- visibility is CLIENT *and* whose parent is one of the named client-facing entities; a message
-- attachment is neither, so it is already invisible without widening or narrowing anything.
--
-- FORCE matters: without it the policies do not apply to the table owner, which is the role the
-- application connects as.

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversation_members
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE communication_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON communication_settings
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());

ALTER TABLE call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_participants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON call_participants
  USING (app_tenant_id() IS NULL OR app_tenant_is_provider());
