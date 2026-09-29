import { ChangeRequestDetailScreen } from '../features/change-requests/ChangeRequestDetailScreen';
import { ChangeRequestFormScreen } from '../features/change-requests/ChangeRequestFormScreen';
import { ChangeRequestsScreen } from '../features/change-requests/ChangeRequestsScreen';
import { ContractDetailScreen } from '../features/contracts/ContractDetailScreen';
import { ContractFormScreen } from '../features/contracts/ContractFormScreen';
import { ContractsScreen } from '../features/contracts/ContractsScreen';
import { MilestoneDetailScreen } from '../features/milestones/MilestoneDetailScreen';
import { MilestoneFormScreen } from '../features/milestones/MilestoneFormScreen';
import type { RootStack } from './root-stack';

/**
 * Contracts, change requests and milestones on the provider's side.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 *
 * A form opened to create replaces itself with the new record, so Back from the record goes to
 * the list rather than to an emptied form; a form opened to edit just goes back.
 */
export function commercialRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="Contracts"
        options={{ title: 'Contracts' }}
        children={({ navigation }) => (
          <ContractsScreen
            onOpen={(id) => navigation.navigate('ContractDetail', { id })}
            onCreate={() => navigation.navigate('ContractForm')}
          />
        )}
      />
      <Stack.Screen
        name="ContractDetail"
        options={{ title: 'Contract' }}
        children={({ route, navigation }) => (
          <ContractDetailScreen
            contractId={route.params.id}
            onEdit={(id) => navigation.navigate('ContractForm', { id })}
            onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
            onOpenMilestone={(id) => navigation.navigate('MilestoneDetail', { id })}
            onAddMilestone={(projectId, contractId) =>
              navigation.navigate('MilestoneForm', { projectId, contractId })
            }
            onOpenChangeRequest={(id) => navigation.navigate('ChangeRequestDetail', { id })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="ContractForm"
        options={({ route }) => ({ title: route.params?.id ? 'Edit contract' : 'New contract' })}
        children={({ route, navigation }) => (
          <ContractFormScreen
            {...(route.params?.id ? { contractId: route.params.id } : {})}
            onSaved={(id) =>
              route.params?.id ? navigation.goBack() : navigation.replace('ContractDetail', { id })
            }
          />
        )}
      />
      <Stack.Screen
        name="ChangeRequests"
        options={{ title: 'Change requests' }}
        children={({ navigation }) => (
          <ChangeRequestsScreen
            onOpen={(id) => navigation.navigate('ChangeRequestDetail', { id })}
            onCreate={() => navigation.navigate('ChangeRequestForm')}
          />
        )}
      />
      <Stack.Screen
        name="ChangeRequestDetail"
        options={{ title: 'Change request' }}
        children={({ route, navigation }) => (
          <ChangeRequestDetailScreen
            changeRequestId={route.params.id}
            onEdit={(id) => navigation.navigate('ChangeRequestForm', { id })}
            onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
            onOpenContract={(id) => navigation.navigate('ContractDetail', { id })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenMilestone={(id) => navigation.navigate('MilestoneDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="ChangeRequestForm"
        options={({ route }) => ({
          title: route.params?.id ? 'Edit change request' : 'Raise a change request',
        })}
        children={({ route, navigation }) => (
          <ChangeRequestFormScreen
            {...(route.params?.id ? { changeRequestId: route.params.id } : {})}
            onSaved={(id) =>
              route.params?.id
                ? navigation.goBack()
                : navigation.replace('ChangeRequestDetail', { id })
            }
          />
        )}
      />
      <Stack.Screen
        name="MilestoneDetail"
        options={{ title: 'Milestone' }}
        children={({ route, navigation }) => (
          <MilestoneDetailScreen
            milestoneId={route.params.id}
            onEdit={(id) => navigation.navigate('MilestoneForm', { id })}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenApproval={(id) => navigation.navigate('ApprovalDetail', { id })}
            onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
            onOpenContract={(id) => navigation.navigate('ContractDetail', { id })}
            onOpenChangeRequest={(id) => navigation.navigate('ChangeRequestDetail', { id })}
            onOpenMilestone={(id) => navigation.push('MilestoneDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="MilestoneForm"
        options={({ route }) => ({ title: route.params.id ? 'Edit milestone' : 'New milestone' })}
        children={({ route, navigation }) => (
          <MilestoneFormScreen
            {...(route.params.id ? { milestoneId: route.params.id } : {})}
            {...(route.params.projectId ? { projectId: route.params.projectId } : {})}
            {...(route.params.contractId ? { contractId: route.params.contractId } : {})}
            onSaved={(id) =>
              route.params.id ? navigation.goBack() : navigation.replace('MilestoneDetail', { id })
            }
          />
        )}
      />
    </>
  );
}
