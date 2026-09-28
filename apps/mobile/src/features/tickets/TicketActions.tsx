import { TICKET_ACTION, type TicketDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Grow, Section } from '../../shared/components/layout';
import { Button, Field, Input } from '../../shared/components/primitives';
import { animateLayout } from '../../shared/theme/motion';
import { useTheme } from '../../shared/theme/ThemeProvider';
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
  const theme = useTheme();
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
    <Section title="Actions">
      {canStart || canResume ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {canStart ? (
            <Grow>
              <Button
                label="Start working on it"
                loading={start.busy}
                accessibilityHint="Takes the ticket and marks it in progress"
                onPress={() => void start.run()}
              />
            </Grow>
          ) : null}
          {canResume ? (
            <Grow>
              <Button
                label="Back in progress"
                variant="secondary"
                loading={resume.busy}
                accessibilityHint="The client has answered and work can continue"
                onPress={() => void resume.run()}
              />
            </Grow>
          ) : null}
        </View>
      ) : null}

      {(canWait || canResolve) && !resolveOpen ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {canWait ? (
            <Grow>
              <Button
                label="Waiting for the client"
                variant="secondary"
                loading={waitClient.busy}
                accessibilityHint="Pauses the ticket until the client comes back"
                onPress={() => void waitClient.run()}
              />
            </Grow>
          ) : null}
          {canResolve ? (
            <Grow>
              <Button
                label="Resolve"
                variant="secondary"
                icon="check"
                accessibilityHint="Closes the ticket with an explanation the client reads"
                onPress={() => {
                  animateLayout();
                  setResolveOpen(true);
                }}
              />
            </Grow>
          ) : null}
        </View>
      ) : null}

      {canResolve && resolveOpen ? (
        <View
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.md,
            gap: theme.spacing.md,
            padding: theme.spacing.md,
          }}
        >
          <Field
            label="What was done"
            required
            hint="The client reads this. Plain language, no internal detail."
          >
            <Input
              accessibilityLabel="What was done"
              autoFocus
              multiline
              numberOfLines={3}
              onChangeText={setResolution}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
              value={resolution}
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Grow>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  animateLayout();
                  setResolveOpen(false);
                }}
              />
            </Grow>
            <Grow>
              <Button
                label="Resolve the ticket"
                loading={resolve.busy}
                disabled={resolution.trim().length < 3}
                onPress={() => void resolve.run({ resolution: resolution.trim() })}
              />
            </Grow>
          </View>
        </View>
      ) : null}

      {failure ? (
        <Banner tone="danger" role="alert">
          {failure}
        </Banner>
      ) : null}
    </Section>
  );
}
