import { isClientRole, REAUTH_HEADER, type TeamSummary, type UserSummary } from '@ashniva/types';
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
import { reauthenticate } from '../../auth/api';
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

function looksLikeEmail(value: string): boolean {
  return value.includes('@') && /[.]/.test(value);
}

/**
 * Add or edit a person. New people are invited by link by default. Creating one needs a fresh
 * password check for the *signed-in* account. That check is a second step with only a password
 * field: an email field on the same form made browsers fill the new person's email into the
 * password box, and reauth then failed with "Password is incorrect".
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
  const [invitation, setInvitation] = useState<{
    name: string;
    link: string;
    expiresAt: string;
  } | null>(null);
  const [step, setStep] = useState<'details' | 'confirm'>('details');
  const [autofillLocked, setAutofillLocked] = useState(true);
  const { error, wrap } = useSubmitHandler();
  const choices = useRoleChoices(organizationId, targetOrganization);
  const [form, setForm] = useState({
    email: user?.email ?? '',
    name: user?.name ?? '',
    mode: 'invite' as 'invite' | 'password',
    password: '',
    ownPassword: '',
    role: user
      ? `key:${user.roleKey}`
      : defaultRoleChoice(isClientRole(me.roleKey), targetOrganization),
    title: user?.title ?? '',
    showDevelopmentSection: user?.showDevelopmentSection ?? true,
    teamIds: user?.teams.map((team) => team.id) ?? [],
  });
  const detailsValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    form.name.trim().length > 0 &&
    (user
      ? form.password.length === 0 || form.password.length >= 10
      : form.mode === 'invite' || form.password.length >= 10);
  const confirmValid =
    form.ownPassword.trim().length > 0 && !looksLikeEmail(form.ownPassword.trim());

  const patchForm = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
  };
  const newPersonLabel = form.mode === 'invite' ? 'Invite' : 'Add person';
  const confirming = !user && step === 'confirm';

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
    if (step === 'details') {
      patchForm({ ownPassword: '' });
      setAutofillLocked(true);
      setStep('confirm');
      return;
    }
    const password = form.ownPassword.trim();
    if (looksLikeEmail(password)) {
      throw new Error(
        `That is an email address. Type the password you use to sign in as ${me.name} (${me.email}).`,
      );
    }
    const token = await reauthenticate(password);
    const created = await create.mutateAsync({
      headers: { [REAUTH_HEADER]: token },
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
    <Modal
      open
      title={user ? `Edit ${user.name}` : confirming ? 'Confirm it is you' : 'Add person'}
      description={
        confirming
          ? `Creating ${form.name}. Enter the password for ${me.name} (${me.email}) — the one you used to sign in to Desk.`
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          {confirming ? (
            <Button
              onClick={() => {
                patchForm({ ownPassword: '' });
                setStep('details');
              }}
            >
              Back
            </Button>
          ) : (
            <Button onClick={onClose}>Cancel</Button>
          )}
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={confirming ? !confirmValid : !detailsValid}
            disabledReason={
              confirming
                ? 'Type your Desk sign-in password, not an email'
                : user
                  ? 'Email and name are required (a new password needs 10+ characters)'
                  : 'Email and name are required'
            }
            onClick={() => void wrap(save)()}
          >
            {user ? 'Save' : confirming ? 'Create person' : newPersonLabel}
          </Button>
        </>
      }
    >
      {confirming ? (
        <FormField label={`Password for ${me.email}`} required>
          <Input
            type="password"
            name="ashniva-admin-password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            readOnly={autofillLocked}
            value={form.ownPassword}
            onFocus={() => setAutofillLocked(false)}
            onChange={(event) => patchForm({ ownPassword: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && confirmValid) {
                void wrap(save)();
              }
            }}
          />
        </FormField>
      ) : (
        <FormGrid>
          <FormField label="Email" required>
            <Input
              type="email"
              name="new-person-email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => patchForm({ email: event.target.value })}
            />
          </FormField>
          <FormField label="Name" required>
            <Input
              autoComplete="off"
              value={form.name}
              onChange={(event) => patchForm({ name: event.target.value })}
            />
          </FormField>
          {!user ? (
            <>
              <FormField
                label="How they sign in the first time"
                required
                hint="Invitation link is the default. They choose their own password."
              >
                <Select
                  value={form.mode}
                  onChange={(event) =>
                    patchForm({ mode: event.target.value as typeof form.mode })
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
                    name="new-person-password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => patchForm({ password: event.target.value })}
                  />
                </FormField>
              ) : null}
              <FormField label="Role" required>
                <Select
                  value={form.role}
                  onChange={(event) => patchForm({ role: event.target.value })}
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
                  onChange={(event) => patchForm({ password: event.target.value })}
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
              onChange={(event) => patchForm({ title: event.target.value })}
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
                    patchForm({
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
                onChange={(checked) => patchForm({ showDevelopmentSection: checked })}
                label="Show Development section"
                description="Seniors who no longer code can hide their own-development dashboard section."
              />
            </FormGridFull>
          ) : null}
        </FormGrid>
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
