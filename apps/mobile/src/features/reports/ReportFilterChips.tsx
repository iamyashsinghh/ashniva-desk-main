import type { ReportFilters } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { ChipScroller } from '../../shared/components/chips';
import { fromValue } from '../../shared/components/DateTimeField';
import { Icon } from '../../shared/components/Icon';
import { AppText, Button } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { optionLabel, type ReportFilterOptions } from './use-report-filter-options';

interface ActiveFilter {
  key: keyof ReportFilters;
  label: string;
}

function dayLabel(iso: string): string {
  return fromValue(iso)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) ?? iso;
}

/** The filters in force, in words, in the order the sheet lists them. */
export function activeFilters(
  filters: ReportFilters,
  options: ReportFilterOptions,
): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (filters.from) {
    active.push({ key: 'from', label: `From ${dayLabel(filters.from)}` });
  }
  if (filters.to) {
    active.push({ key: 'to', label: `To ${dayLabel(filters.to)}` });
  }
  if (filters.clientOrganizationId) {
    const name = optionLabel(options.clients, filters.clientOrganizationId);
    active.push({ key: 'clientOrganizationId', label: name ?? 'One client' });
  }
  if (filters.projectId) {
    active.push({
      key: 'projectId',
      label: optionLabel(options.projects, filters.projectId) ?? 'One project',
    });
  }
  if (filters.userId) {
    active.push({
      key: 'userId',
      label: optionLabel(options.people, filters.userId) ?? 'One person',
    });
  }
  return active;
}

/**
 * The "Filters" button and a removable chip per filter in force.
 *
 * Without the chips a short report would not say why it is short; with them, taking a filter off
 * is one tap rather than a trip back into the sheet.
 */
export function ReportFilterChips({
  active,
  onOpen,
  onRemove,
}: {
  active: ActiveFilter[];
  onOpen: () => void;
  onRemove: (key: keyof ReportFilters) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Button
        label={active.length > 0 ? `Filters · ${active.length}` : 'Filters'}
        icon="options-outline"
        variant="secondary"
        onPress={onOpen}
      />
      {active.length > 0 ? (
        <ChipScroller>
          {active.map((filter) => (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter: ${filter.label}`}
              onPress={() => onRemove(filter.key)}
              hitSlop={4}
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
              <AppText size="sm" weight="medium" tone="primary">
                {filter.label}
              </AppText>
              <Icon name="close" size={14} color={theme.colors.primary} />
            </Pressable>
          ))}
        </ChipScroller>
      ) : null}
    </View>
  );
}
