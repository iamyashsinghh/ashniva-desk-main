import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { KeyValueRow } from '../../../shared/components/data-display';
import { Grow, Hero, Section, StickyActionBar } from '../../../shared/components/layout';
import { PersonAvatar } from '../../../shared/components/PersonAvatar';
import { AppText, Button, Pill, PillRow, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { formatDate, formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { DetailPending, NotAllowed } from '../shared/AdminStates';
import { useCompanyScope } from '../shared/OrganizationSwitcher';
import { ChangeRoleSheet } from './ChangeRoleSheet';
import { EditUserSheet } from './EditUserSheet';
import { UserAccountActions } from './UserAccountActions';
import { roleLabel, teamsLine, userStatusLabel, userStatusTone } from './user-display';
import { useUser } from './users-api';

/**
 * One person in one company: their profile, their role, and what can be done to their account.
 *
 * Everything the web's row of buttons offers is here — edit, change role, invitation link,
 * deactivate or reactivate, delete — with the profile and role actions in the bar at the bottom
 * and the account actions, the ones that lock somebody out, in their own section with a
 * confirmation each. Nobody is offered a change to their own role or account, as on the web.
 */
export function UserDetailScreen({
  userId,
  organizationId,
  onDeleted,
}: {
  userId: string;
  /** The company, when it is not the signed-in person's own. */
  organizationId?: string;
  onDeleted: () => void;
}) {
  const theme = useTheme();
  const { user: me, can } = useSession();
  const allowed = can(PERMISSIONS.USER_MANAGE);
  const [sheet, setSheet] = useState<'edit' | 'role' | null>(null);
  const query = useUser(userId, organizationId, allowed);
  const company = useCompanyScope(organizationId ?? me?.organization.id ?? '', allowed);

  if (!allowed) {
    return <NotAllowed message="Managing people needs the user management permission." />;
  }
  const person = query.data;
  if (!person) {
    return (
      <DetailPending
        error={query.error}
        onRetry={() => void query.refetch()}
        label="Loading the person"
      />
    );
  }

  const isSelf = person.id === me?.id;
  const teams = teamsLine(person);
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={query.isRefetching} onRefresh={() => query.refetch()} />}
      >
        <Hero overline={person.organization.name} title={person.name}>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
            <PersonAvatar person={person} size={48} />
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <AppText size="sm" tone="muted" numberOfLines={1}>
                {person.email}
              </AppText>
              <PillRow>
                <Pill label={userStatusLabel(person.status)} tone={userStatusTone(person.status)} />
                <Pill
                  label={roleLabel(person)}
                  tone={person.isCustomRole ? 'progress' : 'neutral'}
                />
                {isSelf ? <Pill label="You" tone="info" /> : null}
              </PillRow>
            </View>
          </View>
        </Hero>
        <Section title="Profile" icon="person-outline">
          <KeyValueRow label="Title" value={person.title ?? '—'} />
          <KeyValueRow label="Phone" value={person.phone ?? '—'} />
          <KeyValueRow
            label="Role"
            value={person.isCustomRole ? `${roleLabel(person)} (custom)` : roleLabel(person)}
          />
          <KeyValueRow label="Teams" value={teams ?? '—'} />
          {person.roleKey === ROLE_KEYS.TEAM_LEAD ? (
            <KeyValueRow
              label="Development section"
              value={person.showDevelopmentSection ? 'Shown' : 'Hidden'}
            />
          ) : null}
        </Section>
        <Section title="Activity" icon="time-outline">
          <KeyValueRow
            label="Last sign-in"
            value={person.lastLoginAt ? (formatDateTime(person.lastLoginAt) ?? '—') : 'Never'}
          />
          <KeyValueRow label="Added" value={formatDate(person.createdAt) ?? '—'} />
        </Section>
        <UserAccountActions
          person={person}
          organizationId={organizationId}
          isSelf={isSelf}
          onDeleted={onDeleted}
        />
      </ScrollView>
      <StickyActionBar
        note={
          isSelf ? (
            <AppText size="xs" tone="muted">
              This is you: your own role and account cannot be changed from here.
            </AppText>
          ) : undefined
        }
      >
        <Grow>
          <Button
            label="Edit"
            icon="create-outline"
            variant="secondary"
            onPress={() => setSheet('edit')}
          />
        </Grow>
        <Grow>
          <Button
            label="Change role"
            icon="shield-outline"
            disabled={isSelf}
            onPress={() => setSheet('role')}
          />
        </Grow>
      </StickyActionBar>
      {sheet === 'edit' ? (
        <EditUserSheet
          person={person}
          organizationId={organizationId}
          showTeams={company.isProvider && company.isOwn}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'role' ? (
        <ChangeRoleSheet
          person={person}
          organizationId={organizationId}
          targetIsServiceProvider={company.targetIsServiceProvider}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Screen>
  );
}
