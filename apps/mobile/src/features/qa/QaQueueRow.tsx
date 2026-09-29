import type { TestingAssignmentSummary } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { Icon } from '../../shared/components/Icon';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate, formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { assignmentStatusLabel, assignmentStatusTone } from './qa-display';
import { ASSIGNMENT_KIND_LABELS, ENVIRONMENT_LABELS } from './qa-labels';

/** One assignment in the queue: the web table's columns — what, kind, where, due, updated. */
export function QaQueueRow({
  item,
  onOpen,
}: {
  item: TestingAssignmentSummary;
  onOpen: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableCard
      accessibilityLabel={item.subjectLabel}
      accessibilityHint="Opens the assignment"
      onPress={onOpen}
      icon="flask"
      iconTone={item.isOverdue ? 'danger' : 'violet'}
      highlight={item.isOverdue}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
        <Icon name="folder-outline" size={12} color={theme.colors.textFaint} />
        <AppText size="xs" tone="faint" numberOfLines={1} style={{ flexShrink: 1 }}>
          {item.projectName} · {ASSIGNMENT_KIND_LABELS[item.kind]} ·{' '}
          {ENVIRONMENT_LABELS[item.environment]}
        </AppText>
      </View>
      <AppText weight="medium" numberOfLines={2}>
        {item.subjectLabel}
      </AppText>
      <PillRow>
        <Pill label={assignmentStatusLabel(item.status)} tone={assignmentStatusTone(item.status)} />
        {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
      </PillRow>
      <MetaLine icon="person-outline">
        {item.assignedToName ?? 'Unassigned — anyone in QA can pick this up'}
      </MetaLine>
      {item.dueAt ? (
        // Overdue is decided on the server against its own clock, not by the phone's.
        <MetaLine icon="alarm-outline" danger={item.isOverdue}>
          Due {formatDate(item.dueAt)}
        </MetaLine>
      ) : null}
      <MetaLine icon="time-outline">Updated {formatSince(item.updatedAt) ?? ''}</MetaLine>
    </PressableCard>
  );
}
