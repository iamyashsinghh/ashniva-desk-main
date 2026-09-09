import type { CredentialGrantSummary, TestAccountSummary } from '@ashniva/types';
import { Alert, Button, FormField, FormGrid, Input, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useCurrentUser } from '../../auth/session-context';
import { useDirectoryQuery } from '../../users/api';
import { useQaMutations } from '../api';
import { CredentialReveal } from './CredentialReveal';

interface GrantAccessModalProps {
  account: TestAccountSummary;
  onClose: () => void;
}

/**
 * Let one person read one test password for a while.
 *
 * When the grant is to yourself the reveal appears here, because the grant id the reveal runs
 * against is only ever handed back by this request — the API has no endpoint that lists the grants
 * a person holds. A grant to somebody else ends at the confirmation: they reveal it themselves.
 */
export function GrantAccessModal({ account, onClose }: GrantAccessModalProps) {
  const me = useCurrentUser();
  const directory = useDirectoryQuery();
  const { grant } = useQaMutations();
  const [form, setForm] = useState({ grantedToUserId: me.id, reason: '' });
  const [issued, setIssued] = useState<CredentialGrantSummary | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function issue() {
    setError(undefined);
    try {
      setIssued(
        await grant.mutateAsync({
          testAccountId: account.id,
          grantedToUserId: form.grantedToUserId,
          reason: form.reason.trim() || `Testing with ${account.label}`,
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const toMe = issued?.grantedToUserId === me.id;

  return (
    <Modal
      open
      title={`Grant access to ${account.label}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{issued ? 'Done' : 'Cancel'}</Button>
          {issued ? null : (
            <Button
              variant="primary"
              loading={grant.isPending}
              disabled={!account.isActive}
              disabledReason="This login has been retired"
              onClick={() => void issue()}
            >
              Grant for 8 hours
            </Button>
          )}
        </>
      }
    >
      {issued ? (
        <>
          <p className="prose">
            {issued.grantedToName} can read this password until {formatDateTime(issued.expiresAt)}.
            Every reveal is written to the access log.
          </p>
          {toMe ? (
            <CredentialReveal grantId={issued.id} />
          ) : (
            <p className="muted">They reveal it from their own screen; it is never shown here.</p>
          )}
        </>
      ) : (
        <FormGrid>
          <FormField label="Who needs it" required>
            <Select
              value={form.grantedToUserId}
              onChange={(event) => setForm({ ...form, grantedToUserId: event.target.value })}
              options={(directory.data ?? []).map((person) => ({
                value: person.id,
                label: person.id === me.id ? `${person.name} (you)` : person.name,
              }))}
            />
          </FormField>
          <FormField label="What for" hint="Shown beside every reveal in the access log">
            <Input
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </FormField>
        </FormGrid>
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
