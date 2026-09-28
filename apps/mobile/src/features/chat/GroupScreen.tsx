import {
  CONVERSATION_MEMBER_ROLE_LABELS,
  type ConversationDetail,
  type ConversationParticipant,
} from '@ashniva/types';
import { ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Section } from '../../shared/components/layout';
import { AppText, Card, Divider, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { Avatar } from './Avatar';

const MEMBER_AVATAR = 36;

/**
 * Who is in a group.
 *
 * Membership is the project's team, kept in sync on the server. There is no leave, remove, or
 * rename on this screen — those changes happen on the project.
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
  const gone = conversation.participants.filter((person) => person.leftAt !== null);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.lg }}>
          <Avatar
            name={conversation.title}
            size={56}
            shape="group"
            cutColor={theme.colors.surface}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" numberOfLines={2}>
              {conversation.title}
            </AppText>
            <AppText size="sm" tone="muted">
              {present.length} members
            </AppText>
          </View>
        </Card>

        <Section title="Members" count={present.length}>
          <View>
            {present.map((person, index) => (
              <View key={person.id}>
                {index > 0 ? <Divider inset={MEMBER_AVATAR + theme.spacing.md} /> : null}
                <MemberRow person={person} />
              </View>
            ))}
          </View>
          {gone.length > 0 ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Divider />
              {gone.map((person) => (
                <AppText key={person.id} size="sm" tone="faint">
                  {person.name} · left
                </AppText>
              ))}
            </View>
          ) : null}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function MemberRow({ person }: { person: ConversationParticipant }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Avatar name={person.name} size={MEMBER_AVATAR} />
      <View style={{ flex: 1, gap: 1 }}>
        <AppText weight="medium" numberOfLines={1}>
          {person.name}
        </AppText>
        <AppText size="xs" tone="faint">
          {CONVERSATION_MEMBER_ROLE_LABELS[person.memberRole]}
        </AppText>
      </View>
    </View>
  );
}
