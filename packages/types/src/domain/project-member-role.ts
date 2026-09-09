/** What a person does on a project. Independent of their organization role. */
export const PROJECT_MEMBER_ROLE = {
  MANAGER: 'MANAGER',
  LEAD: 'LEAD',
  DEVELOPER: 'DEVELOPER',
  TESTER: 'TESTER',
  SUPPORT: 'SUPPORT',
  CLIENT_CONTACT: 'CLIENT_CONTACT',
} as const;

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLE)[keyof typeof PROJECT_MEMBER_ROLE];

export const PROJECT_MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  MANAGER: 'Project manager',
  LEAD: 'Team lead',
  DEVELOPER: 'Developer',
  TESTER: 'Tester',
  SUPPORT: 'Support',
  CLIENT_CONTACT: 'Client contact',
};
