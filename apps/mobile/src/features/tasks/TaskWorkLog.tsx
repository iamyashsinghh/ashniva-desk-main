import type { WorkLogSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { SuccessNote } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Divider } from '../../shared/components/primitives';
import { formatDate, formatMinutes } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { LogTimeSheet } from './task-actions/LogTimeSheet';

/**
 * Time logged on a task, and adding to it.
 *
 * This is the entry that does not change the status — logging an hour is not submitting the work,
 * and conflating them is how a task ends up in review because somebody wanted to record a
 * morning. The form itself is the same sheet the "Log time" action opens.
 */
export function TaskWorkLog({
  taskId,
  workLogs,
  canLog,
  onLogged,
}: {
  taskId: string;
  workLogs: readonly WorkLogSummary[];
  /** The API's answer for the `log-work` action. The API refuses regardless; this hides a button. */
  canLog: boolean;
  onLogged: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  const heading = `Time logged (${workLogs.length} ${workLogs.length === 1 ? 'entry' : 'entries'})`;
  const total = workLogs.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <Section
      title={heading}
      icon="stopwatch-outline"
      action={
        canLog ? (
          <Button
            label="Log time"
            variant="ghost"
            size="sm"
            icon="add-circle-outline"
            accessibilityHint="Records time without changing the task's status"
            onPress={() => {
              setLogged(false);
              setOpen(true);
            }}
          />
        ) : undefined
      }
    >
      {workLogs.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing logged yet.
        </AppText>
      ) : (
        <MetaLine icon="stopwatch-outline">{formatMinutes(total)} in total</MetaLine>
      )}
      {logged ? <SuccessNote label="Time logged" /> : null}

      {workLogs.map((entry, index) => (
        <View key={entry.id} style={{ gap: 2 }}>
          {index > 0 ? <Divider /> : null}
          <View style={{ paddingTop: index > 0 ? theme.spacing.sm : 0 }}>
            <MetaLine icon="calendar-outline">
              {formatDate(entry.workDate) ?? entry.workDate} · {entry.user.name} ·{' '}
              {formatMinutes(entry.minutes)}
            </MetaLine>
          </View>
          <AppText size="sm">{entry.summary}</AppText>
        </View>
      ))}

      {open ? (
        <LogTimeSheet
          taskId={taskId}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setLogged(true);
            onLogged();
          }}
        />
      ) : null}
    </Section>
  );
}
