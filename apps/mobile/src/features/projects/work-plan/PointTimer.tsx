import type { WorkPlanPoint } from '@ashniva/types';
import { View } from 'react-native';

import { Icon } from '../../../shared/components/Icon';
import { AppText } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { liveRemainingSeconds, timerLabel, type TimerTone } from './plan-helpers';
import { useTicker } from './use-ticker';

/** The countdown on a started point: brand colour while running, amber paused, red overdue. */
export function PointTimer({ point }: { point: WorkPlanPoint }) {
  const theme = useTheme();
  const running = !point.timerPaused && !point.completedAt && Boolean(point.dueAt);
  const now = useTicker(running);
  const label = timerLabel(point, liveRemainingSeconds(point, now));
  const palette: Record<TimerTone, { color: string; background: string }> = {
    running: { color: theme.colors.primary, background: theme.colors.primarySoft },
    paused: { color: theme.colors.warning, background: theme.colors.warningSoft },
    late: { color: theme.colors.danger, background: theme.colors.dangerSoft },
  };
  const { color, background } = palette[label.tone];

  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`Timer: ${label.text}`}
      style={{
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: background,
        borderRadius: theme.radius.pill,
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 4,
      }}
    >
      <Icon
        name={label.tone === 'paused' ? 'pause-circle' : 'timer-outline'}
        size={16}
        color={color}
      />
      <AppText size="sm" weight="bold" tabular style={{ color }}>
        {label.text}
      </AppText>
    </View>
  );
}
