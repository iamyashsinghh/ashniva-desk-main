import type { MentionableUser } from '@ashniva/types';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { Avatar } from './Avatar';

/**
 * Who you can mention, above the keyboard.
 *
 * Everybody in this list came from `GET /conversations/:id/mentionable` — the conversation's own
 * audience, computed by the same code the send path refuses a forged mention against. The picker
 * never assembles a directory of its own and never falls back to the participants it happens to
 * have loaded: a name it offers has to be a name the message will reach.
 *
 * Keyboard navigation is a desktop concern and is deliberately absent. What replaces it is size:
 * every row is a full 44-point target, and the way out is an explicit "Dismiss" rather than a tap
 * on whatever is behind the list — with the keyboard up there is often nothing behind it to tap.
 *
 * A bounded height rather than a `FlatList`, because the page is at most
 * `DEFAULT_MENTIONABLE_LIMIT` people: a virtualized list inside a keyboard accessory is a
 * measurement problem with nothing to show for it at ten rows.
 */
export function MentionSuggestions({
  people,
  isLoading,
  onPick,
  onDismiss,
}: {
  people: readonly MentionableUser[];
  isLoading: boolean;
  onPick: (person: MentionableUser) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityLabel="People you can mention"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        maxHeight: 240,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
        }}
      >
        <AppText size="xs" tone="faint" weight="medium">
          Mention somebody in this conversation
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss the mention list"
          onPress={onDismiss}
          hitSlop={12}
          style={{
            justifyContent: 'center',
            minHeight: TOUCH_TARGET,
            paddingLeft: theme.spacing.md,
          }}
        >
          <AppText size="sm" weight="medium">
            Dismiss
          </AppText>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="always">
        {people.length === 0 ? (
          <View style={{ padding: theme.spacing.lg }}>
            <AppText size="sm" tone="muted">
              {isLoading ? 'Looking…' : 'Nobody here matches that.'}
            </AppText>
          </View>
        ) : null}
        {people.map((person) => (
          <Pressable
            key={person.userId}
            accessibilityRole="button"
            accessibilityLabel={`Mention ${person.name}`}
            onPress={() => onPick(person)}
            style={({ pressed }) => ({
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.md,
              minHeight: TOUCH_TARGET,
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.sm,
            })}
          >
            <Avatar name={person.name} size={32} />
            <View style={{ flex: 1 }}>
              <AppText size="sm" weight="medium" numberOfLines={1}>
                {person.name}
              </AppText>
              {/* Two people of the same name are told apart by their role and by what connects
                  them to this conversation. Neither is authorization and neither is consulted
                  anywhere a decision is made — they are here to be read. */}
              <AppText size="xs" tone="faint" numberOfLines={1}>
                {[person.roleName, person.contextLabel].filter(Boolean).join(' · ') || person.email}
              </AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
