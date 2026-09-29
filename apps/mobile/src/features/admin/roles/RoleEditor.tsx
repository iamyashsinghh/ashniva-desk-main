import type { CustomRoleDetail, PermissionCatalogEntry, PermissionKey } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';

import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { Banner } from '../../../shared/components/feedback';
import { Hero } from '../../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { EmptyState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { PermissionGroupCard } from './PermissionGroupCard';
import { RoleActionBar } from './RoleActionBar';
import { RoleHistory } from './RoleHistory';
import {
  groupPermissions,
  isClientAudience,
  permissionChanges,
  roleOverline,
  toggled,
} from './role-permissions';

/**
 * The permission matrix on a phone: one switch per permission, grouped by area, with a search
 * across all of them and the save pinned to the bottom with a count of what has changed.
 *
 * Switches edit a draft; nothing is sent until "Save", which confirms the whole set with the
 * password in one request — a role half-saved because the tenth toggle failed would be worse than
 * one not saved at all. A system role shows the same matrix with every switch locked.
 */
export function RoleEditor({
  role,
  catalog,
  refreshing,
  onRefresh,
  onDeleted,
}: {
  role: CustomRoleDetail;
  catalog: readonly PermissionCatalogEntry[];
  refreshing: boolean;
  onRefresh: () => unknown;
  onDeleted: () => void;
}) {
  const theme = useTheme();
  const editable = !role.isSystem;
  const clientOnly = isClientAudience(role);
  const [draft, setDraft] = useState<Set<PermissionKey>>(() => new Set(role.permissions));
  const [search, setSearch] = useState('');
  const groups = useMemo(
    () => groupPermissions(catalog, clientOnly, search),
    [catalog, clientOnly, search],
  );
  const available = useMemo(
    () => catalog.filter((entry) => !clientOnly || entry.clientAllowed).length,
    [catalog, clientOnly],
  );
  const changes = permissionChanges(role.permissions, draft);
  const searching = search.trim().length > 0;
  const people = role.memberCount === 1 ? '1 person' : `${role.memberCount} people`;

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={refreshing} onRefresh={onRefresh} />}
      >
        <Hero
          overline={roleOverline(role)}
          title={role.name}
          icon={role.isSystem ? 'shield-outline' : 'shield-checkmark'}
          iconTone={role.isSystem ? 'neutral' : 'violet'}
        >
          <PillRow>
            <Pill
              label={role.isSystem ? 'System' : 'Custom'}
              tone={role.isSystem ? 'info' : 'neutral'}
            />
            {clientOnly ? <Pill label="Client" tone="warning" /> : null}
            <Pill label={people} />
          </PillRow>
          {role.description ? <AppText tone="muted">{role.description}</AppText> : null}
        </Hero>
        {role.isSystem ? (
          <Banner tone="info" title="System roles are fixed">
            Start a custom role from this one to give somebody a narrower set of permissions.
          </Banner>
        ) : null}
        {clientOnly && editable ? (
          <AppText size="sm" tone="muted">
            A client role may only hold permissions that are safe to give a client, so only those
            are listed.
          </AppText>
        ) : null}
        <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search permissions" />
        <AppText size="sm" tone="muted" tabular>
          {`${draft.size} of ${available} permissions on`}
        </AppText>
        {groups.length === 0 ? (
          <EmptyState
            title="No permission matches"
            description={`Nothing matches “${search.trim()}”.`}
            icon="search"
          />
        ) : null}
        {groups.map((group) => (
          <PermissionGroupCard
            key={`${group.module}-${searching ? 'search' : 'all'}`}
            group={group}
            granted={draft}
            editable={editable}
            initiallyOpen={searching}
            onToggle={(key, on) => setDraft((current) => toggled(current, key, on))}
          />
        ))}
        {editable ? <RoleHistory roleId={role.id} /> : null}
      </ScrollView>
      {editable ? (
        <RoleActionBar
          role={role}
          draft={draft}
          added={changes.added.length}
          removed={changes.removed.length}
          onDiscard={() => setDraft(new Set(role.permissions))}
          onDeleted={onDeleted}
        />
      ) : null}
    </Screen>
  );
}
