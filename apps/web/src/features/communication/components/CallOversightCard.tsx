import { Card, EmptyState } from '@ashniva/ui';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { useOversightCallsQuery } from '../api';

/**
 * Internal calls across the organization.
 *
 * The other half of oversight: `GET /communication/oversight/calls` shipped alongside the
 * conversations list and nothing ever called it, so who rang whom was reachable only by hand. It
 * belongs in the administrator view rather than the ordinary one because it is the same
 * inspection, recorded in the audit log the same way — and it is loaded only once somebody has
 * asked for that view, so merely opening Messages does not write an inspection record.
 *
 * There is no play button: whether a recording may be listened to runs the recording service's own
 * two gates, and the server sets `canPlayRecording` to false for an inspector on purpose.
 */
export function CallOversightCard({
  projectId,
  enabled,
}: {
  projectId?: string;
  enabled: boolean;
}) {
  const calls = useOversightCallsQuery(projectId, enabled);
  const rows = calls.data ?? [];

  return (
    <Card title="Internal calls" headerAddon={<span className="muted">Administrator view</span>}>
      <QueryState
        isLoading={calls.isLoading}
        isError={calls.isError}
        error={calls.error}
        onRetry={() => void calls.refetch()}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="No internal calls"
            description="Calls placed from a conversation appear here, with who was on them."
          />
        ) : (
          <ul className="chat-list">
            {rows.map((call) => (
              <li key={call.id} className="chat-list__item">
                <span>
                  {call.initiatedBy?.name ?? 'Somebody'}
                  <span className="timeline__note">
                    {' '}
                    → {call.participants.map((person) => person.name).join(', ') || 'nobody'}
                  </span>
                  {call.hasRecording ? <span className="timeline__note"> · recorded</span> : null}
                </span>
                <span className="timeline__note">
                  {call.status} · {formatDateTime(call.startedAt)}
                  {call.durationSeconds === null
                    ? ''
                    : ` · ${Math.round(call.durationSeconds / 60)} min`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}
