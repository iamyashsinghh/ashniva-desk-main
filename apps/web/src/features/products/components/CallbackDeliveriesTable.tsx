import {
  SUPPORT_CALLBACK_EVENT_LABELS,
  type SupportCallbackDeliverySummary,
  type SupportCallbackStatus,
} from '@ashniva/types';
import { Badge, Button, Table, type Tone } from '@ashniva/ui';

import { useCallbackDeliveriesQuery, useCallbackMutations } from '../callbacks-api';

const TONE: Record<SupportCallbackStatus, Tone> = {
  SENT: 'success',
  FAILED: 'danger',
  SENDING: 'progress',
  QUEUED: 'info',
  SKIPPED: 'neutral',
};

export interface CallbackDeliveriesTableProps {
  productId: string;
}

/**
 * What was sent, when, and how the endpoint answered.
 *
 * A failed delivery keeps its row and its last error rather than disappearing, for the same reason
 * a revoked credential does: "what did we try to tell them, and what came back" is a question
 * somebody asks during an incident, and a row that vanished cannot answer it.
 *
 * Redelivery re-sends the *same* delivery id. Receivers are told to deduplicate on it, so one they
 * have already processed is a no-op on their side — which is why this re-queues the row instead of
 * creating a new one, unlike resending an email.
 */
export function CallbackDeliveriesTable({ productId }: CallbackDeliveriesTableProps) {
  const deliveries = useCallbackDeliveriesQuery(productId);
  const { redeliver } = useCallbackMutations(productId);

  return (
    <Table<SupportCallbackDeliverySummary>
      aria-label="Recent callback deliveries"
      rowKey={(row) => row.id}
      rows={deliveries.data ?? []}
      empty={<p className="muted">Nothing has been sent yet.</p>}
      columns={[
        {
          key: 'event',
          header: 'Event',
          render: (row) => SUPPORT_CALLBACK_EVENT_LABELS[row.event] ?? row.event,
        },
        {
          key: 'status',
          header: 'Status',
          render: (row) => <Badge tone={TONE[row.status]}>{row.status}</Badge>,
        },
        { key: 'attempts', header: 'Attempts', render: (row) => row.attempts, align: 'right' },
        {
          key: 'answered',
          header: 'Answered',
          hideOnMobile: true,
          render: (row) => row.responseStatus ?? row.lastError?.slice(0, 60) ?? '—',
        },
        {
          key: 'queuedAt',
          header: 'Queued',
          hideOnMobile: true,
          render: (row) => new Date(row.queuedAt).toLocaleString(),
        },
        {
          key: 'actions',
          header: '',
          render: (row) =>
            row.status === 'FAILED' || row.status === 'SKIPPED' ? (
              <Button
                disabled={redeliver.isPending}
                onClick={() => void redeliver.mutateAsync(row.id)}
              >
                Redeliver
              </Button>
            ) : null,
        },
      ]}
    />
  );
}
