import type { UserSummary } from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { formatDateTime } from '../../../shared/lib/format';
import { useReauth } from '../../auth/reauth';
import { useUserMutations } from '../../users/api';
import { roleBody, useRoleChoices, type RoleTargetOrganization } from '../user-roles';

/** Changing someone's role is a permission change: it needs a fresh password check. */
export function ChangeRoleModal({
  user,
  organizationId,
  targetOrganization,
  onClose,
}: {
  user: UserSummary;
  organizationId: string;
  targetOrganization: RoleTargetOrganization;
  onClose: () => void;
}) {
  const choices = useRoleChoices(organizationId, targetOrganization);
  const { changeRole } = useUserMutations();
  const reauth = useReauth();
  const { error, wrap } = useSubmitHandler(onClose);
  const current =
    choices.find((choice) => choice.value === `id:${user.roleId}`)?.value ?? `key:${user.roleKey}`;
  const [choice, setChoice] = useState(current);
  const save = async () => {
    const token = await reauth.request();
    await changeRole.mutateAsync({
      id: user.id,
      organizationId,
      ...roleBody(choice),
      headers: reauth.headers(token),
    });
  };
  return (
    <>
      <Modal
        open={!reauth.active}
        title={`Change role for ${user.name}`}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={changeRole.isPending || reauth.active}
              disabled={choice === current}
              disabledReason="Pick a different role"
              onClick={() => void wrap(save)()}
            >
              Change role
            </Button>
          </>
        }
      >
        <FormField label="Role" required hint="You will be asked for your password">
          <Select
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            options={choices}
          />
        </FormField>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Modal>
      {reauth.modal}
    </>
  );
}

/** Shown after inviting someone: the one-time link to pass on privately. */
export function InvitationLinkModal({
  name,
  invitation,
  onClose,
}: {
  name: string;
  invitation: { link: string; expiresAt: string };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Modal
      open
      title={`Invitation for ${name}`}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="prose">
        Share this link privately. It works once and expires {formatDateTime(invitation.expiresAt)}.
      </p>
      <FormField label="Invitation link">
        <Input readOnly value={invitation.link} onFocus={(event) => event.target.select()} />
      </FormField>
      <Button size="sm" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </Modal>
  );
}
