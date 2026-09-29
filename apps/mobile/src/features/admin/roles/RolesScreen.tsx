import { PERMISSIONS } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { Segmented } from '../../../shared/components/navigation-list';
import { AppText, Button, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { scopeOf } from '../shared/admin-api';
import { ListEmpty, NotAllowed } from '../shared/AdminStates';
import { OrganizationSwitcher, useCompanyScope } from '../shared/OrganizationSwitcher';
import { NewRoleSheet } from './NewRoleSheet';
import { RoleCard } from './RoleCard';
import { useRoles } from './roles-api';

type Kind = 'custom' | 'system';

const KINDS = [
  { value: 'custom', label: 'Custom', icon: 'shield-checkmark-outline' },
  { value: 'system', label: 'System', icon: 'shield-outline' },
] as const;

/**
 * Roles & permissions: the company's custom roles, which can be edited, and the system roles,
 * which are fixed and shown so a custom role can be compared with the one it came from.
 */
export function RolesScreen({
  organizationId,
  onOpenRole,
}: {
  /** The company to start on; the signed-in person's own when absent. */
  organizationId?: string;
  onOpenRole: (roleId: string, organizationId: string | undefined) => void;
}) {
  const theme = useTheme();
  const { user, can } = useSession();
  const allowed = can(PERMISSIONS.ROLE_MANAGE);
  const ownId = user?.organization.id ?? '';
  // Null means "my own company", resolved on every draw: the session can arrive after the first.
  const [picked, setPicked] = useState<string | null>(organizationId ?? null);
  const company = picked ?? ownId;
  const [kind, setKind] = useState<Kind>('custom');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const companyScope = useCompanyScope(company, allowed);
  const scope = scopeOf(company, ownId);
  const query = useRoles(scope, allowed);

  const roles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? [])
      .filter((role) => role.isSystem === (kind === 'system'))
      .filter(
        (role) =>
          !term ||
          role.name.toLowerCase().includes(term) ||
          (role.description?.toLowerCase().includes(term) ?? false),
      );
  }, [query.data, kind, search]);

  if (!allowed) {
    return (
      <NotAllowed message="Roles are managed by people with the role management permission." />
    );
  }

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      {companyScope.isProvider ? (
        <OrganizationSwitcher
          value={company}
          onChange={setPicked}
          organizations={companyScope.options}
          loading={companyScope.loading}
        />
      ) : null}
      <Segmented label="Which roles" options={KINDS} value={kind} onChange={setKind} />
      <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search roles" />
      {kind === 'custom' ? (
        <Button
          label="New custom role"
          icon="add"
          variant="secondary"
          onPress={() => setCreating(true)}
        />
      ) : (
        <AppText size="sm" tone="muted">
          System roles are fixed. Start a custom role from one to change what it can do.
        </AppText>
      )}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={roles}
        keyExtractor={(role) => role.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={query.isRefetching} onRefresh={() => query.refetch()} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={
          <ListEmpty
            loading={query.isLoading}
            error={query.error}
            onRetry={() => void query.refetch()}
            filtered={Boolean(search.trim())}
            title="No custom roles yet"
            description="Create one to give a person a narrower set of permissions than any system role."
            icon="shield-checkmark-outline"
            loadingLabel="Loading roles"
          />
        }
        renderItem={({ item }) => (
          <RoleCard role={item} onPress={() => onOpenRole(item.id, scope)} />
        )}
      />
      {creating ? (
        <NewRoleSheet
          organizationId={scope}
          onClose={() => setCreating(false)}
          onCreated={(role) => {
            setCreating(false);
            onOpenRole(role.id, scope);
          }}
        />
      ) : null}
    </Screen>
  );
}
