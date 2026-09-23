-- Ensure every WorkPlanEventKind the app writes exists after the enum is created.
-- Safe to re-run: IF NOT EXISTS.
ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'STARTED';
ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'STOPPED';
ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'RESUMED';
ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'PASSED';
