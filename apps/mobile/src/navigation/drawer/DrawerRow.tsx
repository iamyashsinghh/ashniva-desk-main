import { Pressable, View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import type { MenuItem } from '../menu-items';

export function DrawerRow({
  item,
  badge,
  onPress,
}: {
  item: MenuItem;
  badge: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const count = badge > 99 ? '99+' : String(badge);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${item.label}, ${count} unread` : item.label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? theme.colors.primarySoft : 'transparent',
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        gap: theme.spacing.md,
        marginHorizontal: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 11,
      })}
    >
      <Icon name={item.icon} size={20} color={theme.colors.primary} />
      <AppText weight="medium" numberOfLines={1} style={{ flex: 1 }}>
        {item.label}
      </AppText>
      {badge > 0 ? (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.dangerSoft,
            borderRadius: theme.radius.pill,
            minWidth: 22,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
        >
          <AppText size="xs" weight="bold" tone="danger" tabular>
            {count}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
