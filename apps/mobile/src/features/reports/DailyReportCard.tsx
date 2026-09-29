import { TASK_STATUS_LABELS, type DailyReportItem, type DailyReportResponse } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { StatTile, TileGrid } from '../../shared/components/data-display';
import { Glyph } from '../../shared/components/glyph';
import { IconTile } from '../../shared/components/Icon';
import { AppText, Card, Divider, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate, formatMinutes } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { taskStatusTone } from '../projects/project-display';

/**
 * One person's day, as the report generated it from their work logs and completions.
 *
 * `compact` is the history view: fourteen days of the four headline figures would bury the work
 * itself, so there only the tasks are listed under the day's total.
 */
export function DailyReportCard({
  report,
  compact = false,
  onOpenTask,
}: {
  report: DailyReportResponse;
  compact?: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const theme = useTheme();
  const { snapshot } = report;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <IconTile name="person-outline" tone="info" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="bold" numberOfLines={1}>
            {report.userName}
          </AppText>
          <AppText size="xs" tone="muted">
            {formatDate(report.reportDate) ?? report.reportDate}
          </AppText>
        </View>
        <View
          style={{
            backgroundColor: theme.colors.primarySoft,
            borderRadius: theme.radius.pill,
            paddingHorizontal: theme.spacing.sm + 2,
            paddingVertical: 2,
          }}
        >
          <AppText weight="bold" tone="primary" tabular>
            {formatMinutes(snapshot.minutesLogged)}
          </AppText>
        </View>
      </View>

      {!compact ? (
        <TileGrid>
          <StatTile label="Worked on" value={snapshot.tasksWorkedOn} icon="construct-outline" />
          <StatTile
            label="Submitted"
            value={snapshot.tasksSubmitted}
            icon="send-outline"
            iconTone="warning"
          />
          <StatTile
            label="Completed"
            value={snapshot.tasksCompleted}
            icon="checkmark-done-outline"
            iconTone="success"
          />
          <StatTile
            label="Time spent"
            value={formatMinutes(snapshot.minutesLogged)}
            icon="time-outline"
            iconTone="teal"
          />
        </TileGrid>
      ) : null}

      {snapshot.items.length === 0 ? (
        <AppText size="sm" tone="muted">
          No activity that day.
        </AppText>
      ) : (
        <View>
          {snapshot.items.map((item) => (
            <View key={item.taskId}>
              <Divider />
              <ReportItemRow item={item} onPress={() => onOpenTask(item.taskId)} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function ReportItemRow({ item, onPress }: { item: DailyReportItem; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.taskKey} ${item.title}, ${formatMinutes(item.minutes)}`}
      accessibilityHint="Opens the task"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
        opacity: pressed ? 0.6 : 1,
        paddingVertical: theme.spacing.sm,
      })}
    >
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <AppText size="xs" tone="faint" numberOfLines={1}>
          {item.taskKey} · {item.projectName} · {formatMinutes(item.minutes)}
        </AppText>
        <AppText size="sm" weight="medium" numberOfLines={2}>
          {item.title}
        </AppText>
        <PillRow>
          <Pill
            label={TASK_STATUS_LABELS[item.status] ?? item.status}
            tone={taskStatusTone(item.status)}
          />
          {item.completedToday ? <Pill label="Completed" tone="success" /> : null}
          {item.submittedForReviewToday ? <Pill label="Submitted" tone="warning" /> : null}
          {item.clientVisible ? <Pill label="Client" tone="info" /> : null}
        </PillRow>
        {item.summaries.length > 0 ? (
          <AppText size="sm" tone="muted" numberOfLines={4}>
            {item.summaries.join(' · ')}
          </AppText>
        ) : null}
      </View>
      <Glyph name="chevron-right" color={theme.colors.textFaint} size={12} />
    </Pressable>
  );
}
