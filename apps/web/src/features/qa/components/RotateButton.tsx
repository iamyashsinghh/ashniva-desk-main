import type { TestAccountSummary } from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTestAccountMutations } from '../api';

interface RotateButtonProps {
  account: TestAccountSummary;
  projectId: string;
  canManage: boolean;
}

/**
 * Change a test password.
 *
 * Rotation is not an edit: the API revokes every outstanding grant with it, so anyone mid-test
 * loses access on purpose. The confirmation says that rather than asking "are you sure".
 */
export function RotateButton({ account, projectId, canManage }: RotateButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        disabled={!canManage || !account.isActive}
        disabledReason={
          account.isActive
            ? 'Changing a test password needs the test-account:manage permission'
            : 'This login has been retired'
        }
        onClick={() => setOpen(true)}
      >
        Rotate
      </Button>
      {open ? (
        <RotateModal account={account} projectId={projectId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function RotateModal({
  account,
  projectId,
  onClose,
}: {
  account: TestAccountSummary;
  projectId: string;
  onClose: () => void;
}) {
  const { rotate } = useTestAccountMutations(projectId);
  const { error, wrap } = useSubmitHandler(onClose);
  // Held only until the request is sent; the modal unmounts with it and nothing reads it back.
  const [secret, setSecret] = useState('');
  const tooShort = secret.length > 0 && secret.length < 8;

  return (
    <Modal
      open
      title={`Rotate ${account.label}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={rotate.isPending}
            disabled={tooShort}
            disabledReason="A password you set yourself needs at least 8 characters"
            onClick={() =>
              void wrap(() => rotate.mutateAsync({ id: account.id, secret: secret || undefined }))()
            }
          >
            Rotate and revoke
          </Button>
        </>
      }
    >
      <p className="prose">
        Every grant on this login is revoked as it rotates, so anyone testing with it right now will
        have to ask again.
      </p>
      <FormField
        label="New password"
        hint="Leave this empty and one is generated. Either way it is encrypted and never shown again here."
        error={tooShort ? 'At least 8 characters' : undefined}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
