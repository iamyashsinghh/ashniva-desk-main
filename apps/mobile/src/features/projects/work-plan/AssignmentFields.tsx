import { PRIORITY_LABELS, PRIORITY_ORDER, type Priority, type UserRef } from '@ashniva/types';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Icon, type IconTone } from '../../../shared/components/Icon';
import { AppText } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * The developer and priority pickers on Summary.
 *
 * The people offered are the plan's own `developers` — the project's developers, the list the
 * API accepts an assignee from — not the whole organization directory. An empty pick means "same
 * as above", and the hint names who or what is inherited so an empty field is never a mystery.
 */

export function AssigneeField({
  label,
  developers,
  value,
  inherited,
  clearLabel,
  disabled,
  onChange,
}: {
  label: string;
  developers: readonly UserRef[];
  value: string | null;
  inherited?: UserRef | null | undefined;
  clearLabel: string;
  disabled?: boolean;
  onChange: (assignedToId: string | null) => void;
}) {
  const options = useMemo<SelectOption[]>(
    () =>
      developers.map((user) => ({
        value: user.id,
        label: user.name,
        icon: 'person-circle-outline',
        iconTone: 'info',
      })),
    [developers],
  );
  if (developers.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        Add developers to this project to assign work.
      </AppText>
    );
  }
  const hint =
    !value && inherited ? `Using ${inherited.name} from a broader assignment.` : undefined;
  return (
    <SelectField
      label={label}
      icon="person-outline"
      options={options}
      value={value ? [value] : []}
      onChange={(ids) => onChange(ids[0] ?? null)}
      allowClear
      clearLabel={clearLabel}
      placeholder={inherited ? `${clearLabel} · ${inherited.name}` : clearLabel}
      {...(hint ? { hint } : {})}
      {...(disabled ? { disabled } : {})}
    />
  );
}

export function developerById(
  developers: readonly UserRef[],
  id: string | null | undefined,
): UserRef | undefined {
  return id ? developers.find((user) => user.id === id) : undefined;
}

const PRIORITY_TONES: Record<Priority, IconTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

const PRIORITY_OPTIONS: SelectOption<Priority>[] = PRIORITY_ORDER.map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
  icon: 'flag',
  iconTone: PRIORITY_TONES[priority],
}));

export function PriorityField({
  value,
  inherited,
  allowEmpty = false,
  disabled,
  onChange,
}: {
  value: Priority | null;
  inherited?: Priority | null;
  /** Phase and topic may fall through to the level above; the whole plan always has one. */
  allowEmpty?: boolean;
  disabled?: boolean;
  onChange: (priority: Priority | null) => void;
}) {
  const hint =
    allowEmpty && !value && inherited
      ? `Using ${PRIORITY_LABELS[inherited]} from a broader assignment.`
      : undefined;
  return (
    <SelectField
      label="Priority"
      icon="flag-outline"
      options={PRIORITY_OPTIONS}
      value={value ? [value] : []}
      onChange={(values) => onChange(values[0] ?? null)}
      allowClear={allowEmpty}
      clearLabel="Same as above"
      placeholder={inherited ? `Same as above · ${PRIORITY_LABELS[inherited]}` : 'Same as above'}
      {...(hint ? { hint } : {})}
      {...(disabled ? { disabled } : {})}
    />
  );
}

/** The read-only line for people who cannot assign: who has it, and how urgent it is. */
export function AssignmentSummary({
  assignee,
  priority,
}: {
  assignee: UserRef | null;
  priority: Priority;
}) {
  const theme = useTheme();
  const flag = theme.priority[priority];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
      {assignee ? (
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
          <Icon name="person-outline" size={13} color={theme.colors.textFaint} />
          <AppText size="xs" tone="muted">
            {assignee.name}
          </AppText>
        </View>
      ) : null}
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
        <Icon name="flag" size={13} color={flag} />
        <AppText size="xs" weight="medium" style={{ color: flag }}>
          {PRIORITY_LABELS[priority]}
        </AppText>
      </View>
    </View>
  );
}
