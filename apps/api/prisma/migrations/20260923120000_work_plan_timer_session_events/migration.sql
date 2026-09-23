-- Track start / logout-stop / resume on work-plan timers.
ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'STARTED';
ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'STOPPED';
ALTER TYPE "WorkPlanEventKind" ADD VALUE IF NOT EXISTS 'RESUMED';
