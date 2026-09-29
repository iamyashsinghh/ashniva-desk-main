import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { Theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A status, as a small tinted capsule with a dot.
 *
 * The tone carries the meaning (overdue is danger, done is success) and the dot repeats it in a
 * shape, so the state survives a colour-blind reader and a greyscale screenshot alike.
 */

export type PillTone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  const theme = useTheme();
  const { color, background } = pillColors(theme, tone);

  return (
    <View
      // Read out as one thing rather than a stray word floating next to the title.
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={{
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: background,
        borderRadius: theme.radius.pill,
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: theme.spacing.sm + 2,
        paddingVertical: 3,
      }}
    >
      <View style={{ backgroundColor: color, borderRadius: 3, height: 6, width: 6 }} />
      <Text style={{ ...theme.typography.caption, color, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function pillColors(theme: Theme, tone: PillTone): { color: string; background: string } {
  return {
    neutral: { color: theme.colors.textMuted, background: theme.colors.pillBackground },
    info: { color: theme.colors.info, background: theme.colors.infoSoft },
    progress: { color: theme.colors.info, background: theme.colors.infoSoft },
    warning: { color: theme.colors.warning, background: theme.colors.warningSoft },
    success: { color: theme.colors.success, background: theme.colors.successSoft },
    danger: { color: theme.colors.danger, background: theme.colors.dangerSoft },
  }[tone];
}

/** Pills in a wrapping row, the usual way a card shows its states. */
export function PillRow({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs + 2 }}>
      {children}
    </View>
  );
}
