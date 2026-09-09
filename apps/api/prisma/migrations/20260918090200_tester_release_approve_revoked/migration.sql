-- Takes `release:approve` off the system TESTER role.
--
-- Its own migration, and the only one in the tree that removes a grant. Every other permission
-- migration is generated from `packages/types` and is additive by construction, which is exactly
-- what makes them safe to re-run — but additive means an earlier migration's grant stands for
-- ever unless something says otherwise, so a default that turns out to be wrong needs a statement
-- of its own. This file is hand-written and adds nothing.
--
-- It is guarded behaviourally rather than by a rule about its text: `permission-rollout.e2e-spec.ts`
-- seeds a tenant's own CUSTOM_AUDITOR role holding `release:approve` and asserts this DELETE cannot
-- reach it. Remove either the `is_system` or the `organization_id` predicate below and that test
-- fails, which is the assertion that matters — a grammar check on the SQL would not have caught it.
--
-- Why it is wrong: a project names QA_LEAD in its release policy when it wants QA's signature on a
-- release, and `ReleaseApprovalsService` maps the TESTER role key onto exactly that approver. With
-- the permission granted to every tester by default, the approver role was decoration — anyone who
-- could record a test result could also sign a release off, on a project that never asked QA to.
--
-- What it does not touch:
--
--   * custom roles. A tenant's own role carries an organization and `is_system = false`, and both
--     conditions below exclude it. Somebody who deliberately gave their testers this permission
--     keeps it.
--   * any other role. PROJECT_MANAGER, TEAM_LEAD and SUPER_ADMIN keep `release:approve`.
--   * approvals already given. The rows in `release_approvals` are history and stay as they are.
--
-- Idempotent: deleting a row that is already gone deletes nothing.

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.key = 'TESTER'
  AND r.is_system = true
  AND r.organization_id IS NULL
  AND p.key = 'release:approve';
