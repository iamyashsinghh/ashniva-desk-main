import { Alert, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { usePortalTicketMutations } from '../api';

interface PortalReopenModalProps {
  ticketId: string;
  onClose: () => void;
}

/** A client reopens a resolved ticket by saying what is still wrong. */
export function PortalReopenModal({ ticketId, onClose }: PortalReopenModalProps) {
  const [reason, setReason] = useState('');
  const { reopen } = usePortalTicketMutations(ticketId);
  const { error, wrap } = useSubmitHandler(onClose);
  return (
    <Modal
      open
      title="Reopen ticket"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant="danger"
            loading={reopen.isPending}
            disabled={reason.trim().length < 3}
            disabledReason="Tell us what is still wrong"
            onClick={() => void wrap(() => reopen.mutateAsync({ reason: reason.trim() }))()}
          >
            Reopen
          </Button>
        </>
      }
    >
      <FormField label="What is still wrong?" required>
        <Textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
