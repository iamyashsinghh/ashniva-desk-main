import { PERMISSIONS, type OrganizationSummary } from '@ashniva/types';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { useResource } from '../../../shared/api/queries';
import { KeyValueRow, ListRow, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Hero, Section, StickyActionBar } from '../../../shared/components/layout';
import { Button, Pill, PillRow, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { scopeOf } from '../shared/admin-api';
import { DetailPending, NotAllowed } from '../shared/AdminStates';
import { CompanyFormSheet } from './CompanyFormSheet';
import { CompanyPeopleSection } from './CompanyPeopleSection';
import { companyKey, companyTone, organizationTypeLabel } from './company-display';

/**
 * One company: its counts, its settings, its people and — for a client — its own custom roles.
 *
 * The web edits a company from a dialog on the list; the phone gives it a screen, because this is
 * also where a client's users are reached, which the web does through the company switcher on
 * Users & teams.
 */
export function CompanyDetailScreen({
  organizationId,
  onOpenUser,
  onInvite,
  onOpenPeople,
  onOpenRoles,
}: {
  organizationId: string;
  onOpenUser: (userId: string, organizationId: string | undefined) => void;
  onInvite: (organizationId: string) => void;
  onOpenPeople: (organizationId: string) => void;
  onOpenRoles: (organizationId: string) => void;
}) {
  const theme = useTheme();
  const { user, can } = useSession();
  const allowed = can(PERMISSIONS.ORGANIZATION_MANAGE);
  const [editing, setEditing] = useState(false);
  const query = useResource<OrganizationSummary>(
    companyKey(organizationId),
    `/organizations/${organizationId}`,
    { enabled: allowed },
  );

  if (!allowed) {
    return <NotAllowed message="Companies are managed by the service provider’s administrators." />;
  }
  const company = query.data;
  if (!company) {
    return (
      <DetailPending
        error={query.error}
        onRetry={() => void query.refetch()}
        label="Loading the company"
      />
    );
  }

  const scope = scopeOf(company.id, user?.organization.id);
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
        <Hero
          overline={organizationTypeLabel(company.type)}
          title={company.name}
          icon="business"
          iconTone={companyTone(company)}
        >
          <PillRow>
            {company.isServiceProvider ? <Pill label="Service provider" tone="info" /> : null}
            <Pill label={company.currency} />
            <Pill label={company.timezone} />
          </PillRow>
        </Hero>
        <TileGrid>
          <StatTile label="People" value={company.userCount} icon="people-outline" />
          <StatTile label="Projects" value={company.projectCount} icon="folder-open-outline" />
          <StatTile
            label="Open tickets"
            value={company.openTicketCount}
            icon="alert-circle-outline"
            tone={company.openTicketCount > 0 ? 'warning' : 'default'}
          />
        </TileGrid>
        <Section title="Details" icon="information-circle-outline">
          <KeyValueRow label="Type" value={organizationTypeLabel(company.type)} />
          <KeyValueRow label="Short name" value={company.slug} />
          <KeyValueRow label="Timezone" value={company.timezone} />
          <KeyValueRow label="Currency" value={company.currency} />
          <KeyValueRow label="Added" value={formatDate(company.createdAt) ?? '—'} />
        </Section>
        {can(PERMISSIONS.USER_MANAGE) ? (
          <CompanyPeopleSection
            organizationId={company.id}
            scope={scope}
            onOpenUser={(userId) => onOpenUser(userId, scope)}
            onInvite={onInvite}
            onOpenAll={onOpenPeople}
          />
        ) : null}
        {can(PERMISSIONS.ROLE_MANAGE) ? (
          <Section>
            <ListRow
              title="Roles & permissions"
              subtitle={
                company.isServiceProvider
                  ? 'Custom roles of your company'
                  : 'Custom roles for this client’s people'
              }
              icon="shield-checkmark-outline"
              onPress={() => onOpenRoles(company.id)}
            />
          </Section>
        ) : null}
      </ScrollView>
      <StickyActionBar>
        <Button
          label="Edit company"
          icon="create-outline"
          onPress={() => setEditing(true)}
          style={{ flex: 1 }}
        />
      </StickyActionBar>
      {editing ? (
        <CompanyFormSheet
          organization={company}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : null}
    </Screen>
  );
}
