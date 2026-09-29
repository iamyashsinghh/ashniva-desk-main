import { CONVERSATION_KIND, isScopeKind, type ConversationDetail } from '@ashniva/types';
import { View } from 'react-native';

import { Sheet } from '../../shared/components/Sheet';
import { ConversationCalls } from './ConversationCalls';
import { ActionRow } from './MessageActionSheet';

export interface ConversationMenuActions {
  onSearch: () => void;
  onOpenWallpaper?: (() => void) | undefined;
  onOpenDetails?: (() => void) | undefined;
  onOpenCalls?: (() => void) | undefined;
}

/** Whether this thread has a calls panel worth opening: telephony is project-anchored. */
export function hasCalls(conversation: ConversationDetail): boolean {
  return !isScopeKind(conversation.kind);
}

/**
 * The ⋮ menu of the top bar: search, the wallpaper, the details and — where calls can exist — the
 * calls. Each entry closes the menu before it acts, so a sheet never opens on top of this one.
 */
export function ConversationMenu({
  conversation,
  visible,
  onClose,
  actions,
}: {
  conversation: ConversationDetail;
  visible: boolean;
  onClose: () => void;
  actions: ConversationMenuActions;
}) {
  const isGroup = conversation.kind === CONVERSATION_KIND.GROUP;
  const then = (run: () => void) => () => {
    onClose();
    run();
  };
  const { onOpenWallpaper, onOpenDetails, onOpenCalls } = actions;

  return (
    <Sheet visible={visible} title="Conversation options" onClose={onClose}>
      <View style={{ gap: 2 }}>
        <ActionRow
          icon="search-outline"
          label="Search"
          hint="Finds words in this conversation"
          onPress={then(actions.onSearch)}
        />
        {onOpenWallpaper ? (
          <ActionRow
            icon="image-outline"
            label="Wallpaper"
            hint="Chooses what is drawn behind this conversation"
            onPress={then(onOpenWallpaper)}
          />
        ) : null}
        {onOpenCalls && hasCalls(conversation) ? (
          <ActionRow
            icon="call-outline"
            label="Calls"
            hint="Calls placed from this conversation"
            onPress={then(onOpenCalls)}
          />
        ) : null}
        {onOpenDetails ? (
          <ActionRow
            icon="information-circle-outline"
            label={isGroup ? 'Group info' : 'Details'}
            hint={isGroup ? 'Who is in this group' : 'Who can read this, and what it is about'}
            onPress={then(onOpenDetails)}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

/** Placing a call and the calls placed before, in a sheet rather than at the foot of the thread. */
export function CallsSheet({
  conversation,
  visible,
  onClose,
}: {
  conversation: ConversationDetail;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title="Calls" onClose={onClose} scroll>
      {visible ? <ConversationCalls conversation={conversation} showWhenEmpty /> : null}
    </Sheet>
  );
}
