import {
  MESSAGE_TEMPLATE_LABELS,
  OUTBOUND_MESSAGE_STATUS_LABELS,
  type OutboundMessageStatus,
  type OutboundMessageSummary,
} from '@ashniva/types';
import { Card, EmptyState, StatusPill, Table, type TableColumn, type Tone } from '@ashniva/ui';

import { QueryState } from '../../../shared/components/QueryState';
import { formatRelative } from '../../../shared/lib/format';
import { useMessageHistoryQuery, type MessageChannel } from '../api';

const TONES: Record<OutboundMessageStatus, Tone> = {
  QUEUED: 'neutral',
  SENDING: 'progress',
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
};

/**
 * Recent outbound messages.
 *
 * Recipients arrive already masked from the API. This is an operational record — did it go out,
 * did it bounce — not a directory of everyone's address.
 */
export function MessageHistory({ channel }: { channel: MessageChannel }) {
  const query = useMessageHistoryQuery(channel);

  const columns: TableColumn<OutboundMessageSummary>[] = [
    {
      key: 'template',
      header: 'Message',
      render: (row) => MESSAGE_TEMPLATE_LABELS[row.template],
    },
    { key: 'destination', header: 'To', width: '200px', render: (row) => row.destination },
    {
      key: 'queued',
      header: 'Queued',
      hideOnMobile: true,
      width: '120px',
      render: (row) => <span className="muted">{formatRelative(row.queuedAt)}</span>,
    },
    {
      key: 'attempts',
      header: 'Attempts',
      hideOnMobile: true,
      width: '90px',
      render: (row) => row.attempts,
    },
    {
      key: 'status',
      header: 'Status',
      width: '140px',
      render: (row) => (
        <StatusPill tone={TONES[row.status]} label={OUTBOUND_MESSAGE_STATUS_LABELS[row.status]} />
      ),
    },
  ];

  return (
    <Card title="Recent messages">
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <>
            <Table
              aria-label={`Recent ${channel === 'EMAIL' ? 'email' : 'WhatsApp'} messages`}
              columns={columns}
              rows={query.data.items}
              rowKey={(row) => row.id}
              empty={
                <EmptyState
                  title="Nothing sent yet"
                  description="Messages appear here once something has been sent."
                />
              }
            />
            {query.data.items.some((row) => row.lastError) ? (
              <ul className="messaging-errors">
                {query.data.items
                  .filter((row) => row.lastError)
                  .slice(0, 5)
                  .map((row) => (
                    <li key={row.id}>
                      <strong>{MESSAGE_TEMPLATE_LABELS[row.template]}</strong> — {row.lastError}
                    </li>
                  ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </QueryState>
    </Card>
  );
}
