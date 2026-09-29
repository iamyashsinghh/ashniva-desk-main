import { TASK_STATUS_LABELS, type TaskHistoryEntry } from '@ashniva/types';
import { View } from 'react-native';

import { Expandable } from '../../shared/components/Expandable';
import { IconTile } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { taskTone } from './task-display';

/** Pill tones mapped onto icon tiles, so an activity row carries its status colour. */
const TILE_TONE = {
  neutral: 'neutral',
  info: 'info',
  progress: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
} as const;

/** The task's activity: every status change, who made it and why. Folded away by default. */
export function TaskHistory({ history }: { history: readonly TaskHistoryEntry[] }) {
  const theme = useTheme();
  if (history.length === 0) {
    return null;
  }
  return (
    <Section
      title="Activity"
      count={history.length}
      icon="git-commit-outline"
      collapsible
      initiallyOpen={false}
    >
      <Expandable items={history} initial={10} noun="changes">
        {(entry) => (
          <View key={entry.id} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <IconTile
              name="swap-horizontal-outline"
              tone={TILE_TONE[taskTone(entry.toStatus)]}
              size={32}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" weight="medium">
                {entry.fromStatus ? `${TASK_STATUS_LABELS[entry.fromStatus]} → ` : ''}
                {TASK_STATUS_LABELS[entry.toStatus]}
              </AppText>
              <AppText size="xs" tone="faint">
                {formatDateTime(entry.createdAt)} · {entry.changedBy.name}
              </AppText>
              {entry.note ? (
                <AppText size="xs" tone="muted">
                  {entry.note}
                </AppText>
              ) : null}
            </View>
          </View>
        )}
      </Expandable>
    </Section>
  );
}
