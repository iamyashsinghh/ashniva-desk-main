-- A notification type for "testing passed on your work".
--
-- Its own value rather than a reuse of TASK_REVIEW_REJECTED, which the failure path borrows: "your
-- work came back" and "your work is clear" are opposite events, and somebody who muted one of them
-- did not mean to mute the other.
--
-- Additive only. Existing notification rows and preferences are untouched; somebody who has never
-- saved a preference for this type gets the in-app default, as they do for every other type.

ALTER TYPE "NotificationType" ADD VALUE 'QA_PASSED';
