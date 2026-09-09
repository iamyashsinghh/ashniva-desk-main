import { TICKET_ACTION, type TicketDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { AppText, Button, Card, Field, Input } from '../../shared/components/primitives';
import { ticketCan } from './ticket-display';

/**
 * Moving a ticket along from a phone.
 *
 * Four transitions, and each is one somebody genuinely takes away from their desk: picking a
 * ticket up, parking it because the client has to answer, un-parking it when they have, and
 * resolving it. Parking without un-parking would be a trap — a ticket you can only put down —
 * so the pair travels together.
 *
 * Triage, reassignment, conversion into tasks and cancellation are not here. They are decisions
 * about who does what next, and they belong with the full queue in front of you.
 *
 * The resolution is a form rather than a confirm, because the client reads it. A one-tap
 * "Resolve" would produce resolutions that say nothing, which is how a ticket gets reopened.
 */
export function TicketActions({
  ticket,
  onChanged,
}: {
  ticket: TicketDetail;
  onChanged: () => void;
}) {
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState('');

  const invalidate = [['tickets', ticket.id], ['tickets']];
  const transition = (action: string) => ({
    path: `/tickets/${ticket.id}/${action}`,
    invalidate,
    onSuccess: onChanged,
  });

  const start = useApiMutation<void, TicketDetail>(transition('start'));
  const waitClient = useApiMutation<void, TicketDetail>(transition('wait-client'));
  const resume = useApiMutation<void, TicketDetail>(transition('resume'));
  const resolve = useApiMutation<{ resolution: string }, TicketDetail>({
    path: `/tickets/${ticket.id}/resolve`,
    body: (variables) => variables,
    invalidate,
    onSuccess: () => {
      setResolution('');
      setResolveOpen(false);
      onChanged();
    },
  });

  const canStart = ticketCan(ticket.actions, TICKET_ACTION.START);
  const canWait = ticketCan(ticket.actions, TICKET_ACTION.WAIT_CLIENT);
  const canResume = ticketCan(ticket.actions, TICKET_ACTION.RESUME);
  const canResolve = ticketCan(ticket.actions, TICKET_ACTION.RESOLVE);
  const failure = start.error ?? waitClient.error ?? resume.error ?? resolve.error;

  if (!canStart && !canWait && !canResume && !canResolve) {
    return null;
  }

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Actions
      </AppText>

      {canStart ? (
        <Button
          label="Start working on it"
          loading={start.busy}
          accessibilityHint="Takes the ticket and marks it in progress"
          onPress={() => void start.run()}
        />
      ) : null}

      {canResume ? (
        <Button
          label="Back in progress"
          variant="secondary"
          loading={resume.busy}
          accessibilityHint="The client has answered and work can continue"
          onPress={() => void resume.run()}
        />
      ) : null}

      {canWait ? (
        <Button
          label="Waiting for the client"
          variant="secondary"
          loading={waitClient.busy}
          accessibilityHint="Pauses the ticket until the client comes back"
          onPress={() => void waitClient.run()}
        />
      ) : null}

      {canResolve && !resolveOpen ? (
        <Button
          label="Resolve"
          variant="secondary"
          accessibilityHint="Closes the ticket with an explanation the client reads"
          onPress={() => setResolveOpen(true)}
        />
      ) : null}

      {canResolve && resolveOpen ? (
        <>
          <Field
            label="What was done"
            hint="The client reads this. Plain language, no internal detail."
          >
            <Input
              accessibilityLabel="What was done"
              multiline
              numberOfLines={3}
              onChangeText={setResolution}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
              value={resolution}
            />
          </Field>
          <Button
            label="Resolve the ticket"
            loading={resolve.busy}
            disabled={resolution.trim().length < 3}
            onPress={() => void resolve.run({ resolution: resolution.trim() })}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setResolveOpen(false)} />
        </>
      ) : null}

      {failure ? (
        <AppText tone="danger" size="sm">
          {failure}
        </AppText>
      ) : null}
    </Card>
  );
}
