-- Tester starts their own pass after the developer sends the point. Complete/Not complete
-- only appear once testing has started.

ALTER TYPE "WorkPlanPointStatus" ADD VALUE 'TESTING';
