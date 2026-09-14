import { isClientRole, type TeamSummary, type UserSummary } from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Switch,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReauth } from '../../auth/reauth';
import { useCurrentUser } from '../../auth/session-context';
import { useUserMutations } from '../../users/api';
import {
  defaultRoleChoice,
  roleBody,
  useRoleChoices,
  type RoleTargetOrganization,
} from '../user-roles';
import { InvitationLinkModal } from './UserRoleModals';

interface UserFormModalProps {
  organizationId: string;
  targetOrganization: RoleTargetOrganization;
  user?: UserSummary;
  teams: TeamSummary[];
  onClose: () => void;
}

/**
 * Add or edit a person. New people are invited by link by default (they choose their own
 * password); an initial password is optional. Roles are changed separately with a re-auth.
 *
 * Adding a person asks for the password too: the call picks the new person's role and answers
 * with their invitation link, which is enough to sign in as them. Editing a profile does not.
 */
export function UserFormModal({
  organizationId,
  targetOrganization,
  user,
  teams,
  onClose,
}: UserFormModalProps) {
  const me = useCurrentUser();
  const { create, update } = useUserMutations();
  const reauth = useReauth();
  const [invitation, setInvitation] = useState<{
    name: string;
    link: string;
    expiresAt: string;
  } | null>(null);
  const { error, wrap } = useSubmitHandler();
  const choices = useRoleChoices(organizationId, targetOrganization);
  const [form, setForm] = useState({
    email: user?.email ?? '',
    name: user?.name ?? '',
    mode: 'password' as 'invite' | 'password',
    password: '',
    role: user
      ? `key:${user.roleKey}`
      : defaultRoleChoice(isClientRole(me.roleKey), targetOrganization),
    title: user?.title ?? '',
    showDevelopmentSection: user?.showDevelopmentSection ?? true,
    teamIds: user?.teams.map((team) => team.id) ?? [],
  });
  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    form.name.trim().length > 0 &&
    (user
      ? form.password.length === 0 || form.password.length >= 10
      : form.mode === 'invite' || form.password.length >= 10);

  const newPersonLabel = form.mode === 'invite' ? 'Invite' : 'Add person';
  const saveLabel = user ? 'Save' : newPersonLabel;

  const save = async () => {
    if (user) {
      await update.mutateAsync({
        id: user.id,
        organizationId,
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password.length >= 10 ? form.password : undefined,
        title: form.title.trim() || null,
        showDevelopmentSection: form.showDevelopmentSection,
        teamIds: form.teamIds,
      });
      onClose();
      return;
    }
    const token = await reauth.request();
    const created = await create.mutateAsync({
      headers: reauth.headers(token),
      email: form.email.trim(),
      name: form.name.trim(),
      password: form.mode === 'password' ? form.password : undefined,
      ...roleBody(form.role),
      organizationId,
      title: form.title.trim() || undefined,
      showDevelopmentSection: form.showDevelopmentSection,
      teamIds: form.teamIds.length > 0 ? form.teamIds : undefined,
    });
    if (created.invitation) {
      setInvitation({ name: created.name, ...created.invitation });
      return;
    }
    onClose();
  };

  if (invitation) {
    return <InvitationLinkModal name={invitation.name} invitation={invitation} onClose={onClose} />;
  }

  return (
    <>
      <Modal
        open={!reauth.active}
        title={user ? `Edit ${user.name}` : 'Add person'}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending || update.isPending || reauth.active}
              disabled={!valid}
              disabledReason={
                user
                  ? 'Email and name are required (a new password needs 10+ characters)'
                  : 'Email and name are required (a password needs 10+ characters)'
              }
              onClick={() => void wrap(save)()}
            >
              {saveLabel}
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Email" required>
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </FormField>
          <FormField label="Name" required>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </FormField>
          {!user ? (
            <>
              <FormField
                label="How they sign in the first time"
                required
                hint="Saving asks for your own password, then creates the person"
              >
                <Select
                  value={form.mode}
                  onChange={(event) =>
                    setForm({ ...form, mode: event.target.value as typeof form.mode })
                  }
                  options={[
                    {
                      value: 'invite',
                      label: 'Send an invitation link (they set their own password)',
                    },
                    { value: 'password', label: 'I will set an initial password' },
                  ]}
                />
              </FormField>
              {form.mode === 'password' ? (
                <FormField
                  label="Initial password"
                  required
                  hint="At least 10 characters; share it privately"
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                </FormField>
              ) : null}
              <FormField label="Role" required>
                <Select
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}
                  options={choices}
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField
                label="New password"
                optional
                hint="Leave blank to keep the current password. At least 10 characters if you change it."
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </FormField>
              <FormField
                label="Role"
                hint="Use “Change role” in the list; it needs a password check"
              >
                <Input value={user.roleName} disabled />
              </FormField>
            </>
          )}
          <FormField label="Title">
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="e.g. Team Lead, Store Manager"
            />
          </FormField>
          {teams.length > 0 ? (
            <FormGridFull>
              <FormField label="Teams">
                <Select
                  multiple
                  size={Math.min(4, teams.length)}
                  value={form.teamIds}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      teamIds: Array.from(event.target.selectedOptions).map(
                        (option) => option.value,
                      ),
                    })
                  }
                  options={teams.map((team) => ({ value: team.id, label: team.name }))}
                />
              </FormField>
            </FormGridFull>
          ) : null}
          {form.role === 'key:TEAM_LEAD' || user?.roleKey === 'TEAM_LEAD' ? (
            <FormGridFull>
              <Switch
                checked={form.showDevelopmentSection}
                onChange={(checked) => setForm({ ...form, showDevelopmentSection: checked })}
                label="Show Development section"
                description="Seniors who no longer code can hide their own-development dashboard section."
              />
            </FormGridFull>
          ) : null}
        </FormGrid>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Modal>
      {reauth.modal}
    </>
  );
}
