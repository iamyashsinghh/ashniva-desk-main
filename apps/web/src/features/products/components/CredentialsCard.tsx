import type { CreatedProductCredential, ProductCredentialSummary } from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  FormActions,
  FormField,
  FormGrid,
  Input,
  Table,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { SecretOnceModal } from './SecretOnceModal';

export interface CredentialsCardProps {
  credentials: ProductCredentialSummary[];
  canManage: boolean;
  onIssue: (label: string) => Promise<CreatedProductCredential>;
  onRotate: (credentialId: string) => Promise<CreatedProductCredential>;
  onRevoke: (credentialId: string) => Promise<unknown>;
}

const when = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

/**
 * The machine credentials a product authenticates with.
 *
 * A revoked credential stays on the list rather than disappearing. "Which key was this, and when
 * did we stop trusting it" is a question somebody asks during an incident, and a row that vanished
 * cannot answer it.
 */
export function CredentialsCard({
  credentials,
  canManage,
  onIssue,
  onRotate,
  onRevoke,
}: CredentialsCardProps) {
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState<CreatedProductCredential | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<CreatedProductCredential | unknown>) {
    setError(undefined);
    setBusy(true);
    try {
      const result = await work();
      // Only creation and rotation return a secret; revocation returns a summary with no secret.
      if (result && typeof result === 'object' && 'secret' in result) {
        setIssued(result as CreatedProductCredential);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Machine credentials"
      headerAddon={<span className="muted">Shown once. Rotate to replace, revoke to stop.</span>}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {canManage ? (
        <FormGrid>
          <FormField
            label="What is this credential for?"
            hint="“Carelix production”, “Irista staging”"
          >
            <Input
              value={label}
              placeholder="Carelix production"
              onChange={(event) => setLabel(event.target.value)}
            />
          </FormField>
          <div className="align-end">
            <FormActions>
              <Button
                variant="primary"
                disabled={busy || label.trim().length < 2}
                disabledReason="Give the credential a name first"
                onClick={() =>
                  void run(async () => {
                    const result = await onIssue(label.trim());
                    setLabel('');
                    return result;
                  })
                }
              >
                Issue credential
              </Button>
            </FormActions>
          </div>
        </FormGrid>
      ) : null}

      <Table<ProductCredentialSummary>
        aria-label="Machine credentials"
        rowKey={(row) => row.id}
        rows={credentials}
        empty={<p className="muted">No credentials yet. This product cannot raise tickets.</p>}
        columns={[
          { key: 'label', header: 'Label', render: (row) => row.label },
          {
            key: 'keyId',
            header: 'Key',
            hideOnMobile: true,
            // The public half only. Safe to show, safe to quote in a support conversation.
            render: (row) => <code>{row.keyId.slice(0, 12)}…</code>,
          },
          {
            key: 'state',
            header: 'State',
            render: (row) =>
              row.isActive ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="neutral">Revoked {when(row.revokedAt)}</Badge>
              ),
          },
          {
            key: 'used',
            header: 'Last used',
            hideOnMobile: true,
            render: (row) => (row.lastUsedAt ? when(row.lastUsedAt) : 'Never'),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) =>
              canManage && row.isActive ? (
                <FormActions>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => onRotate(row.id))}
                  >
                    Rotate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => onRevoke(row.id))}
                  >
                    Revoke
                  </Button>
                </FormActions>
              ) : null,
          },
        ]}
      />

      {issued ? <SecretOnceModal issued={issued} onClose={() => setIssued(null)} /> : null}
    </Card>
  );
}
