import { PERMISSIONS, TASK_LIST_VIEW, type TaskListView } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { Button } from '../../shared/components/primitives';
import { TabBar } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ActiveTaskFilters, useTaskFilterChips } from './ActiveTaskFilters';
import { TaskFilterSheet } from './TaskFilterSheet';
import { TaskResults } from './TaskResults';
import {
  NO_TASK_FILTERS,
  TASK_VIEW_ICONS,
  TASK_VIEW_LABELS,
  countTaskFilters,
  taskListQuery,
  visibleTaskViews,
  type TaskFilters,
} from './task-list-query';
import { taskEmptyCopy, withoutTaskChip } from './task-list-chips';

/** Views about other people's work, where each row says whose it is. */
const OTHERS_VIEWS: readonly TaskListView[] = [
  TASK_LIST_VIEW.BY_ME,
  TASK_LIST_VIEW.TEAM,
  TASK_LIST_VIEW.ALL,
  TASK_LIST_VIEW.REVIEW,
  TASK_LIST_VIEW.OVERDUE,
  TASK_LIST_VIEW.TODAY,
];

/**
 * Tasks, in every view the web app offers this person.
 *
 * Each view, filter and search is asked of the API by name rather than applied on the device. The
 * API already knows who is calling and what they may read, and a client-side filter would mean
 * downloading other people's work in order to hide it.
 */
export function TasksScreen({
  onOpen,
  onCreate,
}: {
  onOpen: (taskId: string) => void;
  /** Opens the create form. The button shows only to somebody holding `task:create`. */
  onCreate?: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const views = visibleTaskViews(can(PERMISSIONS.TASK_ASSIGN));
  const [view, setView] = useState<TaskListView>(TASK_LIST_VIEW.MY);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<TaskFilters>(NO_TASK_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const settledSearch = useDebounced(search);
  const chips = useTaskFilterChips(filters, '');
  const canCreate = Boolean(onCreate) && can(PERMISSIONS.TASK_CREATE);

  const query = taskListQuery(view, filters, settledSearch);
  const narrowed = countTaskFilters(filters) > 0 || settledSearch.trim().length > 0;

  const changeView = (next: TaskListView) => {
    setView(next);
    // As on the web: a status picked for one view rarely means anything in the next.
    setFilters((current) => ({ ...current, statuses: [] }));
  };

  const header = (
    <View>
      <TabBar
        accessibilityLabel="Which tasks to show"
        options={views.map((entry) => ({
          value: entry,
          label: TASK_VIEW_LABELS[entry],
          icon: TASK_VIEW_ICONS[entry],
        }))}
        value={view}
        onChange={changeView}
      />
      <View
        style={{
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.screen,
          paddingTop: theme.spacing.md,
        }}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <SearchFilterBar
              search={search}
              onSearch={setSearch}
              placeholder="Search tasks"
              activeFilters={countTaskFilters(filters)}
              onOpenFilters={() => setFiltersOpen(true)}
            />
          </View>
          {canCreate && onCreate ? (
            <Button
              label="New"
              icon="add"
              onPress={onCreate}
              accessibilityHint="Opens the form for a new task"
            />
          ) : null}
        </View>
        <ActiveTaskFilters
          chips={chips}
          onRemove={(key) => setFilters((current) => withoutTaskChip(current, key))}
        />
      </View>
      {/* Mounted only while open, so its pickers fetch their lists when somebody wants them. */}
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
      query={query}
      header={header}
      empty={taskEmptyCopy(view, narrowed)}
      onOpen={onOpen}
      showAssignee={OTHERS_VIEWS.includes(view)}
    />
  );
}
