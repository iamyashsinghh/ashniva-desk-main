import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { UserCard } from '../users/UserCard';
import { useUsers } from '../users/users-api';

const PREVIEW = 5;

/**
 * The company's people — its contacts and client users — with the way to add one.
 *
 * A preview rather than the whole list: a client can have hundreds of users, and the full list
 * with its search and filters is one tap away on the people screen scoped to this company.
 */
export function CompanyPeopleSection({
  organizationId,
  scope,
  onOpenUser,
  onInvite,
  onOpenAll,
}: {
  organizationId: string;
  /** Undefined for the signed-in person's own company. */
  scope: string | undefined;
  onOpenUser: (userId: string) => void;
  onInvite: (organizationId: string) => void;
  onOpenAll: (organizationId: string) => void;
}) {
  const theme = useTheme();
  const users = useUsers(scope);
  const people = users.data ?? [];

  let body = (
    <AppText size="sm" tone="muted">
      Loading people…
    </AppText>
  );
  if (users.error) {
    body = (
      <Banner tone="danger" role="alert">
        {errorMessage(users.error)}
      </Banner>
    );
  } else if (users.data && people.length === 0) {
    body = (
      <AppText size="sm" tone="muted">
        Nobody in this company yet.
      </AppText>
    );
  } else if (users.data) {
    body = (
      <View style={{ gap: theme.spacing.sm }}>
        {people.slice(0, PREVIEW).map((user) => (
          <UserCard key={user.id} user={user} onPress={() => onOpenUser(user.id)} />
        ))}
      </View>
    );
  }

  return (
    <Section title="People" icon="people-outline" {...(users.data ? { count: people.length } : {})}>
      {body}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <View style={{ flexGrow: 1 }}>
          <Button
            label="Add person"
            icon="person-add-outline"
            variant="secondary"
            size="sm"
            onPress={() => onInvite(organizationId)}
          />
        </View>
        {people.length > 0 ? (
          <View style={{ flexGrow: 1 }}>
            <Button
              label={people.length > PREVIEW ? `See all ${people.length}` : 'Manage people'}
              icon="list-outline"
              variant="ghost"
              size="sm"
              onPress={() => onOpenAll(organizationId)}
            />
          </View>
        ) : null}
      </View>
    </Section>
  );
}
