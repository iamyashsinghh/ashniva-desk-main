import { PRIORITY_LABELS, type TaskDetail } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/** Priority and assignee, the two facts a task's title does not already say. */
export function TaskFacts({ task }: { task: TaskDetail }) {
  const theme = useTheme();
  const priorityColor = theme.priority[task.priority];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
        <Icon name="flag" size={13} color={priorityColor} />
        <AppText size="xs" weight="medium" style={{ color: priorityColor }}>
          {`${PRIORITY_LABELS[task.priority]} priority`}
        </AppText>
      </View>
      {task.assignedTo ? <MetaLine icon="person-outline">{task.assignedTo.name}</MetaLine> : null}
    </View>
  );
}
