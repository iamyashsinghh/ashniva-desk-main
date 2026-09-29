import type { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CompletedTodayScreen } from '../features/completed-today';
import { InternWorkFormScreen, InternWorkScreen } from '../features/intern-work';
import { SessionLogsScreen } from '../features/session-logs';
import { SupportQueueScreen } from '../features/support-queue';
import type { RootStackParamList } from './param-lists';

type RootStack = ReturnType<typeof createNativeStackNavigator<RootStackParamList>>;

/**
 * The team-work screens the side menu opens: intern work, what was completed today, the login
 * and break log, and the support queue.
 *
 * A function returning a fragment, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function workRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="InternWork"
        options={{ title: 'Intern work' }}
        children={({ navigation }) => (
          <InternWorkScreen
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onCreate={() => navigation.navigate('InternWorkForm')}
          />
        )}
      />
      <Stack.Screen
        name="InternWorkForm"
        options={{ title: 'Assign intern work' }}
        children={({ navigation }) => (
          <InternWorkFormScreen
            onDone={() => navigation.goBack()}
            // Replaced rather than pushed, so Back from the new task skips the spent form.
            onOpenTask={(id) => navigation.replace('TaskDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="CompletedToday"
        options={{ title: 'Completed today' }}
        children={({ navigation }) => (
          <CompletedTodayScreen
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="SessionLogs"
        options={{ title: 'Login & break log' }}
        component={SessionLogsScreen}
      />
      <Stack.Screen
        name="SupportQueue"
        options={{ title: 'Support queue' }}
        children={({ navigation }) => (
          <SupportQueueScreen onOpenTicket={(id) => navigation.navigate('TicketDetail', { id })} />
        )}
      />
    </>
  );
}
