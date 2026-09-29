import {
  PHASE1_TASK_STATUSES,
  PRIORITY,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type Priority,
  type TaskStatus,
} from '@ashniva/types';
import { View } from 'react-native';

import { Chip } from '../../shared/components/chips';
import { FilterSheet } from '../../shared/components/FilterSheet';
import { ProjectPicker, UserPicker } from '../../shared/components/pickers';
import { AppText } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  NO_TASK_FILTERS,
  TASK_FLAG_LABELS,
  TASK_QUERY_FLAGS,
  type TaskFilters,
  type TaskQueryFlag,
} from './task-list-query';

/**
 * Statuses a task can actually be in. The reserved release-pipeline statuses are left out: no
 * transition reaches them, so offering them only offers an empty list.
 */
const STATUS_OPTIONS: SelectOption<TaskStatus>[] = PHASE1_TASK_STATUSES.map((status) => ({
  value: status,
  label: TASK_STATUS_LABELS[status],
}));

const PRIORITY_OPTIONS: SelectOption<Priority>[] = Object.values(PRIORITY).map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
  icon: 'flag-outline',
}));

/** The task list's filters, in a sheet. Changes apply as they are made; the list refetches. */
export function TaskFilterSheet({
  visible,
  filters,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const toggleFlag = (flag: TaskQueryFlag) =>
    onChange({
      ...filters,
      flags: filters.flags.includes(flag)
        ? filters.flags.filter((entry) => entry !== flag)
        : [...filters.flags, flag],
    });

  return (
    <FilterSheet visible={visible} onClose={onClose} onReset={() => onChange(NO_TASK_FILTERS)}>
      <SelectField
        label="Status"
        icon="ellipse-outline"
        multiple
        options={STATUS_OPTIONS}
        value={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
        placeholder="Any status"
      />
      <SelectField
        label="Priority"
        icon="flag-outline"
        options={PRIORITY_OPTIONS}
        value={filters.priority ? [filters.priority] : []}
        onChange={(values) => onChange({ ...filters, priority: values[0] ?? null })}
        allowClear
        clearLabel="Any priority"
        placeholder="Any priority"
      />
      <ProjectPicker
        value={filters.projectId}
        onChange={(projectId) => onChange({ ...filters, projectId })}
        allowClear
        placeholder="All projects"
      />
      <UserPicker
        label="Assignee"
        value={filters.assignedToId ? [filters.assignedToId] : []}
        onChange={(ids) => onChange({ ...filters, assignedToId: ids[0] ?? null })}
        placeholder="Anyone"
      />
      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="sm" weight="medium">
          Only show
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {TASK_QUERY_FLAGS.map((flag) => (
            <Chip
              key={flag}
              label={TASK_FLAG_LABELS[flag]}
              selected={filters.flags.includes(flag)}
              onPress={() => toggleFlag(flag)}
            />
          ))}
        </View>
      </View>
    </FilterSheet>
  );
}
