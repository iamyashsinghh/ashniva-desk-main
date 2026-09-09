import { SLA_EVENT_KIND_LABELS, type SlaTargetState, type TicketSla } from '@ashniva/types';
import {
  Badge,
  Card,
  DescriptionList,
  EmptyState,
  Toolbar,
  type DescriptionItem,
} from '@ashniva/ui';

import { SlaStatusPill } from '../../../shared/components/StatusPills';
import { formatDateTime } from '../../../shared/lib/format';
import { useTicketSlaEventsQuery } from '../api';
import { describeRemaining } from '../sla-format';

/** One target's value: the pill, the remaining time in words, and the deadline under it. */
function TargetValue({ label, target }: { label: string; target: SlaTargetState }) {
  return (
    <>
      <Toolbar aria-label={`${label} state`}>
        <SlaStatusPill status={target.status} />
        <span>{describeRemaining(target)}</span>
      </Toolbar>
      {target.dueAt ? <div className="muted">Due {formatDateTime(target.dueAt)}</div> : null}
    </>
  );
}

interface TicketSlaCardProps {
  ticketId: string;
  sla: TicketSla | null;
  /** Staff see the event history; the portal only sees the targets. */
  showEvents?: boolean;
}

/** SLA state of a ticket, exactly as the backend computed it. */
export function TicketSlaCard({ ticketId, sla, showEvents = false }: TicketSlaCardProps) {
  const events = useTicketSlaEventsQuery(ticketId, showEvents && Boolean(sla));
  return (
    <Card
      title="SLA"
      headerAddon={
        sla ? <SlaStatusPill status={sla.overall} /> : <Badge tone="neutral">No policy</Badge>
      }
    >
      {!sla ? (
        <EmptyState
          title="No SLA applies"
          description="Add a default policy or one for this client or project under Admin → SLA policies."
        />
      ) : (
        <>
          <DescriptionList items={slaItems(sla)} />
          {showEvents && events.data && events.data.length > 0 ? (
            <ul className="timeline stack-top">
              {events.data.map((event) => (
                <li key={event.id} className="timeline__item">
                  <span className="timeline__when">{formatDateTime(event.createdAt)}</span>
                  <span>
                    {SLA_EVENT_KIND_LABELS[event.kind]}
                    {event.detail ? (
                      <span className="timeline__note"> · {event.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** The card's rows. The pause row is only shown once a clock has actually been stopped. */
function slaItems(sla: TicketSla): DescriptionItem[] {
  const items: DescriptionItem[] = [
    {
      key: 'first-response',
      term: 'First response',
      description: <TargetValue label="First response" target={sla.firstResponse} />,
    },
    {
      key: 'resolution',
      term: 'Resolution',
      description: <TargetValue label="Resolution" target={sla.resolution} />,
    },
    { key: 'policy', term: 'Policy', description: sla.policy?.name ?? '—' },
  ];
  if (sla.isPaused || sla.pausedTotalMinutes > 0) {
    items.push({
      key: 'paused',
      term: 'Paused',
      description: `${sla.isPaused ? `Since ${formatDateTime(sla.pausedSince)}` : 'Not paused'}${
        sla.pausedTotalMinutes > 0 ? ` · ${sla.pausedTotalMinutes} min in total` : ''
      }`,
    });
  }
  return items;
}
