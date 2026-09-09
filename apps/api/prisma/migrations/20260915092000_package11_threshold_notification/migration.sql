-- The notification a crossed duplicate threshold sends (package 11).
--
-- Its own type rather than a reuse of the routing ones. "Three separate clients are reporting the
-- same fault" is not a ticket needing an owner, and somebody who has switched the routing chatter
-- off still wants to be told this. Adding the value is what lets the senior of the project be
-- notified at all: `notifications.type` is an enum, so a type the code knows and the database does
-- not is a failed insert at exactly the moment the notification matters.
--
-- Additive: no row changes, and no existing notification is reclassified.

ALTER TYPE "NotificationType" ADD VALUE 'PROBLEM_THRESHOLD_REACHED';
