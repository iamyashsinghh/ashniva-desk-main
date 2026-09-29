import type { MentionableUser } from '@ashniva/types';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '../../../shared/components/Avatar';
import { Icon } from '../../../shared/components/Icon';
import { AppText } from '../../../shared/components/primitives';
import { TOUCH_TARGET } from '../../../shared/theme/theme';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/** The people an `@` can name on this task, as a short list above the comment box. */
export function TaskMentionPicker({
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
        backgroundColor: theme.colors.surfaceRaised,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        maxHeight: 240,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          alignItems: 'center',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          flexDirection: 'row',
          paddingLeft: theme.spacing.md,
        }}
      >
        <Icon name="at" size={14} color={theme.colors.primary} />
        <AppText size="xs" tone="muted" weight="medium" style={{ flex: 1, marginLeft: 6 }}>
          Mention somebody on this task
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss the mention list"
          onPress={onDismiss}
          hitSlop={8}
          style={{
            justifyContent: 'center',
            minHeight: TOUCH_TARGET - 8,
            paddingHorizontal: theme.spacing.md,
          }}
        >
          <AppText size="sm" weight="medium" tone="primary">
            Dismiss
          </AppText>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
        {people.length === 0 ? (
          <AppText size="sm" tone="muted" style={{ padding: theme.spacing.md }}>
            {isLoading ? 'Looking…' : 'Nobody on this task matches that.'}
          </AppText>
        ) : null}
        {people.map((person) => (
          <Pressable
            key={person.userId}
            accessibilityRole="button"
            accessibilityLabel={`Mention ${person.name}`}
            onPress={() => onPick(person)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
              flexDirection: 'row',
              gap: theme.spacing.md,
              minHeight: TOUCH_TARGET,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.xs,
            })}
          >
            <Avatar name={person.name} size={28} />
            <View style={{ flex: 1 }}>
              <AppText size="sm" weight="medium" numberOfLines={1}>
                {person.name}
              </AppText>
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
