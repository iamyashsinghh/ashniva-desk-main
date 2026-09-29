import {
  TASK_STATUS_LABELS,
  type ClientUpdateSummary,
  type ProjectSummary,
  type StatusCount,
  type WorkloadEntry,
} from '@ashniva/types';
import { View } from 'react-native';

import { Avatar } from '../../../shared/components/Avatar';
import { ProgressBar } from '../../../shared/components/data-display';
import { IconTile } from '../../../shared/components/Icon';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Card, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate, formatMinutes } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import {
  projectHealthLabel,
  projectHealthTone,
  projectIconTone,
} from '../../projects/project-display';
import { CompactEmpty, DashboardSection } from './preview-lists';
import { useDashboardActions } from './dashboard-actions';

const VISIBLE = 5;

/** Open tasks per person, with what is overdue or blocked and the time logged today. */
export function WorkloadList({
  entries,
  title = 'Team workload',
}: {
  entries: WorkloadEntry[];
  title?: string;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...entries.map((entry) => entry.openTasks));
  return (
    <DashboardSection title={title} icon="people-outline" count={entries.length}>
      {entries.length === 0 ? (
        <CompactEmpty title="No team members yet" icon="people-outline" />
      ) : (
        <Card style={{ gap: theme.spacing.md }}>
          {entries.map((entry) => {
            const summary = describeWorkload(entry);
            return (
              <View
                key={entry.user.id}
                accessible
                accessibilityLabel={`${entry.user.name}: ${summary}`}
                style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}
              >
                <Avatar name={entry.user.name} size={32} />
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText size="sm" weight="medium" numberOfLines={1}>
                    {entry.user.name}
                  </AppText>
                  <ProgressBar
                    percent={(entry.openTasks / max) * 100}
                    tone={entry.overdue > 0 ? 'warning' : 'primary'}
                    height={5}
                  />
                  <AppText size="xs" tone="faint" numberOfLines={1}>
                    {summary}
                  </AppText>
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </DashboardSection>
  );
}

function describeWorkload(entry: WorkloadEntry): string {
  return [
    `${entry.openTasks} open`,
    entry.overdue > 0 ? `${entry.overdue} overdue` : '',
    entry.blocked > 0 ? `${entry.blocked} blocked` : '',
    entry.minutesToday > 0 ? formatMinutes(entry.minutesToday) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Active projects, worst health first as the API sent them; a tap opens Projects. */
export function ProjectsList({
  projects,
  title = 'Active projects',
}: {
  projects: ProjectSummary[];
  title?: string;
}) {
  const { onOpenProjects } = useDashboardActions();
  return (
    <DashboardSection
      title={title}
      icon="folder-open-outline"
      count={projects.length}
      seeAll={{ kind: 'projects' }}
    >
      {projects.length === 0 ? (
        <CompactEmpty title="No active projects" icon="folder-open-outline" />
      ) : null}
      {projects.slice(0, VISIBLE).map((project) => (
        <PressableCard
          key={project.id}
          accessibilityLabel={`${project.name}, ${projectHealthLabel(project.health)}, ${project.progressPercent}% done`}
          onPress={() => onOpenProjects?.()}
          chevron={Boolean(onOpenProjects)}
          icon="folder-open"
          iconTone={projectIconTone(project.health)}
        >
          <AppText size="xs" tone="faint" numberOfLines={1}>
            {project.clientOrganization?.name ?? 'Internal'} · {project.openTicketCount} tickets
          </AppText>
          <AppText weight="medium" numberOfLines={1}>
            {project.name}
          </AppText>
          <ProgressBar percent={project.progressPercent} height={5} />
          <PillRow>
            <Pill
              label={projectHealthLabel(project.health)}
              tone={projectHealthTone(project.health)}
            />
            {project.taskCounts.overdue > 0 ? (
              <Pill label={`${project.taskCounts.overdue} overdue`} tone="danger" />
            ) : null}
            {project.taskCounts.blocked > 0 ? (
              <Pill label={`${project.taskCounts.blocked} blocked`} tone="warning" />
            ) : null}
          </PillRow>
        </PressableCard>
      ))}
    </DashboardSection>
  );
}

/** How the team's open work splits across statuses. */
export function StatusBars({ counts, title }: { counts: StatusCount[]; title: string }) {
  const theme = useTheme();
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <DashboardSection title={title} icon="stats-chart-outline" count={total}>
      {counts.length === 0 || total === 0 ? (
        <CompactEmpty title="Nothing in progress" />
      ) : (
        <Card style={{ gap: theme.spacing.md }}>
          {counts.map((entry) => (
            <View key={entry.status} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText size="sm">{TASK_STATUS_LABELS[entry.status]}</AppText>
                <AppText size="sm" weight="bold" tabular>
                  {entry.count}
                </AppText>
              </View>
              <ProgressBar
                percent={(entry.count / total) * 100}
                height={5}
                label={`${TASK_STATUS_LABELS[entry.status]}: ${entry.count} of ${total} open tasks`}
              />
            </View>
          ))}
        </Card>
      )}
    </DashboardSection>
  );
}

/** Client-visible completions waiting for a senior to publish them — publishing is on the web. */
export function UpdatesList({ updates }: { updates: ClientUpdateSummary[] }) {
  const theme = useTheme();
  return (
    <DashboardSection title="Updates to publish" icon="megaphone-outline" count={updates.length}>
      {updates.length === 0 ? <CompactEmpty title="Nothing waiting to publish" /> : null}
      {updates.slice(0, VISIBLE).map((update) => (
        <Card
          key={update.id}
          style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.md }}
        >
          <IconTile name="newspaper-outline" tone="violet" size={36} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {update.clientOrganization.name} · {update.project.name} ·{' '}
              {formatDate(update.workDate)}
            </AppText>
            <AppText weight="medium" numberOfLines={2}>
              {update.title}
            </AppText>
            <AppText size="xs" tone="muted" numberOfLines={1}>
              by {update.author.name}
            </AppText>
          </View>
        </Card>
      ))}
    </DashboardSection>
  );
}
