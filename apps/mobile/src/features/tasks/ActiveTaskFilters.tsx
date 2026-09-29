import { Pressable } from 'react-native';

import { ChipScroller } from '../../shared/components/chips';
import { Icon } from '../../shared/components/Icon';
import { useDirectory, useProjectOptions } from '../../shared/components/pickers';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { taskFilterChips, type TaskChipKey, type TaskFilterChip } from './task-list-chips';
import type { TaskFilters } from './task-list-query';

/**
 * The chips for what is narrowing a list, with names for the ids in it.
 *
 * The project and people lists are only fetched when a chip needs a name from them, so a list
 * with no such filter costs no extra request.
 */
export function useTaskFilterChips(filters: TaskFilters, search: string): TaskFilterChip[] {
  const projects = useProjectOptions(Boolean(filters.projectId));
  const people = useDirectory(Boolean(filters.assignedToId));
  return taskFilterChips(filters, search, {
    project: projects.options.find((option) => option.value === filters.projectId)?.label,
    person: people.data?.find((person) => person.id === filters.assignedToId)?.name,
  });
}

/** Removable chips, one per filter in force. Draws nothing when the list is not narrowed. */
export function ActiveTaskFilters({
  chips,
  onRemove,
}: {
  chips: readonly TaskFilterChip[];
  onRemove: (key: TaskChipKey) => void;
}) {
  const theme = useTheme();
  if (chips.length === 0) {
    return null;
  }
  return (
    <ChipScroller>
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          accessibilityRole="button"
          accessibilityLabel={`Clear filter ${chip.label}`}
          onPress={() => onRemove(chip.key)}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: theme.colors.primarySoft,
            borderColor: theme.colors.primary,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            flexDirection: 'row',
            gap: 6,
            minHeight: TOUCH_TARGET - 8,
            opacity: pressed ? 0.8 : 1,
            paddingHorizontal: theme.spacing.md,
          })}
        >
          <AppText size="sm" weight="medium" tone="primary" numberOfLines={1}>
            {chip.label}
          </AppText>
          <Icon name="close" size={14} color={theme.colors.primary} />
        </Pressable>
      ))}
    </ChipScroller>
  );
}
