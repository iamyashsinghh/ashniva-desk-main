import { View } from 'react-native';

import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The queue's three counts as a row of small figures under the view switcher.
 *
 * Read as the one sentence it replaced, so a screen reader hears "3 yours · 1 ready · 0 overdue"
 * rather than six loose fragments.
 */
export function QueueCounts({
  mine,
  ready,
  overdue,
}: {
  mine: number;
  ready: number;
  overdue: number;
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${mine} yours · ${ready} ready · ${overdue} overdue`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
    >
      <Count value={mine} label="yours" />
      <Count value={ready} label="ready" />
      <Count value={overdue} label="overdue" danger={overdue > 0} />
    </View>
  );
}

function Count({
  value,
  label,
  danger = false,
}: {
  value: number;
  label: string;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'baseline',
        backgroundColor: danger ? theme.colors.dangerSoft : theme.colors.surfaceSunken,
        borderRadius: theme.radius.pill,
        flexDirection: 'row',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <AppText size="sm" weight="bold" tone={danger ? 'danger' : 'default'} tabular>
        {value}
      </AppText>
      <AppText size="xs" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

/** An API enum as a word: `REGRESSION` → "Regression", `SMOKE_TEST` → "Smoke test". */
export function humanise(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
