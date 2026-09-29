import type { ConversationDetail } from '@ashniva/types';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Icon } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText, Card, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ConversationAvatar } from './ConversationAvatar';
import { GroupMembers } from './GroupMembers';

/**
 * Who is in a group.
 *
 * Membership is the project's team, kept in sync on the server. There is no leave, remove, or
 * rename on this screen — nor on the web; those changes happen on the project.
 */
export function GroupScreen({ conversationId }: { conversationId: string; onLeft: () => void }) {
  const theme = useTheme();
  const detail = useResource<ConversationDetail>(
    ['conversations', conversationId],
    `/conversations/${conversationId}`,
  );
  const conversation = detail.data ?? null;

  if (!conversation && detail.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(detail.error)}
          offline={detail.error instanceof Error && detail.error.name === 'NetworkError'}
          onRetry={() => void detail.refetch()}
        />
      </Screen>
    );
  }
  if (!conversation) {
    return (
      <Screen>
        <LoadingState label="Loading the group" />
      </Screen>
    );
  }

  const present = conversation.participants.filter((person) => person.leftAt === null);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.lg }}>
          <ConversationAvatar
            conversation={conversation}
            size={56}
            cutColor={theme.colors.surface}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" numberOfLines={2}>
              {conversation.title}
            </AppText>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
              <Icon name="people-outline" size={14} color={theme.colors.textMuted} />
              <AppText size="sm" tone="muted">
                {present.length} members
              </AppText>
            </View>
            <AppText size="xs" tone="faint">
              Started {formatDateTime(conversation.createdAt) ?? ''}
            </AppText>
          </View>
        </Card>

        <Section title="Members" icon="people-outline" count={present.length}>
          <GroupMembers participants={conversation.participants} />
        </Section>
      </ScrollView>
    </Screen>
  );
}
