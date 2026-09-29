import {
  ASSIGNMENT_TYPE,
  ASSIGNMENT_TYPE_LABELS,
  PERMISSIONS,
  ROUTING_OUTCOME,
  ROUTING_OUTCOME_LABELS,
  type RoutingState,
  type TicketDetail,
  type TicketRoutingDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { KeyValueRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { IconTile } from '../../../shared/components/Icon';
import { Grow, Section } from '../../../shared/components/layout';
import { AppText, Button, Divider, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { ReassignSheet } from './ReassignSheet';

const INVALIDATE = [['tickets']] as const;

/**
 * How this ticket got where it is, and what can be done about it — the web's routing panel.
 *
 * Three audiences, separated by what the API returns rather than by hiding things: anybody
 * internal sees the state; the assignee gets Acknowledge; somebody with `support-routing:manage`
 * also gets the candidate trail (which names colleagues, so it is only built for them) and the
 * button that re-runs the router. Reassigning needs `ticket:reassign`.
 */
export function TicketRoutingCard({ ticket }: { ticket: TicketDetail }) {
  const theme = useTheme();
  const { user, can } = useSession();
  const canManage = can(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
  const canReassign = can(PERMISSIONS.TICKET_REASSIGN);
  const [reassigning, setReassigning] = useState(false);
  const routing = useResource<TicketRoutingDetail>(
    ['tickets', ticket.id, 'routing'],
    `/tickets/${ticket.id}/routing`,
  );

  const acknowledge = useApiMutation<void, TicketRoutingDetail>({
    path: `/tickets/${ticket.id}/acknowledge`,
    invalidate: INVALIDATE,
  });
  const reroute = useApiMutation<boolean, TicketRoutingDetail>({
    path: `/tickets/${ticket.id}/route`,
    body: (force) => ({ force }),
    invalidate: INVALIDATE,
  });
  const reassign = useApiMutation<{ assignedToId: string; reason: string }, TicketRoutingDetail>({
    path: `/tickets/${ticket.id}/reassign`,
    body: (input) => input,
    invalidate: INVALIDATE,
    onSuccess: () => setReassigning(false),
  });

  if (!routing.data) {
    return null;
  }

  const state = routing.data.state;
  const trail = routing.data.trail;
  const manual = state?.assignmentType === ASSIGNMENT_TYPE.MANUAL;
  const needsAck =
    ticket.assignedTo?.id === user?.id && state !== null && state.acknowledgedAt === null;
  const failure = acknowledge.error ?? reroute.error;

  return (
    <Section
      title="Routing"
      icon="git-network-outline"
      action={
        state ? (
          <Pill
            label={ROUTING_OUTCOME_LABELS[state.outcome]}
            tone={state.outcome === ROUTING_OUTCOME.AUTO_ASSIGNED ? 'success' : 'neutral'}
          />
        ) : undefined
      }
    >
      {state ? (
        <RoutingFacts ticket={ticket} state={state} />
      ) : (
        <AppText size="sm" tone="muted">
          This ticket has not been through the router.
        </AppText>
      )}

      {needsAck || canReassign || canManage ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {needsAck ? (
            <Grow>
              <Button
                label="Acknowledge"
                icon="hand-left-outline"
                size="sm"
                loading={acknowledge.busy}
                accessibilityHint="Confirms you have picked this ticket up"
                onPress={() => void acknowledge.run()}
              />
            </Grow>
          ) : null}
          {canReassign ? (
            <Grow>
              <Button
                label="Reassign"
                icon="swap-horizontal"
                size="sm"
                variant="secondary"
                onPress={() => {
                  reassign.reset();
                  setReassigning(true);
                }}
              />
            </Grow>
          ) : null}
          {canManage ? (
            <Grow>
              <Button
                label={manual ? 'Route again anyway' : 'Run the router'}
                icon="shuffle-outline"
                size="sm"
                variant="ghost"
                loading={reroute.busy}
                onPress={() => void reroute.run(manual)}
              />
            </Grow>
          ) : null}
        </View>
      ) : null}

      {failure ? (
        <Banner tone="danger" role="alert">
          {failure}
        </Banner>
      ) : null}

      {canManage && trail.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Divider />
          <AppText variant="label" tone="muted" uppercase>
            Candidates considered
          </AppText>
          {trail.map((row) => (
            <View
              key={row.id}
              style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
            >
              <IconTile
                name={row.accepted ? 'checkmark' : 'close'}
                tone={row.accepted ? 'success' : 'neutral'}
                size={28}
              />
              <View style={{ flex: 1 }}>
                <AppText size="sm" weight="medium">
                  {row.user?.name ?? 'The queue'}
                </AppText>
                <AppText size="xs" tone="muted">
                  {row.detail}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <ReassignSheet
        visible={reassigning}
        ticket={ticket}
        busy={reassign.busy}
        error={reassign.error}
        onClose={() => setReassigning(false)}
        onSave={(input) => void reassign.run(input)}
      />
    </Section>
  );
}

function RoutingFacts({ ticket, state }: { ticket: TicketDetail; state: RoutingState }) {
  return (
    <View>
      <KeyValueRow
        label="Assigned to"
        value={`${ticket.assignedTo?.name ?? 'Nobody'} · ${ASSIGNMENT_TYPE_LABELS[state.assignmentType]}`}
      />
      <KeyValueRow
        label="Acknowledged"
        value={
          state.acknowledgedAt
            ? `${formatDateTime(state.acknowledgedAt) ?? ''} by ${state.acknowledgedBy?.name ?? 'the assignee'}`
            : `Not yet${state.acknowledgeDueAt ? ` — due ${formatDateTime(state.acknowledgeDueAt) ?? ''}` : ''}`
        }
      />
      {state.escalationLevel > 0 ? (
        <KeyValueRow label="Escalation" value={`Level ${state.escalationLevel}`} tone="danger" />
      ) : null}
      {state.queueReason ? (
        <KeyValueRow label="Why it is waiting" value={state.queueReason} />
      ) : null}
      {state.manualOverrideBy ? (
        <KeyValueRow
          label="Assigned by hand"
          value={`${state.manualOverrideBy.name}${state.manualOverrideReason ? ` — ${state.manualOverrideReason}` : ''}`}
        />
      ) : null}
    </View>
  );
}
