import { ScrollView } from 'react-native';

import { errorMessage, isOffline } from '../../../shared/api/client';
import { Section } from '../../../shared/components/layout';
import { AppText, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useIncident } from '../problem-api';
import { ClientSummarySection } from './ClientSummarySection';
import { EmergencyFixSection } from './EmergencyFixSection';
import { IncidentActionBar } from './IncidentActionBar';
import { IncidentDetailsSection } from './IncidentDetailsSection';
import { IncidentHero } from './IncidentHero';
import { IncidentTimeline } from './IncidentTimeline';
import { LinkedWorkSection } from './LinkedWorkSection';

/**
 * One incident: what is broken, what has been tried, and who authorised what. Everything here
 * is internal except the client summary, which reaches clients only when somebody publishes it.
 */
export function IncidentDetailScreen({
  incidentId,
  onOpenProblem,
  onOpenTicket,
  onOpenTask,
}: {
  incidentId: string;
  onOpenProblem?: (problemId: string) => void;
  onOpenTicket?: (ticketId: string) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const theme = useTheme();
  const query = useIncident(incidentId);
  const incident = query.data ?? null;
  const refresh = () => void query.refetch();

  if (!incident) {
    return (
      <Screen>
        {query.error ? (
          <ErrorState
            message={errorMessage(query.error)}
            offline={isOffline(query.error)}
            onRetry={refresh}
          />
        ) : (
          <LoadingState label="Loading the incident" />
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
        <IncidentHero incident={incident} />
        <Section title="What is happening" icon="alert-circle-outline">
          <AppText>{incident.description}</AppText>
          {incident.resolution ? (
            <AppText>
              <AppText weight="bold">Resolution: </AppText>
              {incident.resolution}
            </AppText>
          ) : null}
        </Section>
        <EmergencyFixSection incident={incident} />
        <IncidentTimeline entries={incident.timeline} />
        <ClientSummarySection key={incident.clientSummary ?? ''} incident={incident} />
        <LinkedWorkSection
          incident={incident}
          {...(onOpenTicket ? { onOpenTicket } : {})}
          {...(onOpenTask ? { onOpenTask } : {})}
        />
        <IncidentDetailsSection incident={incident} {...(onOpenProblem ? { onOpenProblem } : {})} />
      </ScrollView>
      <IncidentActionBar incident={incident} />
    </Screen>
  );
}
