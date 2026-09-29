import type { OrganizationOption } from '@ashniva/types';
import { useMemo } from 'react';

import { SelectField } from '../../../shared/components/SelectField';
import type { SelectOption } from '../../../shared/components/SelectSheet';
import { useSession } from '../../auth/SessionProvider';
import { useOrganizationOptions } from './admin-api';

/**
 * Which company's people or roles a list shows — the provider's own, or a client's.
 *
 * Only the service provider's staff administer more than one company, so for a client this draws
 * nothing and asks for nothing. The target company's kind comes back with it, because which roles
 * may be assigned depends on it (a client company cannot hold Developer, the provider cannot hold
 * Client Admin).
 */
export function useCompanyScope(organizationId: string, enabled = true) {
  const { user } = useSession();
  const isProvider = user?.organization.isServiceProvider ?? false;
  const options = useOrganizationOptions(isProvider && enabled);
  const target = options.data?.find((organization) => organization.id === organizationId);
  return {
    isProvider,
    options: options.data ?? [],
    loading: options.isLoading,
    isOwn: organizationId === user?.organization.id,
    targetIsServiceProvider:
      target?.isServiceProvider ?? user?.organization.isServiceProvider ?? false,
    targetName: target?.name ?? user?.organization.name ?? '',
  };
}

export function OrganizationSwitcher({
  value,
  onChange,
  organizations,
  loading,
}: {
  value: string;
  onChange: (organizationId: string) => void;
  organizations: readonly OrganizationOption[];
  loading: boolean;
}) {
  const options = useMemo<SelectOption[]>(
    () =>
      organizations.map((organization) => ({
        value: organization.id,
        label: organization.name,
        description: organization.isServiceProvider ? 'Your company' : 'Client',
        icon: 'business-outline',
        iconTone: organization.isServiceProvider ? 'primary' : 'teal',
      })),
    [organizations],
  );
  return (
    <SelectField
      label="Company"
      icon="business-outline"
      options={options}
      value={[value]}
      onChange={(ids) => (ids[0] ? onChange(ids[0]) : undefined)}
      loading={loading}
    />
  );
}
