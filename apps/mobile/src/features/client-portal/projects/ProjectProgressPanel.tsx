import type { PortalProjectProgress } from '@ashniva/types';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { useResource } from '../../../shared/api/queries';
import { MetaLine, ProgressBar, StatTile, TileGrid } from '../../../shared/components/data-display';
import type { IconName } from '../../../shared/components/Icon';
import { Section } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { portalKeys } from '../portal-keys';
import { BlockersSection, ReleasesSection, SignOffsSection } from './progress-sections';
import { PortalTaskList, UpdateList } from './project-parts';

/**
 * "What did the team do on my project today?"
 *
 * Its own request, made only while this section is open — it is a dozen bounded queries on the
 * API side, and a client reading the files has no use for them. Everything on it is written for
 * somebody who does not work in software: no internal status names, no health, no internal reason
 * a piece of work is held.
 */
export function ProjectProgressPanel({
  projectId,
  onOpenSignOff,
  onOpenRelease,
}: {
  projectId: string;
  onOpenSignOff?: (requestId: string) => void;
  onOpenRelease?: (releaseId: string) => void;
}) {
  const query = useResource<PortalProjectProgress>(
    portalKeys.progress(projectId),
    `/portal/projects/${projectId}/progress`,
  );

  if (!query.data && query.error) {
    return (
      <ErrorState
        message={errorMessage(query.error)}
        offline={query.error instanceof Error && query.error.name === 'NetworkError'}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!query.data) {
    return <LoadingState label="Loading today’s progress" variant="spinner" />;
  }

  const progress = query.data;
  const waitingOnYou = progress.blockers.filter((blocker) => blocker.waitingOnYou).length;

  return (
    <>
      <TileGrid>
        <StatTile label="Overall" value={`${progress.progressPercent}%`} icon="trending-up" />
        <StatTile
          label="Finished today"
          value={progress.completedToday.length}
          icon="checkmark-done-outline"
          iconTone="success"
        />
        <StatTile
          label="Being built"
          value={progress.inProgress.length}
          icon="construct-outline"
          iconTone="info"
        />
        <StatTile
          label="Being tested"
          value={progress.underTesting.length}
          icon="flask-outline"
          iconTone="violet"
        />
        <StatTile
          label="Waiting for you"
          value={waitingOnYou}
          tone={waitingOnYou > 0 ? 'warning' : 'default'}
          icon="hourglass-outline"
        />
        <StatTile
          label="Released recently"
          value={progress.recentReleases.length}
          icon="rocket-outline"
          iconTone="teal"
        />
      </TileGrid>

      <WhereSection progress={progress} />
      <BlockersSection blockers={progress.blockers} />

      <WorkSection
        title="Finished today"
        icon="checkmark-done-outline"
        tasks={progress.completedToday}
        empty="No work was completed today."
        open
      />
      <WorkSection
        title="Being built"
        icon="construct-outline"
        tasks={progress.inProgress}
        empty="Nothing is being built right now."
      />
      <WorkSection
        title="Being tested"
        icon="flask-outline"
        tasks={progress.underTesting}
        empty="Nothing is in testing right now."
      />
      <WorkSection
        title="Ready to go live"
        icon="rocket-outline"
        tasks={progress.readyToRelease}
        empty="Nothing is queued for release."
      />
      <WorkSection
        title="Coming up next"
        icon="calendar-outline"
        tasks={progress.upcoming}
        empty="Nothing is queued yet."
      />

      <SignOffsSection
        requests={progress.uatRequests}
        {...(onOpenSignOff ? { onOpen: onOpenSignOff } : {})}
      />
      <ReleasesSection
        releases={progress.recentReleases}
        {...(onOpenRelease ? { onOpen: onOpenRelease } : {})}
      />
      <Section title="Latest updates from your team" icon="newspaper-outline">
        <UpdateList
          updates={progress.recentUpdates}
          emptyText="Completed work appears here once your team publishes it."
        />
      </Section>
    </>
  );
}

function WhereSection({ progress }: { progress: PortalProjectProgress }) {
  const theme = useTheme();
  const milestone = progress.currentMilestone;
  return (
    <Section title="Where the project is" icon="flag-outline">
      {milestone ? (
        <View style={{ gap: theme.spacing.xs + 2 }}>
          <AppText weight="medium">
            {milestone.name}
            {milestone.dueDate ? ` · due ${formatDate(milestone.dueDate)}` : ''}
          </AppText>
          <ProgressBar
            percent={milestone.progressPercent}
            label={`Progress on ${milestone.name}`}
          />
          {milestone.description ? (
            <AppText size="sm" tone="muted">
              {milestone.description}
            </AppText>
          ) : null}
        </View>
      ) : (
        <AppText size="sm" tone="muted">
          No milestone shared yet. Your team will share the plan here once it is agreed.
        </AppText>
      )}
      <MetaLine icon="list-outline">
        {progress.taskCounts.completed} of {progress.taskCounts.total} work items done · as of{' '}
        {formatDate(progress.asOfDate)}
      </MetaLine>
    </Section>
  );
}

/** One column of the web's board, folded so the day's news sits in the first screenful. */
function WorkSection({
  title,
  icon,
  tasks,
  empty,
  open = false,
}: {
  title: string;
  icon: IconName;
  tasks: PortalProjectProgress['inProgress'];
  empty: string;
  open?: boolean;
}) {
  return (
    <Section title={title} icon={icon} count={tasks.length} collapsible initiallyOpen={open}>
      <PortalTaskList tasks={tasks} emptyText={empty} />
    </Section>
  );
}
