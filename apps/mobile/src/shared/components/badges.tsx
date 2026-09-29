import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { AppText } from './primitives';

/** A small fact with an icon in front of it: a due date, a project, who it is assigned to. */
export function MetaLine({
  icon,
  children,
  danger = false,
}: {
  icon: IconName;
  children: ReactNode;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
      <Icon name={icon} size={13} color={danger ? theme.colors.danger : theme.colors.textFaint} />
      <AppText size="xs" tone={danger ? 'danger' : 'muted'} style={{ flexShrink: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

/** A small count bubble: unread messages, approvals waiting. */
export function CountBadge({
  count,
  tone = 'primary',
}: {
  count: number;
  tone?: 'primary' | 'danger';
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: tone === 'danger' ? theme.colors.danger : theme.colors.primary,
        borderRadius: theme.radius.pill,
        justifyContent: 'center',
        minWidth: 22,
        paddingHorizontal: 6,
        paddingVertical: 1,
      }}
    >
      <AppText size="xs" weight="bold" tone="inverse" tabular>
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}
