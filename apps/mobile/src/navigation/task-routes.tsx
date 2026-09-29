import type { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CompleteTaskScreen } from '../features/tasks/CompleteTaskScreen';
import { TaskDetailScreen } from '../features/tasks/TaskDetailScreen';
import { TaskFormScreen } from '../features/tasks/TaskFormScreen';
import { TaskListScreen } from '../features/tasks/TaskListScreen';
import { RaiseTicketScreen } from '../features/tickets/RaiseTicketScreen';
import { TicketDetailScreen } from '../features/tickets/TicketDetailScreen';
import { TicketListScreen } from '../features/tickets/TicketListScreen';
import type { RootStackParamList } from './param-lists';

type RootStack = ReturnType<typeof createNativeStackNavigator<RootStackParamList>>;

/**
 * The task routes pushed over the tabs: detail, send for review, a dashboard tile's filtered
 * list, and the create/edit form. A fragment-returning function, like `projectRoutes`, because a
 * navigator ignores `Screen` elements wrapped in a component.
 */
export function taskRoutes(Stack: RootStack, openChat: ((conversationId: string) => void) | null) {
  return (
    <>
      <Stack.Screen
        name="TaskDetail"
        options={{ title: 'Task' }}
        children={({ route, navigation }) => (
          <TaskDetailScreen
            taskId={route.params.id}
            onComplete={(id) => navigation.navigate('CompleteTask', { id })}
            onOpenChat={openChat}
            onEdit={(id) => navigation.navigate('TaskForm', { id })}
          />
        )}
      />
      <Stack.Screen
        name="CompleteTask"
        options={{ title: 'Send for review' }}
        children={({ route, navigation }) => (
          <CompleteTaskScreen taskId={route.params.id} onDone={() => navigation.goBack()} />
        )}
      />
      <Stack.Screen
        name="TaskList"
        options={({ route }) => ({ title: route.params.title ?? 'Tasks' })}
        children={({ route, navigation }) => (
          <TaskListScreen
            {...(route.params.title ? { title: route.params.title } : {})}
            query={route.params.query}
            onOpen={(id) => navigation.navigate('TaskDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="TaskForm"
        options={({ route }) => ({ title: route.params?.id ? 'Edit task' : 'New task' })}
        children={({ route, navigation }) => (
          <TaskFormScreen
            {...(route.params?.id ? { taskId: route.params.id } : {})}
            {...(route.params?.projectId ? { projectId: route.params.projectId } : {})}
            onSaved={(id) =>
              route.params?.id ? navigation.goBack() : navigation.replace('TaskDetail', { id })
            }
          />
        )}
      />
    </>
  );
}

/** The ticket routes pushed over the tabs: detail, raise, and a dashboard tile's filtered list. */
export function ticketRoutes(
  Stack: RootStack,
  openChat: ((conversationId: string) => void) | null,
) {
  return (
    <>
      <Stack.Screen
        name="TicketDetail"
        options={{ title: 'Ticket' }}
        children={({ route, navigation }) => (
          <TicketDetailScreen
            ticketId={route.params.id}
            onOpenChat={openChat}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenTicket={(id) => navigation.push('TicketDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="RaiseTicket"
        options={{ title: 'Raise a ticket' }}
        children={({ navigation }) => (
          <RaiseTicketScreen onRaised={(id) => navigation.replace('TicketDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="TicketList"
        options={({ route }) => ({ title: route.params.title ?? 'Tickets' })}
        children={({ route, navigation }) => (
          <TicketListScreen
            {...(route.params.title ? { title: route.params.title } : {})}
            query={route.params.query}
            onOpen={(id) => navigation.navigate('TicketDetail', { id })}
          />
        )}
      />
    </>
  );
}
