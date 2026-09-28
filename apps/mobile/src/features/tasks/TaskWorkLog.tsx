import type { TaskDetail, WorkLogSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Grow, Section } from '../../shared/components/layout';
import { AppText, Button, Divider, Field, Input } from '../../shared/components/primitives';
import { formatDate, formatMinutes, todayIsoDate } from '../../shared/format/format';
import { animateLayout } from '../../shared/theme/motion';
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

  const heading = `Time logged (${workLogs.length} ${workLogs.length === 1 ? 'entry' : 'entries'})`;
  const total = workLogs.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <Section
      title={heading}
      action={
        canLog && !open ? (
          <Button
            label="Log time"
            variant="ghost"
            size="sm"
            icon="plus"
            accessibilityHint="Records time without changing the task's status"
            onPress={() => {
              animateLayout();
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
        <AppText size="xs" tone="faint">
          {formatMinutes(total)} in total
        </AppText>
      )}

      {workLogs.map((entry, index) => (
        <View key={entry.id} style={{ gap: 2 }}>
          {index > 0 ? <Divider /> : null}
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              justifyContent: 'space-between',
              paddingTop: index > 0 ? theme.spacing.sm : 0,
            }}
          >
            <AppText size="xs" tone="faint">
              {formatDate(entry.workDate) ?? entry.workDate} · {entry.user.name} ·{' '}
              {formatMinutes(entry.minutes)}
            </AppText>
          </View>
          <AppText size="sm">{entry.summary}</AppText>
        </View>
      ))}

      {canLog && open ? (
        <View
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.md,
            gap: theme.spacing.md,
            padding: theme.spacing.md,
          }}
        >
          <Field label="Minutes" required hint="Between 1 and 1440, for today">
            <Input
              accessibilityLabel="Minutes worked"
              autoFocus
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={setMinutes}
              placeholder="45"
              value={minutes}
              invalid={minutes.length > 0 && !validMinutes}
            />
          </Field>
          <Field label="What you did" required hint="One line is enough">
            <Input
              accessibilityLabel="What you did"
              multiline
              numberOfLines={2}
              onChangeText={setSummary}
              style={{ minHeight: 72 }}
              value={summary}
            />
          </Field>
          {log.error ? (
            <Banner tone="danger" role="alert">
              {log.error}
            </Banner>
          ) : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Grow>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  animateLayout();
                  setOpen(false);
                }}
              />
            </Grow>
            <Grow>
              <Button
                label="Save the entry"
                loading={log.busy}
                disabled={!valid}
                onPress={() => void log.run({ minutes: parsed, summary: summary.trim() })}
              />
            </Grow>
          </View>
        </View>
      ) : null}
    </Section>
  );
}
