import { TICKET_ACTION, type TicketAction, type TicketDetail } from '@ashniva/types';
import { Alert, Button, type ButtonVariant } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useTicketMutations } from '../api';
import { AssignTicketModal, ConvertTicketModal } from './TicketModals';
import { TicketTextModal } from './TicketTextModal';

type ModalKind = 'assign' | 'convert' | 'resolve' | 'reopen' | 'cancel' | null;

const ORDER: Array<{ action: TicketAction; label: string; variant: ButtonVariant }> = [
  { action: TICKET_ACTION.ASSIGN, label: 'Assign', variant: 'secondary' },
  { action: TICKET_ACTION.START, label: 'Start', variant: 'primary' },
  { action: TICKET_ACTION.CONVERT, label: 'Convert to task', variant: 'primary' },
  { action: TICKET_ACTION.WAIT_CLIENT, label: 'Wait for client', variant: 'secondary' },
  { action: TICKET_ACTION.RESUME, label: 'Resume', variant: 'primary' },
  { action: TICKET_ACTION.REVIEW, label: 'Send for review', variant: 'secondary' },
  { action: TICKET_ACTION.RESOLVE, label: 'Resolve…', variant: 'accent' },
  { action: TICKET_ACTION.CLOSE, label: 'Close', variant: 'secondary' },
  { action: TICKET_ACTION.REOPEN, label: 'Reopen', variant: 'danger' },
  { action: TICKET_ACTION.CANCEL, label: 'Cancel ticket', variant: 'ghost' },
];

/** Buttons enabled exactly as the API reports, with its reasons as tooltips. */
export function TicketActions({ ticket }: { ticket: TicketDetail }) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [error, setError] = useState<string | undefined>();
  const mutations = useTicketMutations(ticket.id);
  const availability = new Map(ticket.actions.map((entry) => [entry.action, entry]));

  async function run(action: TicketAction) {
    setError(undefined);
    try {
      switch (action) {
        case TICKET_ACTION.START:
          await mutations.start.mutateAsync({});
          break;
        case TICKET_ACTION.WAIT_CLIENT:
          await mutations.waitClient.mutateAsync({});
          break;
        case TICKET_ACTION.RESUME:
          await mutations.resume.mutateAsync({});
          break;
        case TICKET_ACTION.REVIEW:
          await mutations.review.mutateAsync({});
          break;
        case TICKET_ACTION.CLOSE:
          await mutations.close.mutateAsync({});
          break;
        case TICKET_ACTION.ASSIGN:
          setModal('assign');
          break;
        case TICKET_ACTION.CONVERT:
          setModal('convert');
          break;
        case TICKET_ACTION.RESOLVE:
          setModal('resolve');
          break;
        case TICKET_ACTION.REOPEN:
          setModal('reopen');
          break;
        case TICKET_ACTION.CANCEL:
          setModal('cancel');
          break;
        default:
          break;
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const busy = [
    mutations.start,
    mutations.waitClient,
    mutations.resume,
    mutations.review,
    mutations.close,
  ].some((mutation) => mutation.isPending);
  const visible = ORDER.filter((entry) => {
    const state = availability.get(entry.action);
    return state && (state.enabled || !state.reason?.startsWith('Not available while'));
  });

  return (
    <div className="actions-card">
      {visible.length === 0 ? (
        <p className="actions-card__hint">Nothing to do on this ticket right now.</p>
      ) : null}
      {visible.map((entry) => {
        const state = availability.get(entry.action);
        return (
          <Button
            key={entry.action}
            variant={entry.variant}
            disabled={!state?.enabled}
            disabledReason={state?.reason}
            loading={busy}
            onClick={() => void run(entry.action)}
          >
            {entry.label}
          </Button>
        );
      })}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <AssignTicketModal open={modal === 'assign'} ticket={ticket} onClose={() => setModal(null)} />
      <ConvertTicketModal
        open={modal === 'convert'}
        ticket={ticket}
        onClose={() => setModal(null)}
      />
      <TicketTextModal
        open={modal === 'resolve'}
        kind="resolve"
        ticket={ticket}
        onClose={() => setModal(null)}
      />
      <TicketTextModal
        open={modal === 'reopen'}
        kind="reopen"
        ticket={ticket}
        onClose={() => setModal(null)}
      />
      <TicketTextModal
        open={modal === 'cancel'}
        kind="cancel"
        ticket={ticket}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
