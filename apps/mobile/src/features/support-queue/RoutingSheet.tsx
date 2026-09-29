import {
  ASSIGNMENT_TYPE,
  ASSIGNMENT_TYPE_LABELS,
  ROUTING_OUTCOME_LABELS,
  type UnassignedTicketSummary,
} from '@ashniva/types';
import { ActivityIndicator } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { KeyValueRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { AppText, Button, Divider } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useReroute, useTicketRouting } from './api';
import { RoutingTrail } from './RoutingTrail';

/**
 * How a queued ticket got here, and the one thing that often fixes it: running the router again
 * now that somebody is back or a rota has changed. The web shows this on the ticket; the queue
 * is where a lead on a phone is when they want it.
 */
export function RoutingSheet({
  ticket,
  onClose,
  onOpenTicket,
}: {
  ticket: UnassignedTicketSummary;
  onClose: () => void;
  onOpenTicket: () => void;
}) {
  const theme = useTheme();
  const routing = useTicketRouting(ticket.id);
  const reroute = useReroute(ticket.id);
  const state = routing.data?.state ?? null;
  const manual = state?.assignmentType === ASSIGNMENT_TYPE.MANUAL;

  let body = <ActivityIndicator color={theme.colors.primary} />;
  if (routing.error) {
    body = (
      <Banner tone="danger" role="alert">
        {errorMessage(routing.error)}
      </Banner>
    );
  } else if (routing.data) {
    body = (
      <>
        {state ? (
          <>
            <KeyValueRow label="Outcome" value={ROUTING_OUTCOME_LABELS[state.outcome]} />
            <KeyValueRow label="Assignment" value={ASSIGNMENT_TYPE_LABELS[state.assignmentType]} />
            <KeyValueRow label="Routed" value={formatDateTime(state.routedAt) ?? '—'} />
            {state.escalationLevel > 0 ? (
              <KeyValueRow
                label="Escalation"
                value={`Level ${state.escalationLevel}`}
                tone="danger"
              />
            ) : null}
            <KeyValueRow label="Why it is waiting" value={state.queueReason ?? 'Never routed'} />
            {state.manualOverrideBy ? (
              <KeyValueRow
                label="Assigned by hand"
                value={`${state.manualOverrideBy.name}${state.manualOverrideReason ? ` — ${state.manualOverrideReason}` : ''}`}
              />
            ) : null}
          </>
        ) : (
          <AppText size="sm" tone="muted">
            This ticket has not been through the router.
          </AppText>
        )}
        <Divider />
        <AppText variant="label" tone="muted" uppercase>
          Candidates considered
        </AppText>
        <RoutingTrail rows={routing.data.trail} />
      </>
    );
  }

  return (
    <Sheet
      visible
      title={`Routing — ${ticket.key}`}
      subtitle={ticket.title}
      onClose={onClose}
      footer={
        <>
          <Button
            label="Open ticket"
            variant="secondary"
            onPress={onOpenTicket}
            style={{ flex: 1 }}
          />
          <Button
            label={manual ? 'Route again anyway' : 'Run the router'}
            icon="shuffle-outline"
            loading={reroute.busy}
            disabled={!routing.data}
            onPress={() => void reroute.run(manual)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      {body}
      {reroute.error ? (
        <Banner tone="danger" role="alert">
          {reroute.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
