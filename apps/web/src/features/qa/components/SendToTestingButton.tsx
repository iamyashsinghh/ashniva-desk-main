import { PERMISSIONS } from '@ashniva/types';
import { Button } from '@ashniva/ui';
import { useState } from 'react';

import { usePermission } from '../../auth/session-context';
import { SendToTestingModal, type SendableKind, type TestingSubject } from './SendToTestingModal';

/**
 * "Send to testing", wherever the work is.
 *
 * Shown to whoever holds `qa:assign` — a project manager, a lead or the developer who built it.
 * Hiding it from everybody else is presentation only; the route refuses the call regardless.
 */
export function SendToTestingButton({
  subject,
  kind,
  variant = 'secondary',
  label = 'Send to testing',
}: {
  subject: TestingSubject;
  /** QA by default. A published release asks for a live verification instead — see the modal. */
  kind?: SendableKind;
  variant?: 'primary' | 'secondary';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const mayAssign = usePermission(PERMISSIONS.QA_ASSIGN);

  if (!mayAssign) {
    return null;
  }
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <SendToTestingModal subject={subject} kind={kind} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
