import type { TaskDetail, WorkLogSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { AppText, Button, Card, Divider, Field, Input } from '../../shared/components/primitives';
import { formatDate, formatMinutes, todayIsoDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Time logged on a task, and adding to it.
 *
 * This is the entry that does not change the status — logging an hour is not submitting the work,
 * and conflating them is how a task ends up in review because somebody wanted to record a
 * morning. `POST /tasks/:id/work-logs` is the endpoint for exactly that.
 *
 * The date is today's, in the device's own day rather than the server's. Somebody logging time at
 * 11pm in Bengaluru means today, and a UTC date would file it as tomorrow.
 */
export function TaskWorkLog({
  taskId,
  workLogs,
  canLog,
  onLogged,
}: {
  taskId: string;
  workLogs: readonly WorkLogSummary[];
  /** The API's answer for the `log-work` action. The API refuses regardless; this hides a form. */
  canLog: boolean;
  onLogged: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [summary, setSummary] = useState('');

  const log = useApiMutation<{ minutes: number; summary: string }, TaskDetail>({
    path: `/tasks/${taskId}/work-logs`,
    body: ({ minutes: value, summary: text }) => ({
      workDate: todayIsoDate(),
      minutes: value,
      summary: text,
    }),
    invalidate: [['tasks', taskId], ['tasks']],
    onSuccess: () => {
      setMinutes('');
      setSummary('');
      setOpen(false);
      onLogged();
    },
  });

  const parsed = Number(minutes);
  const validMinutes = Number.isInteger(parsed) && parsed > 0 && parsed <= 1440;
  const valid = validMinutes && summary.trim().length >= 3;

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Time logged ({workLogs.length} {workLogs.length === 1 ? 'entry' : 'entries'})
      </AppText>

      {workLogs.length === 0 ? <AppText tone="muted">Nothing logged yet.</AppText> : null}

      {workLogs.map((entry) => (
        <View key={entry.id} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <AppText size="xs" tone="faint">
            {formatDate(entry.workDate) ?? entry.workDate} · {entry.user.name} ·{' '}
            {formatMinutes(entry.minutes)}
          </AppText>
          <AppText size="sm">{entry.summary}</AppText>
        </View>
      ))}

      {canLog && !open ? (
        <Button
          label="Log time"
          variant="secondary"
          accessibilityHint="Records time without changing the task's status"
          onPress={() => setOpen(true)}
        />
      ) : null}

      {canLog && open ? (
        <>
          <Divider />
          <Field label="Minutes" hint="Between 1 and 1440, for today">
            <Input
              accessibilityLabel="Minutes worked"
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={setMinutes}
              placeholder="45"
              value={minutes}
            />
          </Field>
          <Field label="What you did" hint="One line is enough">
            <Input
              accessibilityLabel="What you did"
              multiline
              numberOfLines={2}
              onChangeText={setSummary}
              style={{ minHeight: 64, textAlignVertical: 'top' }}
              value={summary}
            />
          </Field>
          {log.error ? (
            <AppText tone="danger" size="sm">
              {log.error}
            </AppText>
          ) : null}
          <Button
            label="Save the entry"
            loading={log.busy}
            disabled={!valid}
            onPress={() => void log.run({ minutes: parsed, summary: summary.trim() })}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
        </>
      ) : null}
    </Card>
  );
}
