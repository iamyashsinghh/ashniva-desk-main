import { CALL_STATUS_LABELS } from '@ashniva/types';
import { Card, EmptyState } from '@ashniva/ui';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { useOversightCallsQuery } from '../api';

export interface OversightCallsProps {
  projectId?: string;
  enabled: boolean;
}

/**
 * Internal call history across the organization, for whoever holds `conversation:inspect`.
 *
 * `GET /communication/oversight/calls` shipped with package 9b and nothing had ever called it,
 * so the call half of oversight existed only in tests: an administrator could read every thread
 * and could not see that a call had happened at all.
 *
 * Metadata only, and that is the whole design rather than a limitation of this screen. Whether
 * the *audio* may be played is a separate decision the server makes per call, and it does not
 * follow from being able to see that a call took place.
 */
export function OversightCalls({ projectId, enabled }: OversightCallsProps) {
  const calls = useOversightCallsQuery(projectId, enabled);

  return (
    <Card title="Internal calls">
      <p className="chat-oversight" role="status">
        Every viewing of this list is recorded in the audit log.
      </p>
      <QueryState
        isLoading={calls.isLoading}
        isError={calls.isError}
        error={calls.error}
        onRetry={() => void calls.refetch()}
      >
        {(calls.data ?? []).length === 0 ? (
          <EmptyState
            title="No internal calls"
            description="Calls placed from a conversation appear here."
          />
        ) : (
          <ul className="chat-list">
            {(calls.data ?? []).map((call) => (
              <li key={call.id} className="chat-list__item">
                <span>
                  {CALL_STATUS_LABELS[call.status as keyof typeof CALL_STATUS_LABELS]}
                  <span className="timeline__note">
                    {' '}
                    · {call.initiatedBy?.name ?? 'Somebody'}
                    {call.participants.length > 0
                      ? ` → ${call.participants.map((person) => person.name).join(', ')}`
                      : ''}
                  </span>
                </span>
                <span className="timeline__note">
                  {formatDateTime(call.startedAt)}
                  {call.durationSeconds ? ` · ${Math.round(call.durationSeconds / 60)} min` : ''}
                  {call.hasRecording ? ' · recorded' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}
