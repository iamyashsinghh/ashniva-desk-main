import type { CreatedProductCredential } from '@ashniva/types';
import { Alert, Button, Modal } from '@ashniva/ui';
import { useState } from 'react';

export interface SecretOnceModalProps {
  issued: CreatedProductCredential;
  onClose: () => void;
}

/**
 * The only place a machine secret is ever displayed.
 *
 * It says so plainly, because the alternative is somebody closing the dialog expecting to find
 * the value again on the product page and discovering an hour later that it is gone. The stored
 * form is a hash: there is no screen, endpoint or permission that can show it a second time, and
 * the only recovery is rotation.
 */
export function SecretOnceModal({ issued, onClose }: SecretOnceModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.secret);
      setCopied(true);
    } catch {
      // Clipboard access can be refused. The value is on screen and selectable either way.
      setCopied(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Credential for ${issued.credential.label}`}
      footer={
        <>
          <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button variant="primary" onClick={onClose}>
            I have saved it
          </Button>
        </>
      }
    >
      <Alert tone="danger">
        This is the only time this secret is shown. Nothing can display it again — if it is lost,
        rotate the credential to get a new one.
      </Alert>
      <p className="muted">
        Configure it in {issued.credential.label} as the bearer token for{' '}
        <code>POST /api/v1/support/tickets</code>.
      </p>
      <pre className="secret-once">{issued.secret}</pre>
    </Modal>
  );
}
