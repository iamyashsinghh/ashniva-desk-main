import {
  ASSIGNMENT_TYPE_LABELS,
  PERMISSIONS,
  ROUTING_OUTCOME_LABELS,
  type RoutingState,
  type TicketDetail,
} from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  DescriptionList,
  FormActions,
  type DescriptionItem,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useCurrentUser, usePermission } from '../../auth/session-context';
import { useRoutingMutations, useTicketRoutingQuery } from '../routing-api';
import { ReassignModal } from './ReassignModal';
import { RoutingTrail } from './RoutingTrail';

import '../support-routing.css';

export interface TicketRoutingPanelProps {
  ticket: TicketDetail;
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

/**
 * How this ticket got where it is, and what can be done about it.
 *
 * Three audiences on one panel, separated by what the API will actually return rather than by
 * hiding things in the markup. Anybody internal sees the state. The assignee gets Acknowledge.
 * Somebody with `support-routing:manage` also gets the candidate trail — which names colleagues
 * and says why each was passed over — and the buttons that re-run the router.
 */
export function TicketRoutingPanel({ ticket }: TicketRoutingPanelProps) {
  const user = useCurrentUser();
  const canManage = usePermission(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
  const canReassign = usePermission(PERMISSIONS.TICKET_REASSIGN);
  const routing = useTicketRoutingQuery(ticket.id);
  const mutations = useRoutingMutations(ticket.id);
  const [reassigning, setReassigning] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const state = routing.data?.state ?? null;
  const isAssignee = ticket.assignedTo?.id === user.id;
  const needsAcknowledgement = isAssignee && state !== null && state.acknowledgedAt === null;

  const run = async (work: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  if (routing.isLoading || routing.isError) {
    return null;
  }

  return (
    <Card
      title="Routing"
      headerAddon={
        state ? (
          <Badge tone={state.outcome === 'AUTO_ASSIGNED' ? 'success' : 'neutral'}>
            {ROUTING_OUTCOME_LABELS[state.outcome]}
          </Badge>
        ) : undefined
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {state === null ? (
        <p className="muted">This ticket has not been through the router.</p>
      ) : (
        <DescriptionList items={routingItems(ticket, state)} />
      )}

      <div className="stack-top">
        <FormActions>
          {needsAcknowledgement ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void run(() => mutations.acknowledge.mutateAsync())}
            >
              Acknowledge
            </Button>
          ) : null}
          {canReassign ? (
            <Button size="sm" onClick={() => setReassigning(true)}>
              Reassign
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void run(() => mutations.reroute.mutateAsync(state?.assignmentType === 'MANUAL'))
              }
            >
              {state?.assignmentType === 'MANUAL' ? 'Route again anyway' : 'Run the router'}
            </Button>
          ) : null}
        </FormActions>
      </div>

      {canManage ? (
        <>
          <h3 className="section-title">Candidates considered</h3>
          <RoutingTrail rows={routing.data?.trail ?? []} />
        </>
      ) : null}

      {reassigning ? (
        <ReassignModal
          ticket={ticket}
          onClose={() => setReassigning(false)}
          onSave={(input) => mutations.reassign.mutateAsync(input)}
        />
      ) : null}
    </Card>
  );
}

/** How the ticket was routed. The last three rows exist only when the router had something to say. */
function routingItems(ticket: TicketDetail, state: RoutingState): DescriptionItem[] {
  const items: DescriptionItem[] = [
    {
      key: 'assigned-to',
      term: 'Assigned to',
      description: `${ticket.assignedTo?.name ?? 'Nobody'} · ${
        ASSIGNMENT_TYPE_LABELS[state.assignmentType]
      }`,
    },
    {
      key: 'acknowledged',
      term: 'Acknowledged',
      description: state.acknowledgedAt
        ? `${when(state.acknowledgedAt)} by ${state.acknowledgedBy?.name ?? 'the assignee'}`
        : `Not yet — due ${when(state.acknowledgeDueAt)}`,
    },
  ];
  if (state.escalationLevel > 0) {
    items.push({
      key: 'escalation',
      term: 'Escalation',
      description: `Level ${state.escalationLevel}`,
    });
  }
  if (state.queueReason) {
    items.push({ key: 'queue-reason', term: 'Why it is waiting', description: state.queueReason });
  }
  if (state.manualOverrideBy) {
    items.push({
      key: 'manual-override',
      term: 'Assigned by hand',
      description: `${state.manualOverrideBy.name} — ${state.manualOverrideReason}`,
    });
  }
  return items;
}
