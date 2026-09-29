import type { ProjectMemberSummary } from '@ashniva/types';

import { addPeople, draftsFromMembers, membersPayload } from './project-members';

/**
 * The team editor's draft. The endpoint replaces the whole list, so what is sent is the whole
 * truth: one row per person, and responsibilities only where they route anything.
 */

const MEMBERS: ProjectMemberSummary[] = [
  {
    id: 'u1',
    name: 'Asha',
    email: 'asha@example.com',
    role: 'DEVELOPER',
    responsibilities: ['API'],
  },
  {
    id: 'u2',
    name: 'Ben',
    email: 'ben@example.com',
    role: 'MANAGER',
    responsibilities: [],
  },
];

describe('addPeople', () => {
  it('adds newcomers as developers and skips anyone already on the team', () => {
    const drafts = addPeople(draftsFromMembers(MEMBERS), [
      { id: 'u1', name: 'Asha' },
      { id: 'u3', name: 'Chen' },
    ]);
    expect(drafts.map((draft) => draft.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(drafts[2]).toMatchObject({ role: 'DEVELOPER', responsibilities: [] });
  });
});

describe('membersPayload', () => {
  it('sends one entry per person, the last edit winning', () => {
    const [asha, ben] = draftsFromMembers(MEMBERS);
    if (!asha || !ben) {
      throw new Error('fixture has two members');
    }
    const payload = membersPayload([asha, ben, { ...asha, role: 'TESTER' }]);
    expect(payload).toHaveLength(2);
    expect(payload.find((member) => member.userId === 'u1')?.role).toBe('TESTER');
  });

  it('drops responsibilities for a role that does not do the work', () => {
    const drafts = draftsFromMembers(MEMBERS).map((draft) =>
      draft.userId === 'u1' ? { ...draft, role: 'CLIENT_CONTACT' as const } : draft,
    );
    expect(membersPayload(drafts).find((member) => member.userId === 'u1')).toEqual({
      userId: 'u1',
      role: 'CLIENT_CONTACT',
      responsibilities: [],
    });
  });
});
