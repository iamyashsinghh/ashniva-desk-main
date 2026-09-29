import { ScrollView } from 'react-native';

import { errorMessage, isOffline } from '../../shared/api/client';
import { Section } from '../../shared/components/layout';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { AppText, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ProblemActionBar } from './detail/ProblemActionBar';
import { ProblemHero } from './detail/ProblemHero';
import { ProblemIncidents } from './detail/ProblemIncidents';
import { QuestionsSection } from './detail/QuestionsSection';
import { RcaSection } from './detail/RcaSection';
import { RelatedTickets } from './detail/RelatedTickets';
import { ResolutionSection } from './detail/ResolutionSection';
import { useProblem } from './problem-api';

/**
 * One problem: who reported it, the analysis, what is being done, and whether it may be closed.
 *
 * Everything that decides whether it may be closed comes from the server's `closure` block; the
 * screen prints it and never works it out again. The next step sits in the bar at the foot.
 */
export function ProblemDetailScreen({
  problemId,
  onOpenTicket,
  onOpenTask,
  onOpenIncident,
}: {
  problemId: string;
  onOpenTicket?: (ticketId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenIncident?: (incidentId: string) => void;
}) {
  const theme = useTheme();
  const query = useProblem(problemId);
  const problem = query.data ?? null;
  const refresh = () => void query.refetch();

  if (!problem) {
    return (
      <Screen>
        {query.error ? (
          <ErrorState
            message={errorMessage(query.error)}
            offline={isOffline(query.error)}
            onRetry={refresh}
          />
        ) : (
          <LoadingState label="Loading the problem" />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={query.isRefetching} onRefresh={refresh} />}
      >
        <ProblemHero problem={problem} />
        {problem.description ? (
          <Section title="Description" icon="document-outline">
            <AppText>{problem.description}</AppText>
          </Section>
        ) : null}
        <RelatedTickets problem={problem} {...(onOpenTicket ? { onOpenTicket } : {})} />
        <RcaSection problem={problem} />
        <ResolutionSection problem={problem} {...(onOpenTask ? { onOpenTask } : {})} />
        <QuestionsSection problem={problem} />
        <ProblemIncidents problem={problem} {...(onOpenIncident ? { onOpenIncident } : {})} />
      </ScrollView>
      <ProblemActionBar problem={problem} />
    </Screen>
  );
}
