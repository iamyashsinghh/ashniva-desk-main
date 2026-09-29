import { IncidentDetailScreen } from '../features/problems/incidents/IncidentDetailScreen';
import { IncidentsScreen } from '../features/problems/incidents/IncidentsScreen';
import { ProblemDetailScreen } from '../features/problems/ProblemDetailScreen';
import { ProblemsScreen } from '../features/problems/ProblemsScreen';
import { RecurringIssuesScreen } from '../features/problems/RecurringIssuesScreen';
import type { RootStack } from './root-stack';

/**
 * Problems and their root-cause analysis, recurring issues, and incidents.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function problemRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="Problems"
        options={{ title: 'Problems' }}
        children={({ navigation }) => (
          <ProblemsScreen onOpen={(id) => navigation.navigate('ProblemDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="ProblemDetail"
        options={{ title: 'Problem' }}
        children={({ route, navigation }) => (
          <ProblemDetailScreen
            problemId={route.params.id}
            onOpenTicket={(id) => navigation.navigate('TicketDetail', { id })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenIncident={(id) => navigation.navigate('IncidentDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="RecurringIssues"
        options={{ title: 'Recurring issues' }}
        children={({ navigation }) => (
          <RecurringIssuesScreen
            onOpenProblem={(id) => navigation.navigate('ProblemDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="Incidents"
        options={{ title: 'Incidents' }}
        children={({ navigation }) => (
          <IncidentsScreen onOpen={(id) => navigation.navigate('IncidentDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="IncidentDetail"
        options={{ title: 'Incident' }}
        children={({ route, navigation }) => (
          <IncidentDetailScreen
            incidentId={route.params.id}
            onOpenProblem={(id) => navigation.navigate('ProblemDetail', { id })}
            onOpenTicket={(id) => navigation.navigate('TicketDetail', { id })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
          />
        )}
      />
    </>
  );
}
