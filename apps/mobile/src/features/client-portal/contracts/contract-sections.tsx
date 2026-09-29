import {
  HOUR_LEDGER_KIND_LABELS,
  MILESTONE_STATUS_LABELS,
  type ContractHourBalance,
  type HourLedgerEntry,
  type MilestoneSummary,
} from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine, ProgressBar, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate, formatDateTime, formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { dateRange, ledgerTone, milestoneTone, signedMinutes } from '../portal-display';
import { HoursBar } from './HoursBar';

/** The balance for the current billing period, as the web's six figures. */
export function HoursSection({ hours, name }: { hours: ContractHourBalance; name: string }) {
  const over = hours.remainingMinutes < 0;
  return (
    <Section title="Support hours this period" icon="time-outline">
      <HoursBar hours={hours} name={name} />
      <TileGrid>
        <StatTile label="Included" value={formatMinutes(hours.includedMinutes)} />
        <StatTile label="Purchased" value={formatMinutes(hours.purchasedMinutes)} />
        <StatTile label="Carried forward" value={formatMinutes(hours.carriedForwardMinutes)} />
        <StatTile label="Used" value={formatMinutes(hours.consumedMinutes)} />
        <StatTile label="Reserved" value={formatMinutes(hours.reservedMinutes)} />
        <StatTile
          label="Remaining"
          value={formatMinutes(Math.max(0, hours.remainingMinutes))}
          tone={hours.isLow ? 'warning' : 'default'}
          caption={
            over
              ? `${formatMinutes(-hours.remainingMinutes)} over`
              : dateRange(hours.periodStart, hours.periodEnd)
          }
        />
      </TileGrid>
    </Section>
  );
}

/**
 * The latest movements on the balance.
 *
 * A task or ticket is named but not opened, as on the web portal: the ledger says what used the
 * hours, and the portal has no task screen behind the name.
 */
export function LedgerSection({ entries }: { entries: readonly HourLedgerEntry[] }) {
  const theme = useTheme();
  return (
    <Section title="Recent hour movements" icon="swap-vertical-outline" count={entries.length}>
      {entries.length === 0 ? (
        <AppText size="sm" tone="muted">
          No movements yet.
        </AppText>
      ) : (
        entries.map((entry, index) => {
          const detail = [
            entry.task ? `${entry.task.key} ${entry.task.title}` : null,
            entry.ticket ? `T-${entry.ticket.number} ${entry.ticket.title}` : null,
            entry.reason,
            entry.createdBy?.name ?? null,
          ].filter(Boolean);
          return (
            <View key={entry.id} style={{ gap: theme.spacing.xs }}>
              {index > 0 ? <Divider /> : null}
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <PillRow>
                    <Pill
                      label={HOUR_LEDGER_KIND_LABELS[entry.kind]}
                      tone={ledgerTone(entry.kind)}
                    />
                  </PillRow>
                </View>
                <AppText weight="bold" tabular>
                  {signedMinutes(entry.minutes)}
                </AppText>
              </View>
              {detail.length > 0 ? <AppText size="sm">{detail.join(' · ')}</AppText> : null}
              <MetaLine icon="time-outline">
                {formatDateTime(entry.createdAt)} · balance{' '}
                {formatMinutes(entry.balanceAfterMinutes)}
              </MetaLine>
            </View>
          );
        })
      )}
    </Section>
  );
}

export function ContractMilestones({ milestones }: { milestones: readonly MilestoneSummary[] }) {
  const theme = useTheme();
  return (
    <Section title="Milestones" icon="flag-outline" count={milestones.length}>
      {milestones.map((milestone, index) => (
        <View key={milestone.id} style={{ gap: theme.spacing.xs + 2 }}>
          {index > 0 ? <Divider /> : null}
          <AppText weight="medium">{milestone.name}</AppText>
          <PillRow>
            <Pill
              label={MILESTONE_STATUS_LABELS[milestone.status]}
              tone={milestoneTone(milestone.status)}
            />
            {milestone.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
          </PillRow>
          <ProgressBar
            percent={milestone.progressPercent}
            tone={milestone.progressPercent >= 100 ? 'success' : 'primary'}
            label={`Progress on ${milestone.name}`}
          />
          <MetaLine icon="calendar-outline" danger={milestone.isOverdue}>
            {milestone.progressPercent}% · due {formatDate(milestone.dueDate) ?? 'not set'}
            {milestone.deliverableCount > 0
              ? ` · ${milestone.deliverablesDone} of ${milestone.deliverableCount} deliverables`
              : ''}
          </MetaLine>
        </View>
      ))}
    </Section>
  );
}
