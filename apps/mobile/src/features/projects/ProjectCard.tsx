import { PROJECT_STATUS, type ProjectSummary } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine, ProgressBar } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  projectHealthLabel,
  projectHealthTone,
  projectIconTone,
  projectStatusLabel,
  projectStatusTone,
} from './project-display';

/**
 * One project in the list: what it is, whether it is in trouble, how far along it is and who
 * answers for it.
 *
 * Health is only shown for an active project, as on the web list — "on track" means nothing for
 * a project that is finished or parked, and would read as a claim nobody made.
 */
export function ProjectCard({
  project,
  onPress,
}: {
  project: ProjectSummary;
  onPress: () => void;
}) {
  const theme = useTheme();
  const counts = project.taskCounts;
  const active = project.status === PROJECT_STATUS.ACTIVE;
  const target = formatDate(project.targetDate);
  const people = [
    project.manager ? `PM ${project.manager.name}` : null,
    project.lead ? `Lead ${project.lead.name}` : null,
  ].filter(Boolean);

  return (
    <PressableCard
      accessibilityLabel={`${project.code} ${project.name}`}
      accessibilityHint="Opens the project"
      onPress={onPress}
      icon="folder-open"
      iconTone={active ? projectIconTone(project.health) : 'neutral'}
    >
      <MetaLine icon={project.clientOrganization ? 'business-outline' : 'pricetag-outline'}>
        {project.code} · {project.clientOrganization?.name ?? 'Internal'}
      </MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {project.name}
      </AppText>
      <PillRow>
        <Pill label={projectStatusLabel(project.status)} tone={projectStatusTone(project.status)} />
        {active ? (
          <Pill
            label={projectHealthLabel(project.health)}
            tone={projectHealthTone(project.health)}
          />
        ) : null}
      </PillRow>
      <View style={{ gap: theme.spacing.xs }}>
        <ProgressBar
          percent={project.progressPercent}
          tone={project.progressPercent >= 100 ? 'success' : 'primary'}
        />
        <MetaLine icon="trending-up" danger={counts.overdue > 0}>
          {project.progressPercent}% done · {counts.open} open · {counts.overdue} overdue
          {project.openTicketCount > 0 ? ` · ${project.openTicketCount} tickets` : ''}
        </MetaLine>
        {people.length > 0 ? <MetaLine icon="people-outline">{people.join(' · ')}</MetaLine> : null}
        {target ? <MetaLine icon="flag-outline">Delivery {target}</MetaLine> : null}
      </View>
    </PressableCard>
  );
}
