import type { EffectiveAvailability, OnCallEntrySummary } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DateTimeField, fromValue } from '../../shared/components/DateTimeField';
import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Divider } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { todayIsoDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useClearOnCall, useSetOnCall } from './api';
import { teamOptions } from './support-display';

/** A covered date is a calendar day, not an instant: read as local midnight so it never shifts. */
function calendarDay(onDate: string): string {
  const date = fromValue(onDate);
  return date
    ? date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : onDate;
}

/**
 * Exceptional cover, one date at a time.
 *
 * On-call is neither a rota nor an availability state: it is the reason somebody outside their
 * normal hours may still be the right person to route to. Setting a date again replaces whoever
 * had it rather than stacking a second entry nobody would notice.
 */
export function OnCallSection({
  projectId,
  onCall,
  team,
}: {
  projectId: string;
  onCall: readonly OnCallEntrySummary[];
  team: readonly EffectiveAvailability[];
}) {
  const theme = useTheme();
  const [onDate, setOnDate] = useState<string | null>(todayIsoDate());
  const [userId, setUserId] = useState<string | null>(null);
  const [backupUserId, setBackupUserId] = useState<string | null>(null);
  const setCover = useSetOnCall(projectId, () => {
    setUserId(null);
    setBackupUserId(null);
  });
  const clear = useClearOnCall(projectId);
  const people = useMemo(() => teamOptions(team), [team]);
  const backups = useMemo(() => teamOptions(team, userId), [team, userId]);
  const failure = setCover.error ?? clear.error;

  return (
    <Section title="On call" icon="call-outline" count={onCall.length}>
      <AppText size="sm" tone="muted">
        The next four weeks.
      </AppText>
      <DateTimeField label="Date" value={onDate} onChange={setOnDate} allowClear={false} required />
      <SelectField
        label="On call"
        required
        icon="person-outline"
        options={people}
        value={userId ? [userId] : []}
        onChange={(ids) => {
          setUserId(ids[0] ?? null);
          if (ids[0] && ids[0] === backupUserId) {
            setBackupUserId(null);
          }
        }}
        placeholder="Choose somebody"
      />
      <SelectField
        label="Backup"
        icon="people-outline"
        hint="Optional, and has to be somebody else."
        options={backups}
        value={backupUserId ? [backupUserId] : []}
        onChange={(ids) => setBackupUserId(ids[0] ?? null)}
        allowClear
        clearLabel="Nobody"
        placeholder="Nobody"
      />
      <Button
        label="Set cover"
        icon="checkmark"
        loading={setCover.busy}
        disabled={!userId || !onDate}
        onPress={() =>
          userId && onDate ? void setCover.run({ onDate, userId, backupUserId }) : undefined
        }
      />
      {failure ? (
        <Banner tone="danger" role="alert">
          {failure}
        </Banner>
      ) : null}
      {onCall.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nobody is on call in the next four weeks.
        </AppText>
      ) : null}
      {onCall.map((entry) => (
        <View key={entry.id} style={{ gap: theme.spacing.sm }}>
          <Divider />
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="medium">{calendarDay(entry.onDate)}</AppText>
              <AppText size="sm" tone="muted">
                {entry.user.name}
                {entry.backupUser ? ` · backup ${entry.backupUser.name}` : ''}
              </AppText>
            </View>
            <Button
              label="Clear"
              size="sm"
              variant="dangerGhost"
              accessibilityHint={`Removes on-call cover for ${entry.onDate}`}
              onPress={() => void clear.run(entry.onDate)}
            />
          </View>
        </View>
      ))}
    </Section>
  );
}
