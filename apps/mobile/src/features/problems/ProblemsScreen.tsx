import { PERMISSIONS, type ProblemSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { usePagedResource } from '../../shared/api/queries';
import { Chip, ChipScroller } from '../../shared/components/chips';
import { SearchFilterBar, useDebounced } from '../../shared/components/FilterSheet';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { PagedList } from './components/PagedList';
import { problemKeys } from './problem-api';
import { PROBLEM_INTERNAL_NOTE, PROBLEM_VIEWS, type ProblemView } from './problem-display';
import { ProblemCard } from './ProblemCard';
import { ProblemFormSheet } from './ProblemFormSheet';

const VIEW_KEYS = Object.keys(PROBLEM_VIEWS) as ProblemView[];

/**
 * Problems, grouped by what somebody has to do next rather than by date.
 *
 * "Open" is the view that matters day to day, as on the web: a problem nobody has asked for an
 * analysis about is a fault several clients keep hitting that nobody has started on. Searching is
 * the API's (title, module or number), so a long list is not downloaded to be filtered here.
 */
export function ProblemsScreen({ onOpen }: { onOpen: (problemId: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const [view, setView] = useState<ProblemView>('open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const term = useDebounced(search.trim());
  const statuses = PROBLEM_VIEWS[view].statuses;

  const query = {
    ...(statuses ? { status: statuses.join(',') } : {}),
    ...(term ? { search: term } : {}),
    limit: 25,
  };
  const result = usePagedResource<ProblemSummary>(problemKeys.list(query), '/problems', query);

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search problems" />
      <ChipScroller>
        {VIEW_KEYS.map((key) => (
          <Chip
            key={key}
            label={PROBLEM_VIEWS[key].label}
            selected={view === key}
            onPress={() => setView(key)}
          />
        ))}
      </ChipScroller>
      {can(PERMISSIONS.PROBLEM_MANAGE) ? (
        <Button
          label="New problem"
          icon="add"
          variant="secondary"
          onPress={() => setCreating(true)}
        />
      ) : null}
      <AppText size="xs" tone="faint">
        {PROBLEM_INTERNAL_NOTE}
      </AppText>
    </View>
  );

  return (
    <>
      <PagedList
        result={result}
        header={header}
        renderRow={(problem) => (
          <ProblemCard problem={problem} onPress={() => onOpen(problem.id)} />
        )}
        emptyTitle={term ? 'No matching problems' : 'No problems'}
        emptyDescription={
          term
            ? `Nothing in this view matches “${term}”.`
            : 'A problem groups the same fault reported by several clients, and holds the analysis and the fix.'
        }
        emptyIcon="bug-outline"
        loadingLabel="Loading problems"
      />
      {creating ? (
        <ProblemFormSheet
          onClose={() => setCreating(false)}
          onSaved={(problem) => {
            setCreating(false);
            onOpen(problem.id);
          }}
        />
      ) : null}
    </>
  );
}
