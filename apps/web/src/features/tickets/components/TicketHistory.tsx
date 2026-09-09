import { TICKET_STATUS_LABELS, type TicketHistoryEntry } from '@ashniva/types';
import { EmptyState } from '@ashniva/ui';

import { formatDateTime } from '../../../shared/lib/format';

export function TicketHistory({ history }: { history: TicketHistoryEntry[] }) {
  if (history.length === 0) {
    return <EmptyState title="No activity yet" />;
  }
  return (
    <ol className="timeline">
      {[...history].reverse().map((entry) => (
        <li key={entry.id} className="timeline__item">
          <span className="timeline__when">{formatDateTime(entry.createdAt)}</span>
          <span>
            <strong>{entry.changedBy.name}</strong> {describe(entry)}
            {entry.note ? <span className="timeline__note"> — {entry.note}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function describe(entry: TicketHistoryEntry): string {
  if (!entry.fromStatus) {
    return 'raised the ticket';
  }
  if (entry.fromStatus === entry.toStatus) {
    return 'updated it';
  }
  return `moved it from ${TICKET_STATUS_LABELS[entry.fromStatus]} to ${TICKET_STATUS_LABELS[entry.toStatus]}`;
}
