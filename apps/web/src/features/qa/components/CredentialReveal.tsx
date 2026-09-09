import { Alert, Button, DescriptionList } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { revealCredential } from '../api';
import { useTimedReveal } from '../use-timed-reveal';

interface CredentialRevealProps {
  /** The live grant this person holds, or null when they hold none this session. */
  grantId: string | null;
  /** Why the button is off, when it is. A disabled control must say what would turn it on. */
  unavailableReason?: string;
}

/**
 * The one control in the web app that puts a password on screen.
 *
 * The value is fetched outside React Query (`revealCredential`, not a mutation — a mutation would
 * keep a copy of its result in the mutation cache), is held by `useTimedReveal` in this
 * component's state alone, and disappears when the countdown ends, when "Hide it now" is pressed
 * or when the card unmounts. Nothing here writes it to a cache, to storage, to a URL or to a log.
 */
export function CredentialReveal({ grantId, unavailableReason }: CredentialRevealProps) {
  const { revealed, secondsLeft, hasLapsed, show, hide } = useTimedReveal();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const blocked = unavailableReason ?? (grantId ? undefined : 'Nobody has granted you this login');

  async function run() {
    if (!grantId) {
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      show(await revealCredential(grantId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="qa-reveal">
      {revealed ? (
        <div className="qa-reveal__secret" aria-live="polite">
          <DescriptionList
            items={[
              {
                key: 'username',
                term: 'Username',
                description: <code>{revealed.username}</code>,
              },
              {
                key: 'password',
                term: 'Password',
                description: <code className="qa-reveal__value">{revealed.secret}</code>,
              },
            ]}
          />
          <p className="muted">
            Hidden again in {secondsLeft}s. Nothing keeps a copy — reveal it again if you need it.
          </p>
          <Button size="sm" onClick={hide}>
            Hide it now
          </Button>
        </div>
      ) : (
        <>
          <Button
            variant="primary"
            size="sm"
            loading={pending}
            disabled={Boolean(blocked)}
            disabledReason={blocked}
            onClick={() => void run()}
          >
            {hasLapsed ? 'Reveal again' : 'Reveal password'}
          </Button>
          {hasLapsed ? <p className="muted">Hidden again. Every reveal is logged.</p> : null}
        </>
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
