import {
  SUPPORT_CALLBACK_EVENT_LABELS,
  type SupportCallbackDeliverySummary,
  type SupportCallbackStatus,
} from '@ashniva/types';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import {
  AppText,
  Button,
  Divider,
  Pill,
  PillRow,
  type PillTone,
} from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useCallbackDeliveries, useRedeliver } from './api';

const TONE: Record<SupportCallbackStatus, PillTone> = {
  SENT: 'success',
  FAILED: 'danger',
  SENDING: 'progress',
  QUEUED: 'info',
  SKIPPED: 'neutral',
};

/**
 * What was sent, when, and how the endpoint answered.
 *
 * Redelivery re-sends the same delivery id — receivers deduplicate on it — so it is offered only
 * for a delivery that failed or was skipped, as on the web.
 */
export function CallbackDeliveries({ productId }: { productId: string }) {
  const theme = useTheme();
  const deliveries = useCallbackDeliveries(productId, true);
  const redeliver = useRedeliver(productId);
  const rows: SupportCallbackDeliverySummary[] = deliveries.data ?? [];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="label" tone="muted" uppercase>
        Recent deliveries
      </AppText>
      {redeliver.error ? (
        <Banner tone="danger" role="alert">
          {redeliver.error}
        </Banner>
      ) : null}
      {deliveries.isLoading || rows.length === 0 ? (
        <AppText size="sm" tone="muted">
          {deliveries.isLoading ? 'Loading…' : 'Nothing has been sent yet.'}
        </AppText>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={{ gap: theme.spacing.xs }}>
            <Divider />
            <AppText weight="medium">
              {SUPPORT_CALLBACK_EVENT_LABELS[row.event] ?? row.event}
            </AppText>
            <PillRow>
              <Pill label={row.status} tone={TONE[row.status]} />
              <Pill label={`${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`} />
            </PillRow>
            <AppText size="xs" tone="muted">
              Queued {formatDateTime(row.queuedAt) ?? '—'}
              {row.responseStatus !== null ? ` · answered ${row.responseStatus}` : ''}
            </AppText>
            {row.lastError ? (
              <AppText size="xs" tone="danger" numberOfLines={2}>
                {row.lastError}
              </AppText>
            ) : null}
            {row.status === 'FAILED' || row.status === 'SKIPPED' ? (
              <Button
                label="Redeliver"
                icon="refresh"
                size="sm"
                variant="secondary"
                disabled={redeliver.busy}
                onPress={() => void redeliver.run(row.id)}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}
