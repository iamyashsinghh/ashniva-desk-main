import {
  MAX_WORK_AREAS,
  PROJECT_MEMBER_ROLE,
  type ProjectMemberRole,
  type ProjectMemberSummary,
} from '@ashniva/types';

/**
 * The team editor's draft and the body it becomes.
 *
 * `PUT /projects/:id/members` replaces the whole list in one call, so the screen edits a draft and
 * sends it once: a write per change over a whole-list endpoint would leave the project half-edited
 * the first time one of them failed.
 */

export interface MemberDraft {
  userId: string;
  name: string;
  role: ProjectMemberRole;
  responsibilities: string[];
}

export interface MemberInput {
  userId: string;
  role: ProjectMemberRole;
  responsibilities: string[];
}

/**
 * Responsibilities mean something only for the people who do the work: a developer's is the API
 * or the frontend, which is what the support router matches a ticket against. A manager's job is
 * the project, so theirs are not sent.
 */
export const RESPONSIBILITY_ROLES: readonly ProjectMemberRole[] = [
  PROJECT_MEMBER_ROLE.DEVELOPER,
  PROJECT_MEMBER_ROLE.LEAD,
  PROJECT_MEMBER_ROLE.TESTER,
];

export function hasResponsibilities(role: ProjectMemberRole): boolean {
  return RESPONSIBILITY_ROLES.includes(role);
}

export function draftsFromMembers(members: readonly ProjectMemberSummary[]): MemberDraft[] {
  return members.map((member) => ({
    userId: member.id,
    name: member.name,
    role: member.role,
    responsibilities: [...member.responsibilities],
  }));
}

/** Adds people not already on the draft, as developers — the role most people join with. */
export function addPeople(
  drafts: readonly MemberDraft[],
  people: readonly { id: string; name: string }[],
): MemberDraft[] {
  const present = new Set(drafts.map((draft) => draft.userId));
  const added = people
    .filter((person) => !present.has(person.id))
    .map((person) => ({
      userId: person.id,
      name: person.name,
      role: PROJECT_MEMBER_ROLE.DEVELOPER as ProjectMemberRole,
      responsibilities: [],
    }));
  return [...drafts, ...added];
}

/** One entry per person — the API's key is the pair — with the last edit winning. */
export function membersPayload(drafts: readonly MemberDraft[]): MemberInput[] {
  const byUser = new Map<string, MemberDraft>();
  for (const draft of drafts) {
    byUser.set(draft.userId, draft);
  }
  return [...byUser.values()].map((draft) => ({
    userId: draft.userId,
    role: draft.role,
    responsibilities: hasResponsibilities(draft.role)
      ? draft.responsibilities.slice(0, MAX_WORK_AREAS)
      : [],
  }));
}
