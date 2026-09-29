import { CONVERSATION_MEMBER_ROLE_LABELS, type ConversationParticipant } from '@ashniva/types';
import { View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { AppText, Divider } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { PersonAvatar } from '../../shared/components/PersonAvatar';

const MEMBER_AVATAR = 36;

/**
 * Who is in a group, and who has left it. Read-only, as on the web: membership follows the
 * project's team and is kept in sync on the server.
 */
export function GroupMembers({
  participants,
}: {
  participants: readonly ConversationParticipant[];
}) {
  const theme = useTheme();
  const present = participants.filter((person) => person.leftAt === null);
  const gone = participants.filter((person) => person.leftAt !== null);

  return (
    <View style={{ gap: theme.spacing.xs }}>
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
            <View
              key={person.id}
              style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}
            >
              <Icon name="exit-outline" size={14} color={theme.colors.textFaint} />
              <AppText size="sm" tone="faint">
                {person.name} · left
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
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
      <PersonAvatar person={person} size={MEMBER_AVATAR} />
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
