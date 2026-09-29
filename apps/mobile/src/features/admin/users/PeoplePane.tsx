import { ALL_ROLE_KEYS, ROLE_LABELS, type RoleKey, type UserStatus } from '@ashniva/types';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';

import { Chip, ChipScroller } from '../../../shared/components/chips';
import { FilterSheet, SearchFilterBar, useDebounced } from '../../../shared/components/FilterSheet';
import { AppText, Button } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { SelectField } from '../../../shared/components/SelectField';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { ListEmpty } from '../shared/AdminStates';
import { UserCard } from './UserCard';
import { USER_STATUSES, userStatusLabel } from './user-display';
import { useUsers, type UserFilters } from './users-api';

const ROLE_OPTIONS = ALL_ROLE_KEYS.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/**
 * The people of one company, searched and filtered by the API (`search`, `status`, `roleKey`), so
 * a large client is not downloaded to be filtered on the phone.
 */
export function PeoplePane({
  header,
  scope,
  onOpenUser,
  onInvite,
}: {
  header: ReactNode;
  scope: string | undefined;
  onOpenUser: (userId: string) => void;
  onInvite: () => void;
}) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [roleKey, setRoleKey] = useState<RoleKey | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const term = useDebounced(search.trim());
  const filters = useMemo<UserFilters>(
    () => ({
      ...(term ? { search: term } : {}),
      ...(status ? { status } : {}),
      ...(roleKey ? { roleKey } : {}),
    }),
    [term, status, roleKey],
  );
  const query = useUsers(scope, filters);
  const people = query.data ?? [];
  const filtered = Object.keys(filters).length > 0;

  const listHeader = (
    <View style={{ gap: theme.spacing.md }}>
      {header}
      <SearchFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search name or email"
        activeFilters={roleKey ? 1 : 0}
        onOpenFilters={() => setFiltersOpen(true)}
      />
      <ChipScroller>
        <Chip label="Everyone" selected={status === null} onPress={() => setStatus(null)} />
        {USER_STATUSES.map((option) => (
          <Chip
            key={option}
            label={userStatusLabel(option)}
            selected={status === option}
            onPress={() => setStatus(status === option ? null : option)}
          />
        ))}
      </ChipScroller>
      <Button label="Add person" icon="person-add-outline" variant="secondary" onPress={onInvite} />
      {query.data ? (
        <AppText size="sm" tone="muted">
          {people.length === 1 ? '1 person' : `${people.length} people`}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <>
      <FlatList
        data={people}
        keyExtractor={(user) => user.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={query.isRefetching} onRefresh={() => query.refetch()} />}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={
          <ListEmpty
            loading={query.isLoading}
            error={query.error}
            onRetry={() => void query.refetch()}
            filtered={filtered}
            title="No people in this company yet"
            description="Invite the first person with “Add person”."
            icon="people-outline"
            loadingLabel="Loading people"
          />
        }
        renderItem={({ item }) => <UserCard user={item} onPress={() => onOpenUser(item.id)} />}
      />
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => setRoleKey(null)}
      >
        <SelectField
          label="Role"
          icon="shield-outline"
          options={ROLE_OPTIONS}
          value={roleKey ? [roleKey] : []}
          onChange={(values) => setRoleKey(values[0] ?? null)}
          allowClear
          clearLabel="Any role"
          placeholder="Any role"
        />
      </FilterSheet>
    </>
  );
}
