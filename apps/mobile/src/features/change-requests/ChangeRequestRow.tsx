import type { ChangeRequestSummary } from '@ashniva/types';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatMinutes, formatSince } from '../../shared/format/format';
import { changeRequestStatusLabel, changeRequestTone, formatCost } from './change-request-display';

/** One change request in a list: the web table's columns, stacked for one hand. */
export function ChangeRequestRow({
  item,
  onOpen,
}: {
  item: ChangeRequestSummary;
  onOpen: () => void;
}) {
  const estimate = item.estimatedMinutes !== null ? formatMinutes(item.estimatedMinutes) : null;
  const cost = item.costImpact !== null ? formatCost(item.costImpact, item.currency) : null;
  return (
    <PressableCard
      onPress={onOpen}
      icon="git-pull-request-outline"
      iconTone="violet"
      accessibilityLabel={`${item.number} ${item.title}, ${changeRequestStatusLabel(item.status)}, ${
        item.clientOrganization.name
      }`}
    >
      <AppText size="xs" tone="faint" tabular>
        {item.number}
        {item.updatedAt ? ` · updated ${formatSince(item.updatedAt)}` : ''}
      </AppText>
      <AppText weight="medium" numberOfLines={2}>
        {item.title}
      </AppText>
      <MetaLine icon="business-outline">
        {item.clientOrganization.name}
        {item.project ? ` · ${item.project.name}` : ''}
      </MetaLine>
      {estimate || cost ? (
        <MetaLine icon="calculator-outline">
          {[estimate ? `Effort ${estimate}` : null, cost ? `Cost ${cost}` : null]
            .filter(Boolean)
            .join(' · ')}
        </MetaLine>
      ) : null}
      <PillRow>
        <Pill label={changeRequestStatusLabel(item.status)} tone={changeRequestTone(item.status)} />
      </PillRow>
    </PressableCard>
  );
}
