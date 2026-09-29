import {
  CONTRACT_STATUS,
  HOUR_LEDGER_KIND_LABELS,
  PERMISSIONS,
  type ContractDetail,
  type HourLedgerEntry,
} from '@ashniva/types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource } from '../../shared/api/queries';
import { Chip, ChipScroller } from '../../shared/components/chips';
import { EmptyState } from '../../shared/components/states';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Divider, Pill } from '../../shared/components/primitives';
import { formatDate, formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { AdjustHoursSheet } from './AdjustHoursSheet';
import { ErrorNote } from './commercial-ui';
import { formatBalance, ledgerTone, signedMinutes } from './contract-display';
import { HoursSummary } from './HoursSummary';

/**
 * Support hours: this period's balance, recording a movement, and the full ledger.
 *
 * The ledger is its own paged read rather than the detail's `recentLedger`, which is only the last
 * few entries; the periods offered as a filter are the ones those recent entries mention, as on
 * the web.
 */
export function ContractHoursTab({
  contract,
  onOpenTask,
}: {
  contract: ContractDetail;
  onOpenTask: (taskId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const [adjusting, setAdjusting] = useState(false);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const periods = [...new Set(contract.recentLedger.map((entry) => entry.periodStart))];
  const canAdjust =
    can(PERMISSIONS.CONTRACT_ADJUST_HOURS) && contract.status !== CONTRACT_STATUS.ARCHIVED;

  const query = { limit: 50, ...(periodStart ? { periodStart } : {}) };
  const ledger = usePagedResource<HourLedgerEntry>(
    ['contracts', 'ledger', contract.id, periodStart],
    `/contracts/${contract.id}/ledger`,
    query,
  );

  return (
    <View style={{ gap: theme.spacing.md }}>
      {contract.hours ? (
        <HoursSummary hours={contract.hours} />
      ) : (
        <EmptyState
          title="Hours are tracked once the contract is active"
          icon="hourglass-outline"
        />
      )}
      {canAdjust ? (
        <Button
          label="Adjust hours"
          icon="swap-vertical-outline"
          onPress={() => setAdjusting(true)}
        />
      ) : null}

      <Section title="Hour ledger" icon="receipt-outline">
        {periods.length > 1 ? (
          <ChipScroller>
            <Chip
              label="All periods"
              selected={periodStart === null}
              onPress={() => setPeriodStart(null)}
            />
            {periods.map((start) => (
              <Chip
                key={start}
                label={`From ${formatDate(start)}`}
                selected={periodStart === start}
                onPress={() => setPeriodStart(start)}
              />
            ))}
          </ChipScroller>
        ) : null}
        {ledger.isLoading ? (
          <AppText size="sm" tone="muted">
            Loading the ledger…
          </AppText>
        ) : null}
        {ledger.error ? <ErrorNote message={errorMessage(ledger.error)} /> : null}
        {!ledger.isLoading && !ledger.error && ledger.items.length === 0 ? (
          <AppText size="sm" tone="muted">
            No movements yet.
          </AppText>
        ) : null}
        {ledger.items.map((entry, index) => (
          <View key={entry.id} style={{ gap: theme.spacing.sm }}>
            {index > 0 ? <Divider /> : null}
            <LedgerEntryRow entry={entry} onOpenTask={onOpenTask} />
          </View>
        ))}
        {ledger.hasMore ? (
          <Button
            label="Show older movements"
            variant="ghost"
            size="sm"
            loading={ledger.isLoadingMore}
            onPress={ledger.loadMore}
          />
        ) : null}
      </Section>

      {adjusting ? (
        <AdjustHoursSheet contractId={contract.id} onClose={() => setAdjusting(false)} />
      ) : null}
    </View>
  );
}

function LedgerEntryRow({
  entry,
  onOpenTask,
}: {
  entry: HourLedgerEntry;
  onOpenTask: (taskId: string) => void;
}) {
  const theme = useTheme();
  const task = entry.task;
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <Pill label={HOUR_LEDGER_KIND_LABELS[entry.kind]} tone={ledgerTone(entry.kind)} />
        <View style={{ flex: 1 }} />
        <AppText weight="bold" tabular>
          {signedMinutes(entry.minutes)}
        </AppText>
      </View>
      {task ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open task ${task.key}`}
          onPress={() => onOpenTask(task.id)}
          hitSlop={6}
        >
          <AppText size="sm" tone="primary">
            {task.key} {task.title}
          </AppText>
        </Pressable>
      ) : null}
      {entry.ticket ? (
        <AppText size="sm" tone="muted">
          T-{entry.ticket.number} {entry.ticket.title}
        </AppText>
      ) : null}
      {entry.reason ? <AppText size="sm">{entry.reason}</AppText> : null}
      <AppText size="xs" tone="faint">
        {formatDateTime(entry.createdAt)}
        {entry.createdBy ? ` · ${entry.createdBy.name}` : ''} · balance after{' '}
        {formatBalance(entry.balanceAfterMinutes)}
      </AppText>
    </View>
  );
}
