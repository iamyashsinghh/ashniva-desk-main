import {
  MAX_CONVERSATION_TITLE_LENGTH,
  MAX_GROUP_MEMBERS,
  type MessagingScopeContact,
} from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { AppText, Button, Card, Field, Input } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { Avatar } from './Avatar';

/** The pieces of `NewConversationScreen`, split out so the screen reads as its list. */

/** The avatar's width on a contact row, which the separator is inset by. */
export const CONTACT_AVATAR = 40;

/**
 * The group being assembled, above the directory it is assembled from.
 *
 * Hidden until somebody has picked their first person: an empty group form at the top of a screen
 * whose ordinary use is "message one person" is in the way of the ordinary use.
 */
export function GroupDraft({
  title,
  chosen,
  busy,
  onTitle,
  onRemove,
  onCreate,
}: {
  title: string;
  chosen: MessagingScopeContact[];
  busy: boolean;
  onTitle: (value: string) => void;
  onRemove: (userId: string) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  if (chosen.length === 0) {
    return null;
  }
  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Field label="New group" hint={`${chosen.length} chosen. At most ${MAX_GROUP_MEMBERS}.`}>
        <Input
          accessibilityLabel="Group name"
          placeholder="What is this group for?"
          value={title}
          maxLength={MAX_CONVERSATION_TITLE_LENGTH}
          onChangeText={onTitle}
        />
      </Field>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {chosen.map((contact) => (
          <MemberChip key={contact.id} name={contact.name} onRemove={() => onRemove(contact.id)} />
        ))}
      </View>
      <Button
        label="Create the group"
        loading={busy}
        disabled={title.trim().length === 0}
        accessibilityHint="Everybody named is checked against your reach by the API"
        onPress={onCreate}
      />
    </Card>
  );
}

/** Somebody chosen for the group. The whole chip takes them back off; the cross says so. */
function MemberChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${name}`}
      onPress={onRemove}
      hitSlop={4}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: theme.colors.primarySoft,
        borderColor: theme.colors.primary,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        flexDirection: 'row',
        gap: theme.spacing.xs + 2,
        minHeight: TOUCH_TARGET - 8,
        opacity: pressed ? 0.7 : 1,
        paddingLeft: theme.spacing.xs,
        paddingRight: theme.spacing.md,
      })}
    >
      <Avatar name={name} size={26} />
      <AppText size="sm" weight="medium" tone="primary">
        {name}
      </AppText>
      <Glyph name="close" color={theme.colors.primary} size={10} />
    </Pressable>
  );
}

export function ContactRow({
  contact,
  chosen,
  canAdd,
  busy,
  onMessage,
  onAdd,
}: {
  contact: MessagingScopeContact;
  chosen: boolean;
  canAdd: boolean;
  busy: boolean;
  onMessage: () => void;
  onAdd: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.screen,
        paddingVertical: theme.spacing.md,
      }}
    >
      <Avatar name={contact.name} size={CONTACT_AVATAR} />
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        <View style={{ gap: 2 }}>
          <AppText weight="medium" numberOfLines={1}>
            {contact.name}
          </AppText>
          <AppText size="xs" tone="muted">
            {contact.reason}
          </AppText>
        </View>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.sm,
          }}
        >
          <Button
            label={
              contact.conversationId
                ? `Open the thread with ${contact.name}`
                : `Message ${contact.name}`
            }
            size="sm"
            loading={busy}
            onPress={onMessage}
          />
          {chosen ? (
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
              <Glyph name="check" color={theme.colors.success} size={11} />
              <AppText size="xs" tone="muted">
                In the group you are building.
              </AppText>
            </View>
          ) : (
            <Button
              label={`Add ${contact.name} to a group`}
              variant="secondary"
              size="sm"
              icon="plus"
              disabled={!canAdd}
              onPress={onAdd}
            />
          )}
        </View>
      </View>
    </View>
  );
}
