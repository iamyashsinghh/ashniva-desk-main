import { PERMISSIONS, type OrganizationSummary, type OrganizationType } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { useResource } from '../../../shared/api/queries';
import { Chip, ChipScroller } from '../../../shared/components/chips';
import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { AppText, Button, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { ListEmpty, NotAllowed } from '../shared/AdminStates';
import { CompanyCard } from './CompanyCard';
import { CompanyFormSheet } from './CompanyFormSheet';
import {
  COMPANIES_KEY,
  filterCompanies,
  ORGANIZATION_TYPES,
  organizationTypeLabel,
} from './company-display';

/**
 * Companies & clients: every organization with its people, projects and open tickets.
 *
 * `GET /organizations` is the administrative list and asks for `organization:manage`, the same
 * permission that creates and edits, so a person who can open this screen can use all of it.
 */
export function CompaniesScreen({ onOpen }: { onOpen: (organizationId: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const allowed = can(PERMISSIONS.ORGANIZATION_MANAGE);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<OrganizationType | null>(null);
  const [creating, setCreating] = useState(false);
  const query = useResource<OrganizationSummary[]>(COMPANIES_KEY, '/organizations', {
    enabled: allowed,
  });
  const companies = useMemo(
    () => filterCompanies(query.data ?? [], search, type),
    [query.data, search, type],
  );

  if (!allowed) {
    return <NotAllowed message="Companies are managed by the service provider’s administrators." />;
  }

  const total = query.data?.length ?? 0;
  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search companies" />
      <ChipScroller>
        <Chip label="All" selected={type === null} onPress={() => setType(null)} />
        {ORGANIZATION_TYPES.map((option) => (
          <Chip
            key={option}
            label={organizationTypeLabel(option)}
            selected={type === option}
            onPress={() => setType(type === option ? null : option)}
          />
        ))}
      </ChipScroller>
      <Button
        label="New company"
        icon="add"
        variant="secondary"
        onPress={() => setCreating(true)}
      />
      {total > 0 ? (
        <AppText size="sm" tone="muted">
          {companies.length === total
            ? `${total} companies`
            : `${companies.length} of ${total} companies`}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={companies}
        keyExtractor={(organization) => organization.id}
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
            filtered={Boolean(search.trim()) || type !== null}
            title="No companies yet"
            description="Add the group companies and clients you work with."
            icon="business-outline"
            loadingLabel="Loading companies"
          />
        }
        renderItem={({ item }) => (
          <CompanyCard organization={item} onPress={() => onOpen(item.id)} />
        )}
      />
      {creating ? (
        <CompanyFormSheet
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            onOpen(created.id);
          }}
        />
      ) : null}
    </Screen>
  );
}
