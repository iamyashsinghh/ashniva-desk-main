import type { EffectiveAvailability } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '../../shared/components/chips';
import { Banner } from '../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSaveSchedule } from './api';
import {
  DAY_ORDER,
  dayShort,
  isOvernight,
  scheduleDraft,
  scheduleInput,
  scheduleProblems,
  toggleDay,
  type ScheduleDraft,
} from './support-display';

/**
 * Somebody's normal working week.
 *
 * The times are clock times in a named zone rather than instants, which is why the field asks for
 * `Asia/Kolkata` and not an offset: an offset is wrong twice a year anywhere that keeps daylight
 * saving, and the rota would quietly shift with it.
 */
export function WorkScheduleSheet({
  member,
  onClose,
}: {
  member: EffectiveAvailability;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState<ScheduleDraft>(() => scheduleDraft(member));
  const save = useSaveSchedule(onClose);
  const problems = scheduleProblems(draft);
  const blocked = Object.keys(problems).length > 0;
  const edit = (patch: Partial<ScheduleDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Sheet
      visible
      title={`Working hours — ${member.user.name}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save hours"
            icon="checkmark"
            loading={save.busy}
            disabled={blocked}
            onPress={() => void save.run({ userId: member.userId, input: scheduleInput(draft) })}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="sm" weight="medium">
          Working days
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {DAY_ORDER.map((day) => (
            <Chip
              key={day}
              role="checkbox"
              label={dayShort(day)}
              selected={draft.days.includes(day)}
              onPress={() => edit({ days: toggleDay(draft.days, day) })}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Shift starts" required error={problems.start ?? null}>
            <Input
              accessibilityLabel="Shift starts"
              value={draft.startTime}
              onChangeText={(startTime) => edit({ startTime })}
              placeholder="09:30"
              keyboardType="numbers-and-punctuation"
              invalid={Boolean(problems.start)}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Shift ends"
            required
            error={problems.end ?? null}
            {...(isOvernight(draft)
              ? { hint: 'Earlier than the start: this shift runs past midnight.' }
              : {})}
          >
            <Input
              accessibilityLabel="Shift ends"
              value={draft.endTime}
              onChangeText={(endTime) => edit({ endTime })}
              placeholder="18:30"
              keyboardType="numbers-and-punctuation"
              invalid={Boolean(problems.end)}
            />
          </Field>
        </View>
      </View>
      <Field
        label="Timezone"
        hint="IANA name, e.g. Asia/Kolkata. The clock times above are local to it."
      >
        <Input
          accessibilityLabel="Timezone"
          value={draft.timezone}
          onChangeText={(timezone) => edit({ timezone })}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
      <Field
        label="Workload limit"
        hint="Open tickets this person may hold before routing skips them. Blank means no limit."
        error={problems.limit ?? null}
      >
        <Input
          accessibilityLabel="Workload limit"
          value={draft.limit}
          onChangeText={(limit) => edit({ limit })}
          keyboardType="number-pad"
          invalid={Boolean(problems.limit)}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
