import {
  AuditLogScreen,
  CompaniesScreen,
  CompanyDetailScreen,
  InviteUserScreen,
  RoleDetailScreen,
  RolesScreen,
  SystemStatusScreen,
  UserDetailScreen,
  UsersScreen,
} from '../features/admin';
import type { RootStack } from './root-stack';

/** Only a company other than your own travels as a param; your own is the API's default. */
const scoped = (organizationId: string | undefined) => (organizationId ? { organizationId } : {});

/**
 * Organisation administration: companies, users, roles, audit history and system status.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function adminRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="AdminCompanies"
        options={{ title: 'Companies & clients' }}
        children={({ navigation }) => (
          <CompaniesScreen onOpen={(id) => navigation.navigate('AdminCompanyDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="AdminCompanyDetail"
        options={{ title: 'Company' }}
        children={({ route, navigation }) => (
          <CompanyDetailScreen
            organizationId={route.params.id}
            onOpenUser={(id, organizationId) =>
              navigation.navigate('AdminUserDetail', { id, ...scoped(organizationId) })
            }
            onInvite={(organizationId) =>
              navigation.navigate('AdminUserInvite', { organizationId })
            }
            onOpenPeople={(organizationId) =>
              navigation.navigate('AdminCompanyUsers', { organizationId })
            }
            onOpenRoles={(organizationId) =>
              navigation.navigate('AdminCompanyRoles', { organizationId })
            }
          />
        )}
      />
      <Stack.Screen
        name="AdminUsers"
        options={{ title: 'Users & teams' }}
        children={({ navigation }) => (
          <UsersScreen
            onOpenUser={(id, organizationId) =>
              navigation.navigate('AdminUserDetail', { id, ...scoped(organizationId) })
            }
            onInvite={(organizationId) =>
              navigation.navigate('AdminUserInvite', scoped(organizationId))
            }
          />
        )}
      />
      <Stack.Screen
        name="AdminCompanyUsers"
        options={{ title: 'People' }}
        children={({ route, navigation }) => (
          <UsersScreen
            organizationId={route.params.organizationId}
            onOpenUser={(id, organizationId) =>
              navigation.navigate('AdminUserDetail', { id, ...scoped(organizationId) })
            }
            onInvite={(organizationId) =>
              navigation.navigate('AdminUserInvite', scoped(organizationId))
            }
          />
        )}
      />
      <Stack.Screen
        name="AdminUserDetail"
        options={{ title: 'Person' }}
        children={({ route, navigation }) => (
          <UserDetailScreen
            userId={route.params.id}
            {...scoped(route.params.organizationId)}
            onDeleted={() => navigation.goBack()}
          />
        )}
      />
      <Stack.Screen
        name="AdminUserInvite"
        options={{ title: 'Add person' }}
        children={({ route, navigation }) => (
          <InviteUserScreen
            {...scoped(route.params?.organizationId)}
            onDone={() => navigation.goBack()}
            // Replaced rather than pushed, so Back from the new person skips the spent form.
            onOpenUser={(id, organizationId) =>
              navigation.replace('AdminUserDetail', { id, ...scoped(organizationId) })
            }
          />
        )}
      />
      <Stack.Screen
        name="AdminRoles"
        options={{ title: 'Roles & permissions' }}
        children={({ navigation }) => (
          <RolesScreen
            onOpenRole={(id, organizationId) =>
              navigation.navigate('AdminRoleDetail', { id, ...scoped(organizationId) })
            }
          />
        )}
      />
      <Stack.Screen
        name="AdminCompanyRoles"
        options={{ title: 'Roles & permissions' }}
        children={({ route, navigation }) => (
          <RolesScreen
            organizationId={route.params.organizationId}
            onOpenRole={(id, organizationId) =>
              navigation.navigate('AdminRoleDetail', { id, ...scoped(organizationId) })
            }
          />
        )}
      />
      <Stack.Screen
        name="AdminRoleDetail"
        options={{ title: 'Role' }}
        children={({ route, navigation }) => (
          <RoleDetailScreen
            roleId={route.params.id}
            {...scoped(route.params.organizationId)}
            onDeleted={() => navigation.goBack()}
          />
        )}
      />
      <Stack.Screen
        name="AuditLog"
        options={{ title: 'Audit history' }}
        component={AuditLogScreen}
      />
      <Stack.Screen
        name="SystemStatus"
        options={{ title: 'System status' }}
        component={SystemStatusScreen}
      />
    </>
  );
}
