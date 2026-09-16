-- Work-plan review notifications (developer → tester / doubt to lead and PM).

ALTER TYPE "NotificationType" ADD VALUE 'WORK_PLAN_SUBMITTED_FOR_TEST';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_PLAN_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_PLAN_DOUBT';
