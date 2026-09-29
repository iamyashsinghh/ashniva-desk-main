import type { ClientUpdateSummary } from '@ashniva/types';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { Icon } from '../../shared/components/Icon';
import { AppText, Button, Card, Pill, PillRow } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { isPublished, updateMeta } from './completed-today';

/**
 * One client update, in the queue or on the published side.
 *
 * The body is shown whole: it is exactly what the client reads, and a senior deciding whether to
 * publish it has to read all of it.
 */
export function UpdateCard({
  update,
  onOpenTask,
  onOpenProject,
  children,
}: {
  update: ClientUpdateSummary;
  onOpenTask: (taskId: string) => void;
  onOpenProject?: (projectId: string) => void;
  /** The row's actions. */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const published = isPublished(update);
  const task = update.task;

  return (
    <Card style={published ? { backgroundColor: theme.colors.successSoft } : null}>
      <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.sm }}>
        {published ? <Icon name="checkmark-circle" size={18} color={theme.colors.success} /> : null}
        <AppText weight="medium" style={{ flex: 1 }}>
          {update.title}
        </AppText>
      </View>
      <PillRow>
        <Pill
          label={published ? 'Visible to client' : 'Waiting to publish'}
          tone={published ? 'success' : 'warning'}
        />
      </PillRow>
      <MetaLine icon="business-outline">{updateMeta(update)}</MetaLine>
      <AppText size="sm">{update.body}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {task ? (
          <Button
            label={`Open ${task.key}`}
            variant="ghost"
            size="sm"
            icon="checkbox-outline"
            onPress={() => onOpenTask(task.id)}
          />
        ) : null}
        {onOpenProject ? (
          <Button
            label={`Open ${update.project.name}`}
            variant="ghost"
            size="sm"
            icon="folder-outline"
            onPress={() => onOpenProject(update.project.id)}
          />
        ) : null}
      </View>
      {children ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {children}
        </View>
      ) : null}
    </Card>
  );
}
