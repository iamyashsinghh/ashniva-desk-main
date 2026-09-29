import { PROBLEM_STATUS_LABELS, type RecurringGroupRow } from '@ashniva/types';
import { View } from 'react-native';

import { ListRow, ProgressBar } from '../../../shared/components/data-display';
import { AppText, Button, Card, Pill, PillRow } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { problemTone } from '../problem-display';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One group on the recurring report. The bar is scaled against the busiest row, as on the web —
 * the question is "which of these is worst", and an absolute scale would make every row on a
 * quiet product look empty.
 */
export function RecurringRow({
  row,
  busiest,
  windowDays,
  onOpenProblem,
  onPromote,
}: {
  row: RecurringGroupRow;
  busiest: number;
  windowDays: number;
  onOpenProblem: (problemId: string) => void;
  /** Present only for somebody who may open a problem. */
  onPromote?: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <AppText variant="heading" numberOfLines={2}>
        {row.label}
      </AppText>
      <PillRow>
        <Pill
          label={plural(row.clientCount, 'client', 'clients')}
          tone={row.overThreshold ? 'danger' : 'neutral'}
        />
        <Pill label={plural(row.ticketCount, 'ticket', 'tickets')} tone="neutral" />
        {row.overThreshold ? <Pill label="Over threshold" tone="danger" /> : null}
      </PillRow>
      <ProgressBar
        percent={(row.ticketCount / busiest) * 100}
        tone={row.overThreshold ? 'danger' : 'primary'}
        label={`${row.ticketCount} in the last ${windowDays} days`}
      />
      {row.problems.length === 0 ? (
        <View style={{ alignItems: 'flex-start', gap: theme.spacing.xs }}>
          <AppText size="sm" tone="muted">
            No problem open for this yet
          </AppText>
          {onPromote ? (
            <Button
              label="Open a problem"
              icon="bug-outline"
              size="sm"
              variant="secondary"
              onPress={onPromote}
            />
          ) : null}
        </View>
      ) : (
        row.problems.map((problem) => (
          <ListRow
            key={problem.id}
            icon="bug-outline"
            iconTone="danger"
            title={problem.key}
            trailing={
              <Pill
                label={PROBLEM_STATUS_LABELS[problem.status]}
                tone={problemTone(problem.status)}
              />
            }
            onPress={() => onOpenProblem(problem.id)}
          />
        ))
      )}
    </Card>
  );
}
