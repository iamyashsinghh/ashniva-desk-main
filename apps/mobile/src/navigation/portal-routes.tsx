import { PERMISSIONS } from '@ashniva/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useSession } from '../features/auth/SessionProvider';
import {
  PortalChangeRequestDetailScreen,
  PortalChangeRequestsScreen,
  PortalContractDetailScreen,
  PortalContractsScreen,
  PortalProgressSummariesScreen,
  PortalProgressSummaryScreen,
  PortalProjectDetailScreen,
  PortalProjectsScreen,
  PortalReportsScreen,
} from '../features/client-portal';
import type { RootStackParamList } from './param-lists';
import type { RootStack } from './root-stack';
import { tabsFor } from './tabs';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * A client's portal screens beyond the tabs: projects, contracts, change requests, reports and progress summaries.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function portalRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="PortalProjects"
        options={{ title: 'Projects' }}
        children={({ navigation }) => (
          <PortalProjectsScreen
            onOpen={(id) => navigation.navigate('PortalProjectDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="PortalProjectDetail"
        options={{ title: 'Project' }}
        children={({ route, navigation }) => (
          <ProjectRoute projectId={route.params.id} navigation={navigation} />
        )}
      />
      <Stack.Screen
        name="PortalContracts"
        options={{ title: 'Contracts' }}
        children={({ navigation }) => (
          <PortalContractsScreen
            onOpen={(id) => navigation.navigate('PortalContractDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="PortalContractDetail"
        options={{ title: 'Contract' }}
        children={({ route, navigation }) => (
          <PortalContractDetailScreen
            contractId={route.params.id}
            onOpenProject={(id) => navigation.navigate('PortalProjectDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="PortalChangeRequests"
        options={{ title: 'Change requests' }}
        children={({ navigation }) => (
          <PortalChangeRequestsScreen
            onOpen={(id) => navigation.navigate('PortalChangeRequestDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="PortalChangeRequestDetail"
        options={{ title: 'Change request' }}
        children={({ route, navigation }) => (
          <PortalChangeRequestDetailScreen
            changeRequestId={route.params.id}
            onOpenProject={(id) => navigation.navigate('PortalProjectDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="PortalReports"
        options={{ title: 'Reports' }}
        component={PortalReportsScreen}
      />
      <Stack.Screen
        name="PortalProgressSummaries"
        options={{ title: 'Progress summaries' }}
        children={({ navigation }) => (
          <PortalProgressSummariesScreen
            onOpen={(id) => navigation.navigate('PortalProgressSummary', { id })}
          />
        )}
      />
      <Stack.Screen
        name="PortalProgressSummary"
        options={{ title: 'Progress summary' }}
        children={({ route, navigation }) => (
          <PortalProgressSummaryScreen
            summaryId={route.params.id}
            onOpenProject={(id) => navigation.navigate('PortalProjectDetail', { id })}
          />
        )}
      />
    </>
  );
}

/**
 * The project detail's links out, each offered only where it leads somewhere this person may go:
 * a sign-off only with the permission to decide one (the web guards that route the same way), the
 * tickets tab only when this person has one.
 */
function ProjectRoute({ projectId, navigation }: { projectId: string; navigation: Navigation }) {
  const { user, can } = useSession();
  const hasTickets = user ? tabsFor(user).some((tab) => tab.name === 'Tickets') : false;
  return (
    <PortalProjectDetailScreen
      projectId={projectId}
      onOpenRelease={(id) => navigation.navigate('ReleaseNote', { id })}
      {...(can(PERMISSIONS.UAT_DECIDE)
        ? { onOpenSignOff: (id: string) => navigation.navigate('SignOff', { id }) }
        : {})}
      {...(hasTickets
        ? { onOpenTickets: () => navigation.navigate('Main', { screen: 'Tickets' }) }
        : {})}
    />
  );
}
