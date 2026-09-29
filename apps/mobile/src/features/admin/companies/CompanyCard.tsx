import type { OrganizationSummary } from '@ashniva/types';

import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { companyTone, countsLine, organizationTypeLabel } from './company-display';

export function CompanyCard({
  organization,
  onPress,
}: {
  organization: OrganizationSummary;
  onPress: () => void;
}) {
  return (
    <PressableCard
      accessibilityLabel={organization.name}
      accessibilityHint="Opens the company"
      onPress={onPress}
      icon="business"
      iconTone={companyTone(organization)}
    >
      <AppText weight="medium" numberOfLines={2}>
        {organization.name}
      </AppText>
      <PillRow>
        <Pill label={organizationTypeLabel(organization.type)} />
        {organization.isServiceProvider ? <Pill label="Service provider" tone="info" /> : null}
        {organization.openTicketCount > 0 ? (
          <Pill label={`${organization.openTicketCount} open tickets`} tone="warning" />
        ) : null}
      </PillRow>
      <MetaLine icon="people-outline">{countsLine(organization)}</MetaLine>
    </PressableCard>
  );
}
