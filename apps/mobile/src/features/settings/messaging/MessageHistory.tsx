import {
  MESSAGE_TEMPLATE_LABELS,
  OUTBOUND_MESSAGE_STATUS_LABELS,
  type OutboundMessageStatus,
} from '@ashniva/types';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { Section } from '../../../shared/components/layout';
import {
  AppText,
  Divider,
  Pill,
  PillRow,
  type PillTone,
} from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useMessageHistory, type MessageChannel } from './api';

const TONES: Record<OutboundMessageStatus, PillTone> = {
  QUEUED: 'neutral',
  SENDING: 'progress',
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
};

/**
 * Recent outbound messages on one channel. Recipients arrive already masked from the API: this is
 * an operational record — did it go out, did it bounce — not a directory of everyone's address.
 */
export function MessageHistory({ channel }: { channel: MessageChannel }) {
  const history = useMessageHistory(channel, true);

  return (
    <Section
      title="Recent messages"
      icon="time-outline"
      count={history.data?.items.length ?? 0}
      collapsible
      initiallyOpen={false}
    >
      <HistoryBody history={history} />
    </Section>
  );
}

function HistoryBody({ history }: { history: ReturnType<typeof useMessageHistory> }) {
  const theme = useTheme();
  const rows = history.data?.items ?? [];

  if (history.isLoading) {
    return (
      <AppText size="sm" tone="muted">
        Loading…
      </AppText>
    );
  }
  if (history.error && !history.data) {
    return (
      <AppText size="sm" tone="danger">
        {errorMessage(history.error)}
      </AppText>
    );
  }
  if (rows.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        Nothing sent yet. Messages appear here once something has been sent.
      </AppText>
    );
  }
  return (
    <>
      {rows.map((row) => (
        <View key={row.id} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <AppText weight="medium">{MESSAGE_TEMPLATE_LABELS[row.template]}</AppText>
          <AppText size="sm" tone="muted">
            To {row.destination}
          </AppText>
          <PillRow>
            <Pill label={OUTBOUND_MESSAGE_STATUS_LABELS[row.status]} tone={TONES[row.status]} />
            <Pill label={`${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`} />
          </PillRow>
          <AppText size="xs" tone="faint">
            Queued {formatDateTime(row.queuedAt) ?? '—'}
          </AppText>
          {row.lastError ? (
            <AppText size="xs" tone="danger" numberOfLines={3}>
              {row.lastError}
            </AppText>
          ) : null}
        </View>
      ))}
    </>
  );
}
