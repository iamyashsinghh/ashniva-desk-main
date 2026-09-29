import type { SessionUser } from '@ashniva/types';
import type { createNativeStackNavigator } from '@react-navigation/native-stack';

import { canInspectConversations, canStartPersonalChat } from '../features/chat/chat-access';
import { ConversationScreen } from '../features/chat/ConversationScreen';
import { ConversationsScreen } from '../features/chat/ConversationsScreen';
import { GroupScreen } from '../features/chat/GroupScreen';
import { NewConversationScreen } from '../features/chat/NewConversationScreen';
import type { RootStackParamList } from './param-lists';

type RootStack = ReturnType<typeof createNativeStackNavigator<RootStackParamList>>;

/**
 * The chat screens: the inbox, a conversation, starting one, and a group's members.
 *
 * A function returning a fragment, like `workRoutes`, because a navigator only accepts `Screen`
 * elements (or fragments of them) as children.
 */
export function chatRoutes(Stack: RootStack, user: SessionUser | null) {
  const personalChat = canStartPersonalChat(user);
  return (
    <>
      <Stack.Screen
        name="Conversations"
        options={{ title: 'Messages' }}
        children={({ navigation }) => (
          <ConversationsScreen
            onOpen={(id) => navigation.navigate('Conversation', { id })}
            personalChat={personalChat}
            canInspect={canInspectConversations(user)}
            // Null rather than a button that fails: without personal chat the API refuses to
            // open a direct conversation.
            {...(personalChat ? { onStart: () => navigation.navigate('NewConversation') } : {})}
          />
        )}
      />
      <Stack.Screen
        name="Conversation"
        // The screen draws its own brand-coloured bar — back, who it is with, call, menu — so a
        // stack header above it would be a second bar saying "Conversation".
        options={{ title: 'Conversation', headerShown: false }}
        children={({ route, navigation }) => (
          <ConversationScreen
            conversationId={route.params.id}
            onBack={() => navigation.goBack()}
            onOpenWallpaper={(id) => navigation.navigate('ChatWallpaper', { conversationId: id })}
            onOpenGroup={(id) => navigation.navigate('ConversationGroup', { id })}
            onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenTicket={(id) => navigation.navigate('TicketDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="NewConversation"
        options={{ title: 'Start a conversation' }}
        children={({ navigation }) => (
          <NewConversationScreen onOpened={(id) => navigation.replace('Conversation', { id })} />
        )}
      />
      <Stack.Screen
        name="ConversationGroup"
        options={{ title: 'Group' }}
        children={({ route, navigation }) => (
          <GroupScreen
            conversationId={route.params.id}
            // Back past the thread as well: somebody who has left a group reads nothing in it
            // from the next request onwards, so returning to it would land on a refusal.
            onLeft={() => navigation.navigate('Conversations')}
          />
        )}
      />
    </>
  );
}
