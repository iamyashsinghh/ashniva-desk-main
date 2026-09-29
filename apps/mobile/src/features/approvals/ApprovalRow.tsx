import type { ApprovalSummary } from '@ashniva/types';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import {
  approvalStatusIcon,
  approvalStatusLabel,
  approvalTone,
  lastChangeLine,
  subjectLine,
} from './approval-display';

/** One request in the provider's list: the same columns the web table shows, stacked. */
export function ApprovalRow({ item, onOpen }: { item: ApprovalSummary; onOpen: () => void }) {
  const mark = approvalStatusIcon(item.status);
  return (
    <PressableCard
      accessibilityLabel={item.title}
      accessibilityHint="Opens the approval request"
      icon={mark.icon}
      iconTone={mark.tone}
      onPress={onOpen}
    >
      <AppText size="xs" tone="faint" numberOfLines={1}>
        {item.clientOrganization.name} · {subjectLine(item.subject)}
      </AppText>
      <AppText weight="medium" numberOfLines={2}>
        {item.title}
      </AppText>
      <PillRow>
        <Pill label={approvalStatusLabel(item.status)} tone={approvalTone(item.status)} />
        {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
      </PillRow>
      <MetaLine icon="person-outline">Requested by {item.requestedBy.name}</MetaLine>
      {item.dueDate ? (
        <MetaLine icon="alarm-outline" danger={item.isOverdue}>
          Due {formatDate(item.dueDate)}
        </MetaLine>
      ) : null}
      <MetaLine icon="time-outline">{lastChangeLine(item)}</MetaLine>
    </PressableCard>
  );
}
