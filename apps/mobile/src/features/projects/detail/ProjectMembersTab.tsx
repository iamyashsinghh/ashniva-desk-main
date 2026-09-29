import { PROJECT_MEMBER_ROLE_LABELS, type ProjectDetail } from '@ashniva/types';
import { View } from 'react-native';

import { Avatar } from '../../../shared/components/Avatar';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Divider } from '../../../shared/components/primitives';
import { EmptyState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/** Who is on the project, their role there and what they are responsible for. */
export function ProjectMembersTab({
  project,
  onEditMembers,
}: {
  project: ProjectDetail;
  /** Null when this person may not change the team. */
  onEditMembers: (() => void) | null;
}) {
  const theme = useTheme();
  return (
    <Section
      title="Members"
      count={project.members.length}
      icon="people-outline"
      {...(onEditMembers
        ? {
            action: (
              <Button
                label="Edit team"
                icon="create-outline"
                variant="ghost"
                size="sm"
                onPress={onEditMembers}
              />
            ),
          }
        : {})}
    >
      {project.members.length === 0 ? (
        <EmptyState title="No members yet" icon="people-outline" />
      ) : (
        project.members.map((member, index) => (
          <View key={member.id} style={{ gap: theme.spacing.sm }}>
            {index > 0 ? <Divider /> : null}
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
              <Avatar name={member.name} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size="sm" weight="medium">
                  {member.name}
                </AppText>
                <AppText size="xs" tone="muted">
                  {PROJECT_MEMBER_ROLE_LABELS[member.role] ?? member.role} · {member.email}
                </AppText>
                {member.responsibilities.length > 0 ? (
                  <AppText size="xs" tone="faint">
                    {member.responsibilities.join(' · ')}
                  </AppText>
                ) : null}
              </View>
            </View>
          </View>
        ))
      )}
    </Section>
  );
}
