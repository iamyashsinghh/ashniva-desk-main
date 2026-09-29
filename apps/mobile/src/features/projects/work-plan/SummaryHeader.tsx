import type { ProjectWorkPlan } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine, ProgressBar, StatTile, TileGrid } from '../../../shared/components/data-display';
import { Hero } from '../../../shared/components/layout';
import { AppText } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { planProgress } from './plan-helpers';

/**
 * The top of Summary: whose plan, how far along, and each person's on-time percentage.
 *
 * The percentage is on this plan only — missed timers here — never a person-wide score, which is
 * why it sits under the plan's own heading and nowhere else.
 */
export function SummaryHeader({
  plan,
  projectName,
}: {
  plan: ProjectWorkPlan;
  projectName: string | null;
}) {
  const theme = useTheme();
  const progress = planProgress(plan);
  const complete = progress.total > 0 && progress.done === progress.total;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Hero
        overline="Project summary"
        title={projectName ?? 'Work plan'}
        icon="list-circle"
        iconTone={complete ? 'success' : 'primary'}
      >
        <View style={{ gap: theme.spacing.xs }}>
          <ProgressBar
            percent={progress.percent}
            tone={complete ? 'success' : 'primary'}
            height={8}
            label="Steps done"
          />
          <AppText size="sm" tone="muted" tabular>
            {progress.done} of {progress.total} steps done · {progress.percent}%
          </AppText>
        </View>
        {plan.sourceFile ? (
          <MetaLine icon="document-text-outline">From {plan.sourceFile.name}</MetaLine>
        ) : null}
        {plan.assignedTo ? (
          <MetaLine icon="person-outline">Whole project: {plan.assignedTo.name}</MetaLine>
        ) : null}
      </Hero>

      <TileGrid>
        <StatTile label="Running" value={progress.running} icon="timer-outline" iconTone="info" />
        <StatTile
          label="Overdue"
          value={progress.overdue}
          tone={progress.overdue > 0 ? 'danger' : 'default'}
          icon="alarm-outline"
          iconTone={progress.overdue > 0 ? 'danger' : 'success'}
        />
      </TileGrid>

      {plan.scores.length > 0 ? (
        <View
          accessibilityLabel="On-time percentage for this plan"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
        >
          {plan.scores.map((score) => (
            <ScoreChip key={score.user.id} name={score.user.name} percent={score.percent} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ScoreChip({ name, percent }: { name: string; percent: number }) {
  const theme = useTheme();
  let color = theme.colors.success;
  let background = theme.colors.successSoft;
  if (percent < 70) {
    color = theme.colors.danger;
    background = theme.colors.dangerSoft;
  } else if (percent < 90) {
    color = theme.colors.warning;
    background = theme.colors.warningSoft;
  }
  return (
    <View
      accessible
      accessibilityLabel={`${name}: ${percent}% on time`}
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingLeft: theme.spacing.md,
        paddingRight: 4,
        paddingVertical: 4,
      }}
    >
      <AppText size="sm">{name}</AppText>
      <View
        style={{
          backgroundColor: background,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
        }}
      >
        <AppText size="xs" weight="bold" tabular style={{ color }}>
          {percent}%
        </AppText>
      </View>
    </View>
  );
}
