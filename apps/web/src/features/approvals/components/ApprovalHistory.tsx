import { APPROVAL_STATUS_LABELS, type ApprovalHistoryEntry } from '@ashniva/types';
import { Badge, EmptyState } from '@ashniva/ui';

import { formatDateTime } from '../../../shared/lib/format';

/** Two-sided history: who did what, for the provider or for the client, and what they said. */
export function ApprovalHistory({ history }: { history: ApprovalHistoryEntry[] }) {
  if (history.length === 0) {
    return <EmptyState title="No history yet" />;
  }
  return (
    <ul className="timeline">
      {history.map((entry) => (
        <li key={entry.id} className="timeline__item">
          <span className="timeline__when">{formatDateTime(entry.createdAt)}</span>
          <span>
            {APPROVAL_STATUS_LABELS[entry.toStatus]}{' '}
            <Badge tone={entry.side === 'CLIENT' ? 'review' : 'neutral'}>
              {entry.side === 'CLIENT' ? 'Client' : 'Provider'}
            </Badge>
            <span className="timeline__note">
              {' '}
              · {entry.actor.name}
              {entry.comment ? ` · “${entry.comment}”` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
