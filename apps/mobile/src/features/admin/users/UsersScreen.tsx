import { PERMISSIONS } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Segmented } from '../../../shared/components/navigation-list';
import { Screen } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { scopeOf } from '../shared/admin-api';
import { NotAllowed } from '../shared/AdminStates';
import { OrganizationSwitcher, useCompanyScope } from '../shared/OrganizationSwitcher';
import { PeoplePane } from './PeoplePane';
import { TeamsPane } from './TeamsPane';

type UsersView = 'people' | 'teams';

const VIEWS = [
  { value: 'people', label: 'People', icon: 'person-outline' },
  { value: 'teams', label: 'Teams', icon: 'people-outline' },
] as const;

/**
 * Users & teams: the people of a company, and — for the provider's own company — its teams.
 *
 * The provider's staff switch company here, as on the web; a client administrator sees their own
 * company only. Teams exist only inside the provider's organization (team membership drives "Team
 * tasks"), so the Teams view appears only there.
 */
export function UsersScreen({
  organizationId,
  onOpenUser,
  onInvite,
}: {
  /** The company to start on; the signed-in person's own when absent. */
  organizationId?: string;
  onOpenUser: (userId: string, organizationId: string | undefined) => void;
  onInvite: (organizationId: string | undefined) => void;
}) {
  const theme = useTheme();
  const { user, can } = useSession();
  const ownId = user?.organization.id ?? '';
  // Null means "my own company", resolved on every draw: the session can arrive after the first.
  const [picked, setPicked] = useState<string | null>(organizationId ?? null);
  const company = picked ?? ownId;
  const [view, setView] = useState<UsersView>('people');
  const allowed = can(PERMISSIONS.USER_MANAGE);
  const scope = useCompanyScope(company, allowed);
  const showTeams = scope.isProvider && scope.isOwn;

  if (!allowed) {
    return <NotAllowed message="Managing people needs the user management permission." />;
  }

  const organizationScope = scopeOf(company, ownId);
  const top = (
    <View style={{ gap: theme.spacing.md }}>
      {scope.isProvider ? (
        <OrganizationSwitcher
          value={company}
          onChange={(next) => {
            setPicked(next);
            setView('people');
          }}
          organizations={scope.options}
          loading={scope.loading}
        />
      ) : null}
      {showTeams ? (
        <Segmented label="People or teams" options={VIEWS} value={view} onChange={setView} />
      ) : null}
    </View>
  );

  return (
    <Screen>
      {showTeams && view === 'teams' ? (
        <TeamsPane header={top} />
      ) : (
        <PeoplePane
          key={company}
          header={top}
          scope={organizationScope}
          onOpenUser={(id) => onOpenUser(id, organizationScope)}
          onInvite={() => onInvite(organizationScope)}
        />
      )}
    </Screen>
  );
}
