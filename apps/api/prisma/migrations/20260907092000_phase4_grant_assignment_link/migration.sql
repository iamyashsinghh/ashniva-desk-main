-- Two columns and two foreign keys the first Phase 4 migration should have carried.
--
-- `CredentialGrantSummary` declares `assignmentId` and `revealedAt`, and the reveal endpoint
-- accepts an assignment — but the columns were missing, so the service had to fold the assignment
-- into the grant's reason text and derive the first reveal from the access log. Both are now real
-- columns: a grant issued for an assignment should say so in a field a query can filter on, and
-- "issued and never used" is a different fact from "issued and read".
--
-- `testing_assignments.test_account_id` existed as a bare uuid with no foreign key, so an
-- assignment could name a login that had been deleted, and Prisma could not include it — which is
-- what `TestingAssignmentDetail.testAccount` needs.
--
-- Additive and separate from 20260907090000 rather than folded into it, because that migration
-- has already been applied to development databases and rewriting an applied migration is how a
-- chain stops being reproducible.

-- AlterTable
ALTER TABLE "credential_grants" ADD COLUMN     "assignment_id" UUID,
ADD COLUMN     "revealed_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "testing_assignments" ADD CONSTRAINT "testing_assignments_test_account_id_fkey" FOREIGN KEY ("test_account_id") REFERENCES "test_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_grants" ADD CONSTRAINT "credential_grants_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "testing_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

