import type { TaskDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Banner } from '../../../shared/components/feedback';
import { Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { formatMinutes, todayIsoDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { SheetButtons } from './SheetButtons';
import { workMinutes } from './log-time';

/**
 * Recording time without changing the status — `POST /tasks/:id/work-logs`, the same endpoint as
 * the web app's "Log time". Logging a morning is not submitting the work.
 *
 * The date defaults to today in the device's own day: somebody logging at 11pm in Bengaluru means
 * today, and a UTC date would file it as tomorrow.
 */
export function LogTimeSheet({
  taskId,
  onClose,
  onDone,
}: {
  taskId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [workDate, setWorkDate] = useState<string>(todayIsoDate());
  const [summary, setSummary] = useState('');
  const total = workMinutes(hours, minutes);
  const typed = hours.trim() !== '' || minutes.trim() !== '';

  const log = useApiMutation<{ workDate: string; minutes: number; summary: string }, TaskDetail>({
    path: `/tasks/${taskId}/work-logs`,
    body: (variables) => variables,
    invalidate: [['tasks']],
    onSuccess: onDone,
  });

  return (
    <Sheet
      visible
      title="Log time"
      subtitle="Adds to the task's time without changing its status"
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel={total ? `Log ${formatMinutes(total)}` : 'Log time'}
          confirmIcon="save-outline"
          onConfirm={() => {
            if (total) {
              void log.run({ workDate, minutes: total, summary: summary.trim() });
            }
          }}
          onCancel={onClose}
          busy={log.busy}
          disabled={!total || summary.trim().length < 3}
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Hours">
            <Input
              accessibilityLabel="Hours worked"
              icon="hourglass-outline"
              autoFocus
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={setHours}
              placeholder="1"
              value={hours}
              invalid={typed && !total}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Minutes">
            <Input
              accessibilityLabel="Minutes worked"
              icon="time-outline"
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={setMinutes}
              placeholder="30"
              value={minutes}
              invalid={typed && !total}
            />
          </Field>
        </View>
      </View>
      <DateTimeField
        label="Date"
        mode="date"
        value={workDate}
        onChange={(value) => setWorkDate(value ?? todayIsoDate())}
        allowClear={false}
        required
      />
      <Field label="What did you do?" required hint="One line is enough">
        <Input
          accessibilityLabel="What you did"
          multiline
          numberOfLines={2}
          maxLength={2000}
          onChangeText={setSummary}
          style={{ minHeight: 72 }}
          value={summary}
        />
      </Field>
      {typed && !total ? (
        <Banner tone="warning">Between 1 minute and 24 hours, minutes under 60.</Banner>
      ) : null}
      {log.error ? (
        <Banner tone="danger" role="alert">
          {log.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
