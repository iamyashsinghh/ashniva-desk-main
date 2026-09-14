import { CONVERSATION_MEMBER_ROLE_LABELS, type ConversationDetail, type ConversationParticipant } from '@ashniva/types';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Who is in a group.
 *
 * Membership is the project's team, kept in sync on the server. There is no leave, remove, or
 * rename on this screen — those changes happen on the project.
 */
export function GroupScreen({
  conversationId,
}: {
  conversationId: string;
  onLeft: () => void;
}) {
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
  const gone = conversation.participants.filter((person) => person.leftAt !== null);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <AppText size="lg" weight="bold">
            {conversation.title}
          </AppText>
          <AppText size="xs" tone="faint">
            {present.length} members
          </AppText>
        </Card>

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            Members
          </AppText>
          {present.map((person) => (
            <MemberRow key={person.id} person={person} />
          ))}
          {gone.map((person) => (
            <AppText key={person.id} size="sm" tone="faint">
              {person.name} · left
            </AppText>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function MemberRow({ person }: { person: ConversationParticipant }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText weight="medium">{person.name}</AppText>
      <AppText size="xs" tone="faint">
        {CONVERSATION_MEMBER_ROLE_LABELS[person.memberRole]}
      </AppText>
    </View>
  );
}
