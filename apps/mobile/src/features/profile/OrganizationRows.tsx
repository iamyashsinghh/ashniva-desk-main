import type { SessionUser } from '@ashniva/types';
import { useState } from 'react';

import { errorMessage } from '../../shared/api/client';
import { ListRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Divider } from '../../shared/components/primitives';
import { SelectSheet, type SelectOption } from '../../shared/components/SelectSheet';
import { useSession } from '../auth/SessionProvider';

/**
 * The organization you are signed in to, and — only when you belong to more than one — the way to
 * move to another.
 *
 * Switching opens a new session in the other organization and throws away everything cached from
 * this one (see `SessionProvider.switchOrganization`), so every screen reloads with the new
 * organization's data rather than briefly showing the old one's.
 */
export function OrganizationRows({ user }: { user: SessionUser }) {
  const { switchOrganization } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSwitch = user.organizations.length > 1;

  const options: SelectOption[] = user.organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
    icon: 'business-outline',
    iconTone: organization.id === user.organization.id ? 'primary' : 'neutral',
    ...(organization.id === user.organization.id ? { description: 'Signed in now' } : {}),
  }));

  const choose = async (organizationId: string | undefined) => {
    if (!organizationId || organizationId === user.organization.id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await switchOrganization(organizationId);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListRow
        icon="business-outline"
        iconTone="info"
        title={user.organization.name}
        subtitle="Organization"
      />
      {canSwitch ? (
        <>
          <Divider inset={48} />
          <ListRow
            icon="swap-horizontal-outline"
            iconTone="teal"
            title={busy ? 'Switching…' : 'Switch organization'}
            subtitle={`You belong to ${user.organizations.length} organizations`}
            accessibilityHint="Choose another organization to work in"
            {...(busy ? {} : { onPress: () => setOpen(true) })}
          />
          <SelectSheet
            visible={open}
            title="Switch organization"
            options={options}
            selected={[user.organization.id]}
            onClose={() => setOpen(false)}
            onSelect={(values) => void choose(values[0])}
          />
        </>
      ) : null}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </>
  );
}
