import { View } from 'react-native';

import { IconTile } from '../../shared/components/Icon';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { TaskResults } from '../tasks/TaskResults';
import {
  INTERN_WORK_QUERY,
  internWorkCopy,
  isInternUser,
  mayAssignInternWork,
} from './intern-work';

/**
 * Learning assignments for interns: where directors, project managers and team leads hand out
 * work, and where an intern finds it, opens it, replies and attaches files.
 *
 * The rows are ordinary tasks, so they open the ordinary task screen — comments and attachments
 * live there, and that is where the intern answers.
 */
export function InternWorkScreen({
  onOpenTask,
  onCreate,
}: {
  onOpenTask: (taskId: string) => void;
  onCreate?: () => void;
}) {
  const theme = useTheme();
  const { user, can } = useSession();
  const intern = isInternUser(user);
  const mayAssign = mayAssignInternWork(user, can);
  const copy = internWorkCopy(intern);

  const header = (
    <View style={{ gap: theme.spacing.sm, padding: theme.spacing.screen, paddingBottom: 0 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <IconTile name="school-outline" tone="violet" size={36} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Intern work</AppText>
        </View>
      </View>
      <AppText size="sm" tone="muted">
        {copy.subtitle}
      </AppText>
      {mayAssign && onCreate ? (
        <Button label="Assign work" icon="add-circle-outline" onPress={onCreate} />
      ) : null}
      <AppText size="xs" tone="faint">
        Open a task to use comments and attachments. Attachments can include a short note describing
        what the file is for.
      </AppText>
    </View>
  );

  return (
    <TaskResults
      query={INTERN_WORK_QUERY}
      header={header}
      empty={{
        title: copy.emptyTitle,
        description: copy.emptyDescription,
        icon: 'school-outline',
      }}
      onOpen={onOpenTask}
      showAssignee={!intern}
    />
  );
}
