import { Alert, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTicketMutations } from '../api';
import type { ModalProps } from './TicketModals';

interface TextModalProps extends ModalProps {
  kind: 'resolve' | 'reopen' | 'cancel';
}

const TEXT_MODALS = {
  resolve: {
    title: 'Resolve ticket',
    label: 'What was done? (the requester will read this)',
    submit: 'Resolve',
    variant: 'accent' as const,
  },
  reopen: {
    title: 'Reopen ticket',
    label: 'Why is it being reopened?',
    submit: 'Reopen',
    variant: 'danger' as const,
  },
  cancel: {
    title: 'Cancel ticket',
    label: 'Reason (duplicate, invalid, …)',
    submit: 'Cancel ticket',
    variant: 'danger' as const,
  },
};

export function TicketTextModal({ open, ticket, onClose, kind }: TextModalProps) {
  const [text, setText] = useState('');
  const mutations = useTicketMutations(ticket.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const config = TEXT_MODALS[kind];
  const run = () => {
    const value = text.trim();
    if (kind === 'resolve') return mutations.resolve.mutateAsync({ resolution: value });
    if (kind === 'reopen') return mutations.reopen.mutateAsync({ reason: value });
    return mutations.cancel.mutateAsync({ reason: value });
  };
  const pending =
    mutations.resolve.isPending || mutations.reopen.isPending || mutations.cancel.isPending;
  return (
    <Modal
      open={open}
      title={config.title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant={config.variant}
            loading={pending}
            disabled={text.trim().length < 3}
            disabledReason="Write a few words"
            onClick={() => void wrap(run)()}
          >
            {config.submit}
          </Button>
        </>
      }
    >
      <FormField label={config.label} required>
        <Textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
