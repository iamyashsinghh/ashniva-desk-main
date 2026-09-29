import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { formatDateTime } from '../format/format';
import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Field } from './form-controls';
import { Icon } from './Icon';
import { AppText, Button } from './primitives';
import { Sheet } from './Sheet';

type Mode = 'date' | 'datetime';

/** `YYYY-MM-DD` in the device's own day — what the API takes for a due or target date. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Reads either shape back into a Date; a bare date is taken as local midnight, not UTC. */
export function fromValue(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = bare
    ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function display(value: string | null, mode: Mode): string | null {
  const date = fromValue(value);
  if (!date) {
    return null;
  }
  return mode === 'date'
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : formatDateTime(date.toISOString());
}

/**
 * A date (or date and time) field.
 *
 * `date` mode speaks `YYYY-MM-DD`; `datetime` speaks an ISO instant. Android opens the system
 * dialogs imperatively — date, then time — because its picker is a dialog, not a view. iOS shows
 * the inline calendar inside a sheet with an explicit "Done", so scrolling the wheel is not a
 * commitment.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'date',
  placeholder = 'Not set',
  hint,
  error,
  required = false,
  allowClear = true,
  minimumDate,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  mode?: Mode;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  allowClear?: boolean;
  minimumDate?: Date;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(new Date());
  const shown = display(value, mode);

  const commit = (date: Date) => onChange(mode === 'date' ? toIsoDate(date) : date.toISOString());

  const openPicker = () => {
    const start = fromValue(value) ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        ...(minimumDate ? { minimumDate } : {}),
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type !== 'set' || !picked) {
            return;
          }
          if (mode === 'date') {
            commit(picked);
            return;
          }
          DateTimePickerAndroid.open({
            value: picked,
            mode: 'time',
            onChange: (timeEvent: DateTimePickerEvent, time?: Date) => {
              if (timeEvent.type === 'set' && time) {
                commit(time);
              }
            },
          });
        },
      });
      return;
    }
    setDraft(start);
    setOpen(true);
  };

  return (
    <Field
      label={label}
      required={required}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${shown ?? 'not set'}`}
          onPress={openPicker}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: error ? theme.colors.danger : theme.colors.borderStrong,
            borderRadius: theme.radius.sm + 2,
            borderWidth: 1,
            flex: 1,
            flexDirection: 'row',
            gap: theme.spacing.sm,
            minHeight: TOUCH_TARGET + 4,
            opacity: pressed ? 0.8 : 1,
            paddingHorizontal: theme.spacing.md,
          })}
        >
          <Icon
            name={mode === 'date' ? 'calendar-outline' : 'time-outline'}
            size={20}
            color={theme.colors.textFaint}
          />
          <AppText tone={shown ? 'default' : 'faint'} style={{ flex: 1 }}>
            {shown ?? placeholder}
          </AppText>
        </Pressable>
        {allowClear && value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            onPress={() => onChange(null)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radius.sm + 2,
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
              width: TOUCH_TARGET + 4,
            })}
          >
            <Icon name="close" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {Platform.OS === 'ios' ? (
        <Sheet
          visible={open}
          title={label}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                label="Done"
                icon="checkmark"
                onPress={() => {
                  commit(draft);
                  setOpen(false);
                }}
                style={{ flex: 1 }}
              />
            </>
          }
        >
          <DateTimePicker
            value={draft}
            mode={mode}
            display="inline"
            accentColor={theme.colors.primary}
            themeVariant={theme.isDark ? 'dark' : 'light'}
            {...(minimumDate ? { minimumDate } : {})}
            onChange={(_event, picked) => {
              if (picked) {
                setDraft(picked);
              }
            }}
          />
        </Sheet>
      ) : null}
    </Field>
  );
}
