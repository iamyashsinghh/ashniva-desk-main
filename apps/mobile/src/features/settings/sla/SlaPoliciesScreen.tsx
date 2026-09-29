import { PERMISSIONS, type SlaPolicySummary } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Chip, ChipScroller } from '../../../shared/components/chips';
import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { StickyActionBar } from '../../../shared/components/layout';
import { AppText, Button, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { QueryState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { FeedbackBanner, NoAccess, type Feedback } from '../shared/SettingsLayout';
import { useDeleteSlaPolicy, useSlaPolicies } from './api';
import { reapplyMessage, scopeOf, type Scope } from './sla-form';
import { SlaPolicyCard } from './SlaPolicyCard';
import { SlaPolicySheet } from './SlaPolicySheet';

type ScopeFilter = 'all' | Scope;

const FILTERS: { value: ScopeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'default', label: 'Default' },
  { value: 'client', label: 'Per client' },
  { value: 'project', label: 'Per project' },
];

function matches(policy: SlaPolicySummary, term: string, scope: ScopeFilter): boolean {
  if (scope !== 'all' && scopeOf(policy) !== scope) {
    return false;
  }
  if (!term) {
    return true;
  }
  return [policy.name, policy.clientOrganization?.name, policy.project?.code, policy.project?.name]
    .filter(Boolean)
    .some((text) => text?.toLowerCase().includes(term));
}

/**
 * Admin → SLA policies: default, per-client and per-project targets in business hours.
 *
 * The list, the policy itself and every write are behind `sla:manage`, so without it nothing is
 * fetched. Search and the scope chips filter what is already loaded: an organization has a handful
 * of policies, not a page of them.
 */
export function SlaPoliciesScreen() {
  const theme = useTheme();
  const { can } = useSession();
  const canManage = can(PERMISSIONS.SLA_MANAGE);
  const policies = useSlaPolicies(canManage);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [editing, setEditing] = useState<SlaPolicySummary | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SlaPolicySummary | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const visible = useMemo(
    () =>
      (policies.data ?? []).filter((policy) => matches(policy, search.trim().toLowerCase(), scope)),
    [policies.data, search, scope],
  );

  if (!canManage) {
    return <NoAccess description="SLA policies need the SLA management permission." />;
  }

  const filtered = Boolean(search.trim()) || scope !== 'all';

  return (
    <Screen>
      <FlatList
        data={visible}
        keyExtractor={(policy) => policy.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh busy={policies.isRefetching} onRefresh={() => policies.refetch()} />
        }
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.sm }}>
            <AppText size="sm" tone="muted">
              Response and resolution targets in business hours. A project policy wins over a client
              policy, which wins over the default.
            </AppText>
            <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search policies" />
            <ChipScroller>
              {FILTERS.map((filter) => (
                <Chip
                  key={filter.value}
                  label={filter.label}
                  selected={scope === filter.value}
                  onPress={() => setScope(filter.value)}
                />
              ))}
            </ChipScroller>
            <FeedbackBanner feedback={feedback} />
          </View>
        }
        ListEmptyComponent={
          <QueryState
            isLoading={policies.isLoading}
            error={policies.error}
            onRetry={() => void policies.refetch()}
            isEmpty
            emptyIcon="timer-outline"
            emptyTitle={filtered ? 'No policies match' : 'No SLA policies'}
            emptyDescription={
              filtered
                ? 'Try another search or scope.'
                : 'Tickets have no response or resolution targets until a default policy exists.'
            }
          >
            {null}
          </QueryState>
        }
        renderItem={({ item }) => (
          <SlaPolicyCard
            policy={item}
            onEdit={() => setEditing(item)}
            onDelete={() => setDeleting(item)}
          />
        )}
      />
      <StickyActionBar>
        <Button
          label="New policy"
          icon="add"
          onPress={() => setEditing('new')}
          style={{ flex: 1 }}
        />
      </StickyActionBar>

      {editing ? (
        <SlaPolicySheet
          policy={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setFeedback({ tone: 'success', message: reapplyMessage(saved) });
          }}
        />
      ) : null}
      {deleting ? (
        <DeletePolicySheet
          policy={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setFeedback({ tone: 'success', message: `“${deleting.name}” deleted.` });
          }}
        />
      ) : null}
    </Screen>
  );
}

function DeletePolicySheet({
  policy,
  onClose,
  onDeleted,
}: {
  policy: SlaPolicySummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteSlaPolicy(policy.id, onDeleted);
  return (
    <ConfirmSheet
      title="Delete this policy?"
      message={`“${policy.name}” will be removed and its ${policy.ticketCount} open tickets fall back to the next matching policy (or no SLA).`}
      confirmLabel="Delete"
      cancelLabel="Keep it"
      busy={remove.busy}
      error={remove.error}
      onConfirm={() => void remove.run()}
      onClose={onClose}
    />
  );
}
