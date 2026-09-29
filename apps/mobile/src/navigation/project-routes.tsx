import type { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ProjectDetailScreen } from '../features/projects/ProjectDetailScreen';
import { ProjectFormScreen } from '../features/projects/ProjectFormScreen';
import { ProjectMembersScreen } from '../features/projects/ProjectMembersScreen';
import { ProjectsScreen } from '../features/projects/ProjectsScreen';
import { ProjectSummaryScreen, WorkPlanEditorScreen } from '../features/projects/work-plan';
import type { RootStackParamList } from './param-lists';

type RootStack = ReturnType<typeof createNativeStackNavigator<RootStackParamList>>;

/**
 * The project routes: list, detail, form, team, and the work plan.
 *
 * A function returning a fragment rather than a component, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children — a component wrapping them is ignored.
 */
export function projectRoutes(
  Stack: RootStack,
  openChat: ((conversationId: string) => void) | null,
) {
  return (
    <>
      <Stack.Screen
        name="Projects"
        options={{ title: 'Projects' }}
        children={({ navigation }) => (
          <ProjectsScreen
            onOpen={(id) => navigation.navigate('ProjectDetail', { id })}
            onCreate={() => navigation.navigate('ProjectForm')}
          />
        )}
      />
      <Stack.Screen
        name="ProjectDetail"
        options={{ title: 'Project' }}
        children={({ route, navigation }) => (
          <ProjectDetailScreen
            projectId={route.params.id}
            onOpenChat={openChat}
            onOpenSummary={(projectId) => navigation.navigate('ProjectSummary', { projectId })}
            onCreateTask={(projectId) => navigation.navigate('TaskForm', { projectId })}
            onEdit={(id) => navigation.navigate('ProjectForm', { id })}
            onEditMembers={(id) => navigation.navigate('ProjectMembers', { id })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenTicket={(id) => navigation.navigate('TicketDetail', { id })}
            onOpenMilestone={(id) => navigation.navigate('MilestoneDetail', { id })}
            onAddMilestone={(projectId) => navigation.navigate('MilestoneForm', { projectId })}
          />
        )}
      />
      <Stack.Screen
        name="ProjectForm"
        options={({ route }) => ({ title: route.params?.id ? 'Edit project' : 'New project' })}
        children={({ route, navigation }) => (
          <ProjectFormScreen
            {...(route.params?.id ? { projectId: route.params.id } : {})}
            onSaved={(id) =>
              route.params?.id ? navigation.goBack() : navigation.replace('ProjectDetail', { id })
            }
          />
        )}
      />
      <Stack.Screen
        name="ProjectMembers"
        options={{ title: 'Project team' }}
        children={({ route, navigation }) => (
          <ProjectMembersScreen projectId={route.params.id} onSaved={() => navigation.goBack()} />
        )}
      />
      <Stack.Screen
        name="ProjectSummary"
        options={{ title: 'Project summary' }}
        children={({ route, navigation }) => (
          <ProjectSummaryScreen
            projectId={route.params.projectId}
            onOpenEditor={(projectId) => navigation.navigate('WorkPlanEditor', { projectId })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="WorkPlanEditor"
        options={{ title: 'Edit work plan' }}
        children={({ route, navigation }) => (
          <WorkPlanEditorScreen
            projectId={route.params.projectId}
            onDone={() => navigation.goBack()}
          />
        )}
      />
    </>
  );
}
