-- Timer session kinds. The enum itself is created in 20260930190000; this folder sorts
-- earlier, so we no-op when the type is missing. Values are ensured in 20260930191000.
DO $$ BEGIN
  ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'STARTED';
  ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'STOPPED';
  ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'RESUMED';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
