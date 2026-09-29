import { USER_STATUS, type UserSummary } from '@ashniva/types';
import { useState } from 'react';

import { ListRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { useAdminMutation, type ReauthHeaders } from '../shared/admin-api';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { InvitationLink } from '../shared/InvitationLink';
import { ReauthSheet } from '../shared/ReauthSheet';
import { canResendInvitation } from './user-display';
import { USER_WRITES } from './users-api';

type Invitation = { link: string; expiresAt: string };
type Pending = 'invite' | 'suspend' | 'delete' | null;

/**
 * The actions that change whether somebody can get in: a fresh invitation link, suspending or
 * reactivating, and removing them from the company.
 *
 * Suspending and removing each ask first and say what follows. Reactivating does not — it gives
 * access back and is undone by suspending again. A new invitation link is a credential for the
 * account, so it asks for the password, and the link appears in the same sheet.
 */
export function UserAccountActions({
  person,
  organizationId,
  isSelf,
  onDeleted,
}: {
  person: UserSummary;
  organizationId: string | undefined;
  isSelf: boolean;
  onDeleted: () => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const query = () => (organizationId ? { organizationId } : {});
  const active = person.status === USER_STATUS.ACTIVE;

  const invite = useAdminMutation<ReauthHeaders, Invitation>({
    path: () => `/users/${person.id}/invitations`,
    query,
    headers: (headers) => headers,
    onSuccess: (result) => setInvitation(result),
  });
  const setStatus = useAdminMutation<boolean, UserSummary>({
    path: (activate) => `/users/${person.id}/${activate ? 'activate' : 'deactivate'}`,
    query,
    invalidate: USER_WRITES,
    onSuccess: () => setPending(null),
  });
  const remove = useAdminMutation<void, void>({
    path: () => `/users/${person.id}`,
    method: 'DELETE',
    query,
    // Not the person's own entry: refetching it would only fetch a 404 on the way out.
    invalidate: [['users', 'list'], ['teams'], ['organizations']],
    onSuccess: () => {
      setPending(null);
      onDeleted();
    },
  });

  const close = () => {
    setPending(null);
    setInvitation(null);
    invite.reset();
    setStatus.reset();
    remove.reset();
  };

  if (isSelf) {
    return null;
  }
  return (
    <Section title="Account" icon="key-outline">
      {canResendInvitation(person) ? (
        <ListRow
          title="New invitation link"
          subtitle="They have not signed in yet. The link lets them choose a password."
          icon="mail-outline"
          onPress={() => setPending('invite')}
        />
      ) : null}
      {active ? (
        <ListRow
          title="Deactivate"
          subtitle="Signs them out everywhere and stops them signing in."
          icon="pause-circle-outline"
          iconTone="warning"
          onPress={() => setPending('suspend')}
        />
      ) : (
        <ListRow
          title="Reactivate"
          subtitle="Lets them sign in again with their existing password."
          icon="play-circle-outline"
          iconTone="success"
          onPress={() => void setStatus.run(true)}
        />
      )}
      <ListRow
        title="Delete"
        subtitle="Removes them from this company for good."
        icon="trash-outline"
        destructive
        onPress={() => setPending('delete')}
      />
      {setStatus.error && pending === null ? (
        <Banner tone="danger" role="alert">
          {setStatus.error}
        </Banner>
      ) : null}
      <ReauthSheet
        visible={pending === 'invite'}
        title={`Invitation for ${person.name}`}
        subtitle={person.email}
        confirmLabel="Create link"
        confirmIcon="link-outline"
        busy={invite.busy}
        error={invite.error}
        onClose={close}
        onConfirm={(headers) => invite.run(headers)}
        {...(invitation
          ? { done: <InvitationLink name={person.name} invitation={invitation} /> }
          : {})}
      />
      <ConfirmSheet
        visible={pending === 'suspend'}
        title={`Deactivate ${person.name}?`}
        message="They are signed out on every device straight away and cannot sign in until somebody reactivates them. Their work and history stay."
        confirmLabel="Deactivate"
        confirmIcon="pause-circle-outline"
        busy={setStatus.busy}
        error={setStatus.error}
        onClose={close}
        onConfirm={() => void setStatus.run(false)}
      />
      <ConfirmSheet
        visible={pending === 'delete'}
        title={`Delete ${person.name}?`}
        message="They disappear from this company and will not be able to sign in. This cannot be undone."
        confirmLabel="Delete"
        confirmIcon="trash-outline"
        busy={remove.busy}
        error={remove.error}
        onClose={close}
        onConfirm={() => void remove.run()}
      />
    </Section>
  );
}
