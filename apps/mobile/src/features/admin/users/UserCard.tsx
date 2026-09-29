import { USER_STATUS, type UserSummary } from '@ashniva/types';

import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { PersonAvatar } from '../../../shared/components/PersonAvatar';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { lastSignIn, roleLabel, teamsLine, userStatusLabel, userStatusTone } from './user-display';

/** One person: who they are, their role, whether their account works, and when they were last in. */
export function UserCard({ user, onPress }: { user: UserSummary; onPress: () => void }) {
  const teams = teamsLine(user);
  return (
    <PressableCard
      accessibilityLabel={`${user.name}, ${roleLabel(user)}, ${userStatusLabel(user.status)}`}
      accessibilityHint="Opens the person"
      onPress={onPress}
      leading={<PersonAvatar person={user} size={40} />}
    >
      <AppText weight="medium" numberOfLines={1}>
        {user.name}
      </AppText>
      <AppText size="sm" tone="muted" numberOfLines={1}>
        {user.email}
      </AppText>
      <PillRow>
        <Pill label={roleLabel(user)} tone={user.isCustomRole ? 'progress' : 'neutral'} />
        {user.status !== USER_STATUS.ACTIVE ? (
          <Pill label={userStatusLabel(user.status)} tone={userStatusTone(user.status)} />
        ) : null}
      </PillRow>
      {user.title ? <MetaLine icon="briefcase-outline">{user.title}</MetaLine> : null}
      {teams ? <MetaLine icon="people-outline">{teams}</MetaLine> : null}
      <MetaLine icon="time-outline">{lastSignIn(user)}</MetaLine>
    </PressableCard>
  );
}
