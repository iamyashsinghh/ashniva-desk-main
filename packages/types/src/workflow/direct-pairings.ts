import { PROJECT_MEMBER_ROLE, type ProjectMemberRole } from '../domain/project-member-role';

/**
 * Which pairs of project roles may hold a direct conversation, within one project.
 *
 * Lifted out of `communication-policy.ts` when the scope kinds arrived and that file grew past
 * what one screen holds. It is a table and two predicates over it — no decision, no facts, nothing
 * that changes — which makes it the half of the judgement that can stand alone. The decision
 * itself still lives in one place and re-exports these, so nothing importing them had to move.
 */

/**
 * Which project roles may hold a direct conversation, within one project.
 *
 * Read as "may start and continue a direct conversation with". Three things about this table are
 * deliberate and are each protected by a test:
 *
 *  * **It is symmetric.** A one-sided edit would let A open a conversation B could not have
 *    opened, which is not a relationship — it is a leak with extra steps.
 *  * **Developer↔developer is absent**, and tester↔tester with it. The requirement names the
 *    pairs, and a wider default is the kind of thing that never gets narrowed later. Developers
 *    on one project still share the project channel and every task and ticket on it.
 *  * **Developer↔tester is conditional**, resolved by `sharedWorkRelationship`: a tester may
 *    reach the developer whose work they are testing, and not every developer on the project.
 *  * **`CLIENT_CONTACT` pairs with nobody.** It is a project role a client-side person holds, and
 *    a client is refused before this table is consulted anyway. Empty here as well, so that two
 *    independent things would both have to fail.
 */
export const DIRECT_ROLE_PAIRINGS: Record<ProjectMemberRole, readonly ProjectMemberRole[]> = {
  MANAGER: [
    PROJECT_MEMBER_ROLE.MANAGER,
    PROJECT_MEMBER_ROLE.LEAD,
    PROJECT_MEMBER_ROLE.DEVELOPER,
    PROJECT_MEMBER_ROLE.TESTER,
    PROJECT_MEMBER_ROLE.SUPPORT,
  ],
  LEAD: [
    PROJECT_MEMBER_ROLE.MANAGER,
    PROJECT_MEMBER_ROLE.LEAD,
    PROJECT_MEMBER_ROLE.DEVELOPER,
    PROJECT_MEMBER_ROLE.TESTER,
    PROJECT_MEMBER_ROLE.SUPPORT,
  ],
  DEVELOPER: [
    PROJECT_MEMBER_ROLE.MANAGER,
    PROJECT_MEMBER_ROLE.LEAD,
    PROJECT_MEMBER_ROLE.SUPPORT,
    // Conditional: only the tester of their work. See WORK_CONDITIONAL_PAIRS.
    PROJECT_MEMBER_ROLE.TESTER,
  ],
  TESTER: [
    PROJECT_MEMBER_ROLE.MANAGER,
    PROJECT_MEMBER_ROLE.LEAD,
    PROJECT_MEMBER_ROLE.SUPPORT,
    // Conditional: only the developer whose work they test.
    PROJECT_MEMBER_ROLE.DEVELOPER,
  ],
  SUPPORT: [
    PROJECT_MEMBER_ROLE.MANAGER,
    PROJECT_MEMBER_ROLE.LEAD,
    PROJECT_MEMBER_ROLE.DEVELOPER,
    PROJECT_MEMBER_ROLE.TESTER,
  ],
  CLIENT_CONTACT: [],
};

/**
 * Pairings that additionally need a task or ticket in common.
 *
 * Being a tester on a project is not a licence to open a private channel to every developer on
 * it; being the tester of *this* developer's work is. The relationship is resolved by the caller
 * from testing assignments and task/ticket assignment, and is a live fact like every other one
 * here — when the assignment ends, so does the pairing.
 */
const WORK_CONDITIONAL_PAIRS: ReadonlyArray<readonly [ProjectMemberRole, ProjectMemberRole]> = [
  [PROJECT_MEMBER_ROLE.DEVELOPER, PROJECT_MEMBER_ROLE.TESTER],
  [PROJECT_MEMBER_ROLE.TESTER, PROJECT_MEMBER_ROLE.DEVELOPER],
];

export function needsSharedWork(from: ProjectMemberRole, to: ProjectMemberRole): boolean {
  return WORK_CONDITIONAL_PAIRS.some(([a, b]) => a === from && b === to);
}

/**
 * Whether a direct pairing is symmetric, for the test that guards the table.
 *
 * Exported rather than inlined in the test because the property is part of the contract: a
 * pairing A→B without B→A would let one side open a conversation the other could not, which is
 * not a relationship.
 */
export function pairingIsSymmetric(): boolean {
  const roles = Object.keys(DIRECT_ROLE_PAIRINGS) as ProjectMemberRole[];
  return roles.every((from) =>
    DIRECT_ROLE_PAIRINGS[from].every((to) => DIRECT_ROLE_PAIRINGS[to].includes(from)),
  );
}
