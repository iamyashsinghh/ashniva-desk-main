import { useState } from 'react';
import { View } from 'react-native';

import { SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { IconTile } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ActiveTaskFilters, useTaskFilterChips } from './ActiveTaskFilters';
import { TaskFilterSheet } from './TaskFilterSheet';
import { TaskResults } from './TaskResults';
import {
  TASK_VIEW_ICONS,
  TASK_VIEW_LABELS,
  countTaskFilters,
  taskListQuery,
  taskStateFromQuery,
  type TaskFilters,
} from './task-list-query';
import { taskEmptyCopy, withoutTaskChip } from './task-list-chips';

/**
 * The tasks behind a dashboard tile.
 *
 * The tile's own query is the starting point — `{ view: 'team', status: 'IN_REVIEW' }`, say — so
 * the rows here are the rows the tile counted. Every filter it carried is shown as a chip and can
 * be removed or refined; the view stays, because it is what the tile was about.
 */
export function TaskListScreen({
  title,
  query,
  onOpen,
}: {
  title?: string;
  /** `GET /tasks` query parameters, exactly as the tile links with them. */
  query: Readonly<Record<string, string>>;
  onOpen: (taskId: string) => void;
}) {
  const theme = useTheme();
  const [initial] = useState(() => taskStateFromQuery(query));
  const [filters, setFilters] = useState<TaskFilters>(initial.filters);
  const [search, setSearch] = useState(initial.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const settledSearch = useDebounced(search);
  const chips = useTaskFilterChips(filters, '');
  const view = initial.view;

  const header = (
    <View style={{ gap: theme.spacing.sm, padding: theme.spacing.screen, paddingBottom: 0 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <IconTile name={TASK_VIEW_ICONS[view]} tone="primary" size={36} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={2}>
            {title ?? TASK_VIEW_LABELS[view]}
          </AppText>
          {title ? (
            <AppText size="xs" tone="faint">
              {TASK_VIEW_LABELS[view]}
            </AppText>
          ) : null}
        </View>
      </View>
      <SearchFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search these tasks"
        activeFilters={countTaskFilters(filters)}
        onOpenFilters={() => setFiltersOpen(true)}
      />
      <ActiveTaskFilters
        chips={chips}
        onRemove={(key) => setFilters((current) => withoutTaskChip(current, key))}
      />
      {filtersOpen ? (
        <TaskFilterSheet
          visible
          filters={filters}
          onChange={setFilters}
          onClose={() => setFiltersOpen(false)}
        />
      ) : null}
    </View>
  );

  return (
    <TaskResults
      query={taskListQuery(view, filters, settledSearch)}
      header={header}
      empty={taskEmptyCopy(view, countTaskFilters(filters) > 0 || settledSearch.trim() !== '')}
      onOpen={onOpen}
      showAssignee
    />
  );
}
