-- Live allotment overrun alerts for PMs and Super Admins.
ALTER TYPE "NotificationType" ADD VALUE 'WORK_PLAN_TIME_EXCEEDED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_TIME_EXCEEDED';
