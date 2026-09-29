import { PROJECT_STATUS, type ProjectDetail } from '@ashniva/types';
import { View } from 'react-native';

import { ProgressBar } from '../../../shared/components/data-display';
import { Hero } from '../../../shared/components/layout';
import { AppText, Button, Pill, PillRow } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import {
  projectHealthLabel,
  projectHealthTone,
  projectIconTone,
  projectStatusLabel,
  projectStatusTone,
  projectTypeLabel,
} from '../project-display';

/**
 * The top of a project: what it is, where it stands, and the actions the web puts in its header.
 *
 * Each action arrives as a callback that is absent when this person may not take it, so a button
 * that would only be refused is never drawn; the API refuses it regardless.
 */
export function ProjectHeaderCard({
  project,
  onSummary,
  onCreateTask,
  onEdit,
}: {
  project: ProjectDetail;
  onSummary: (() => void) | null;
  onCreateTask: (() => void) | null;
  onEdit: (() => void) | null;
}) {
  const theme = useTheme();
  const active = project.status === PROJECT_STATUS.ACTIVE;
  const hasActions = Boolean(onSummary || onCreateTask || onEdit);

  return (
    <Hero
      overline={`${project.code} · ${project.clientOrganization?.name ?? 'Internal'}`}
      title={project.name}
      icon="folder-open"
      iconTone={active ? projectIconTone(project.health) : 'neutral'}
    >
      <AppText size="sm" tone="muted">
        {projectTypeLabel(project.type)}
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
          label="Tasks completed"
        />
        <AppText size="xs" tone="muted">
          {project.progressPercent}% done · {project.taskCounts.completed} of{' '}
          {project.taskCounts.total} tasks
        </AppText>
      </View>
      {hasActions ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {onSummary ? (
            <Button
              label="Summary"
              icon="document-text-outline"
              variant="secondary"
              size="sm"
              accessibilityHint="Opens the project's work plan"
              onPress={onSummary}
            />
          ) : null}
          {onCreateTask ? (
            <Button
              label="New task"
              icon="add"
              variant="secondary"
              size="sm"
              accessibilityHint="Creates a task in this project"
              onPress={onCreateTask}
            />
          ) : null}
          {onEdit ? <Button label="Edit" icon="create-outline" size="sm" onPress={onEdit} /> : null}
        </View>
      ) : null}
    </Hero>
  );
}
