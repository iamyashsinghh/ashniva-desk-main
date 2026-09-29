import { ROLE_KEYS } from '@ashniva/types';

import { roleBody, type RoleChoice } from './user-roles';

/**
 * The "Add person" form: its fields, when it may be sent, and the body it becomes.
 *
 * Kept apart from the screen so the rules — an invitation needs no password, a set password needs
 * ten characters, an empty title is not sent — are tested without drawing anything.
 */

export type SignInMode = 'invite' | 'password';

export interface InviteForm {
  email: string;
  name: string;
  mode: SignInMode;
  password: string;
  role: RoleChoice;
  title: string;
  phone: string;
  teamIds: string[];
  showDevelopmentSection: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyInviteForm(role: RoleChoice): InviteForm {
  return {
    email: '',
    name: '',
    mode: 'invite',
    password: '',
    role,
    title: '',
    phone: '',
    teamIds: [],
    showDevelopmentSection: true,
  };
}

export function inviteProblems(form: InviteForm): { email?: string; password?: string } {
  const email = form.email.trim();
  return {
    ...(email && !EMAIL.test(email) ? { email: 'That does not look like an email address.' } : {}),
    ...(form.mode === 'password' && form.password.length > 0 && form.password.length < 10
      ? { password: 'At least 10 characters.' }
      : {}),
  };
}

export function inviteReady(form: InviteForm): boolean {
  return (
    EMAIL.test(form.email.trim()) &&
    form.name.trim().length > 0 &&
    (form.mode === 'invite' || form.password.length >= 10)
  );
}

export function isTeamLeadChoice(role: RoleChoice): boolean {
  return role === `key:${ROLE_KEYS.TEAM_LEAD}`;
}

export function inviteBody(form: InviteForm, organizationId: string | undefined) {
  return {
    email: form.email.trim(),
    name: form.name.trim(),
    ...(form.mode === 'password' ? { password: form.password } : {}),
    ...roleBody(form.role),
    ...(organizationId ? { organizationId } : {}),
    ...(form.title.trim() ? { title: form.title.trim() } : {}),
    ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
    ...(form.teamIds.length > 0 ? { teamIds: form.teamIds } : {}),
    showDevelopmentSection: form.showDevelopmentSection,
  };
}
