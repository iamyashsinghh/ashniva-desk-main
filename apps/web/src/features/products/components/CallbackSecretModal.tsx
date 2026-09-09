import { Alert, Button, Modal } from '@ashniva/ui';
import { useState } from 'react';

export interface CallbackSecretModalProps {
  secret: string;
  url: string;
  onClose: () => void;
}

/**
 * The only place a callback signing secret is ever displayed.
 *
 * The same one-shot handling as `SecretOnceModal`, and it says so just as plainly — but for a
 * different reason, and the difference is worth stating. A machine secret is unrecoverable because
 * only its hash is stored. This one *is* stored, encrypted, because Desk has to read it back to
 * sign with; it is shown once because putting a live signing key on a settings screen that anybody
 * with product access can reopen would make it a great deal easier to walk off with.
 */
export function CallbackSecretModal({ secret, url, onClose }: CallbackSecretModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
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
      title="Callback signing secret"
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
        This is the only time this secret is shown. If it is lost, rotate it — which means updating
        the receiver at the same moment, because deliveries signed with the new secret will not
        verify against the old one.
      </Alert>
      <p className="muted">
        Configure it at <code>{url}</code> to verify <code>X-Ashniva-Signature</code>. The signature
        is <code>HMAC-SHA256</code> over <code>&lt;timestamp&gt;.&lt;raw body&gt;</code>, hex,
        prefixed <code>sha256=</code>. Verify against the raw bytes, refuse a timestamp older than
        five minutes, and ignore a delivery id you have already processed.
      </p>
      <pre className="secret-once">{secret}</pre>
    </Modal>
  );
}
