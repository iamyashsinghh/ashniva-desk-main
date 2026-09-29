import type { OperationsDashboard, OperationsProjectRow } from '@ashniva/types';
import { View } from 'react-native';

import { ProgressBar, TileGrid } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import {
  projectHealthLabel,
  projectHealthTone,
  projectIconTone,
} from '../../projects/project-display';
import { useDashboardActions } from './dashboard-actions';
import { KpiTile } from './KpiTile';
import { OperationsSupport } from './OperationsSupport';
import { OperationsTeam } from './OperationsTeam';
import { OperationsToday } from './OperationsToday';
import { CompactEmpty, DashboardSection } from './preview-lists';

/**
 * The operations board for managers and team leads: today, projects, the team, support and the
 * release pipeline. A section the API left out is not drawn — the API decides what the caller may
 * see; this only arranges it. Costs stay on the web app.
 */
export function OperationsBoard({ data }: { data: OperationsDashboard }) {
  const theme = useTheme();
  const { release } = data;
  return (
    <View style={{ gap: theme.spacing.section }}>
      <OperationsToday today={data.today} scope={data.scope} />
      <OperationsProjects projects={data.projects} />
      <OperationsTeam
        {...(data.team ? { team: data.team } : {})}
        {...(data.availability ? { availability: data.availability } : {})}
      />
      <OperationsSupport support={data.support} scope={data.scope} />
      <DashboardSection title="Release pipeline" icon="rocket-outline">
        <TileGrid>
          <KpiTile label="QA waiting" value={release.qaWaiting} icon="flask" iconTone="teal" />
          <KpiTile
            label="QA failed"
            value={release.qaFailed}
            icon="close-circle"
            iconTone="danger"
            warn
          />
          <KpiTile label="UAT pending" value={release.uatPending} icon="ribbon" iconTone="orange" />
          <KpiTile
            label="Ready to release"
            value={release.readyToRelease}
            icon="rocket"
            iconTone="success"
          />
        </TileGrid>
      </DashboardSection>
    </View>
  );
}

function OperationsProjects({ projects }: { projects: OperationsProjectRow[] }) {
  const { onOpenProjects } = useDashboardActions();
  return (
    <DashboardSection
      title="Projects"
      icon="folder-open-outline"
      count={projects.length}
      seeAll={{ kind: 'projects' }}
    >
      {projects.length === 0 ? (
        <CompactEmpty title="No active projects in your scope" icon="folder-open-outline" />
      ) : null}
      {projects.slice(0, 5).map((row) => (
        <PressableCard
          key={row.project.id}
          accessibilityLabel={`${row.project.name}, ${projectHealthLabel(row.health)}, ${row.progressPercent}% done`}
          onPress={() => onOpenProjects?.()}
          chevron={Boolean(onOpenProjects)}
          icon="folder-open"
          iconTone={projectIconTone(row.health)}
        >
          <AppText size="xs" tone="faint" numberOfLines={1}>
            {row.clientOrganization?.name ?? 'Internal'}
            {row.lead ? ` · Lead: ${row.lead.name}` : ''}
          </AppText>
          <AppText weight="medium" numberOfLines={1}>
            {row.project.name}
          </AppText>
          <ProgressBar percent={row.progressPercent} height={5} />
          <PillRow>
            <Pill label={projectHealthLabel(row.health)} tone={projectHealthTone(row.health)} />
            {row.overdue > 0 ? <Pill label={`${row.overdue} overdue`} tone="danger" /> : null}
            {row.blocked > 0 ? <Pill label={`${row.blocked} blocked`} tone="warning" /> : null}
            {row.pendingQa > 0 ? <Pill label={`${row.pendingQa} in QA`} tone="info" /> : null}
            {row.escalatedTickets > 0 ? (
              <Pill label={`${row.escalatedTickets} escalated`} tone="danger" />
            ) : null}
          </PillRow>
        </PressableCard>
      ))}
    </DashboardSection>
  );
}
