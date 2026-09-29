import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Field } from './form-controls';
import { Icon, type IconName } from './Icon';
import { AppText } from './primitives';
import { SelectSheet, type SelectOption } from './SelectSheet';

/**
 * A form field whose value is chosen from a list: looks like an input, opens a `SelectSheet`.
 *
 * The field shows the chosen label (or labels), never the raw id, and a placeholder when nothing
 * is chosen so an empty optional field reads as a question rather than a blank box.
 */
export function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  icon,
  hint,
  error,
  required = false,
  multiple = false,
  allowClear = false,
  clearLabel,
  loading = false,
  disabled = false,
  sheetTitle,
}: {
  label: string;
  options: readonly SelectOption<T>[];
  value: readonly T[];
  onChange: (values: T[]) => void;
  placeholder?: string;
  icon?: IconName;
  hint?: string;
  error?: string | null;
  required?: boolean;
  multiple?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  sheetTitle?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const labels = options.filter((option) => value.includes(option.value)).map((o) => o.label);
  const summary = labels.length ? labels.join(', ') : placeholder;

  return (
    <Field
      label={label}
      required={required}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${labels.length ? summary : 'not set'}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: disabled ? theme.colors.surfaceSunken : theme.colors.surfaceRaised,
          borderColor: error ? theme.colors.danger : theme.colors.borderStrong,
          borderRadius: theme.radius.sm + 2,
          borderWidth: 1,
          flexDirection: 'row',
          gap: theme.spacing.sm,
          minHeight: TOUCH_TARGET + 4,
          opacity: pressed ? 0.8 : 1,
          paddingHorizontal: theme.spacing.md,
        })}
      >
        {icon ? <Icon name={icon} size={20} color={theme.colors.textFaint} /> : null}
        <View style={{ flex: 1 }}>
          <AppText tone={labels.length ? 'default' : 'faint'} numberOfLines={1}>
            {summary}
          </AppText>
        </View>
        <Icon name="chevron-down" size={18} color={theme.colors.textFaint} />
      </Pressable>
      <SelectSheet
        visible={open}
        title={sheetTitle ?? label}
        options={options}
        selected={value}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        multiple={multiple}
        allowClear={allowClear}
        {...(clearLabel ? { clearLabel } : {})}
        loading={loading}
      />
    </Field>
  );
}
