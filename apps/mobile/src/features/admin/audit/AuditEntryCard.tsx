import type { AuditLogEntrySummary } from '@ashniva/types';

import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { entityTypeLabel, summarize } from './audit-display';

/** One audit entry: what happened, to what kind of thing, by whom and when. */
export function AuditEntryCard({
  entry,
  onPress,
}: {
  entry: AuditLogEntrySummary;
  onPress: () => void;
}) {
  const who = entry.actor?.name ?? 'System';
  const when = formatDateTime(entry.createdAt) ?? '';
  const summary = summarize(entry);
  return (
    <PressableCard
      accessibilityLabel={`${entry.action} by ${who}, ${when}`}
      accessibilityHint="Shows the whole entry"
      onPress={onPress}
      icon={entry.actor ? 'person-outline' : 'cog-outline'}
      iconTone={entry.actor ? 'info' : 'neutral'}
    >
      <AppText weight="medium" numberOfLines={1}>
        {entry.action}
      </AppText>
      <PillRow>
        <Pill label={entityTypeLabel(entry.entityType)} />
      </PillRow>
      <MetaLine icon="person-outline">{`${who} · ${when}`}</MetaLine>
      {summary ? (
        <AppText size="xs" tone="muted" numberOfLines={2}>
          {summary}
        </AppText>
      ) : null}
    </PressableCard>
  );
}
