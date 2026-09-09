-- A notification type for "the client answered your sign-off request".
--
-- Its own value rather than a reuse of APPROVAL_DECIDED, which belongs to the internal release
-- approvers: this is the client answering, it is what the UAT release gate waits on, and a
-- "request changes" is work landing back on somebody's desk. Until now a client could approve or
-- ask for changes and nobody was told; the provider found out by opening the release page.
--
-- Additive only. Existing notification rows and preferences are untouched; somebody who has never
-- saved a preference for this type gets the in-app default, as they do for every other type.

ALTER TYPE "NotificationType" ADD VALUE 'UAT_DECIDED';
