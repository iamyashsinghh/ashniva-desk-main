import type { SessionUser } from '@ashniva/types';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../shared/components/Avatar';
import { Icon, type IconName } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { BrandSearchField, InkWash, useOptionalRootNavigation, useQuickCreate } from '../search';

/**
 * The top of Home: a band in the brand colour with the greeting, today's date, your avatar, and
 * the ways into search and quick create.
 *
 * It runs up under the status bar, so the screen hosting it has no navigation header of its own.
 *
 * Search is offered to everybody, as the web's topbar offers it to staff and portal alike: what
 * it may answer is decided per module by the API. The "+" appears only when this person may
 * create at least one thing.
 */
export function HomeHeader({
  user,
  onOpenProfile,
  onOpenAlerts,
  onOpenMenu,
}: {
  user: SessionUser;
  onOpenProfile?: () => void;
  onOpenAlerts?: () => void;
  onOpenMenu?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useOptionalRootNavigation();
  const quickCreate = useQuickCreate(navigation);
  const ink = theme.colors.primaryText;

  return (
    <View
      style={{
        backgroundColor: theme.colors.primary,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        gap: theme.spacing.lg,
        overflow: 'hidden',
        paddingBottom: theme.spacing.xl,
        paddingHorizontal: theme.spacing.screen + 4,
        paddingTop: insets.top + theme.spacing.lg,
      }}
    >
      <Bubble size={220} top={-90} right={-60} color={ink} />
      <Bubble size={140} top={40} right={90} color={ink} opacity={0.05} />
      <Bubble size={90} top={110} left={-30} color={ink} opacity={0.06} />

      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        {onOpenMenu ? <RoundButton icon="menu" label="Open menu" onPress={onOpenMenu} /> : null}
        <View
          style={{ alignItems: 'center', flex: 1, flexDirection: 'row', gap: theme.spacing.xs }}
        >
          <Icon name="calendar-outline" size={14} color={ink} style={{ opacity: 0.8 }} />
          <AppText
            size="sm"
            weight="medium"
            numberOfLines={1}
            style={{ color: ink, flexShrink: 1, opacity: 0.85 }}
          >
            {todayLabel()}
          </AppText>
        </View>
        {quickCreate.available ? (
          <RoundButton icon="add" label="Create" onPress={quickCreate.open} />
        ) : null}
        {onOpenAlerts ? (
          <RoundButton icon="notifications-outline" label="Alerts" onPress={onOpenAlerts} />
        ) : null}
        {onOpenProfile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            hitSlop={4}
            onPress={onOpenProfile}
            style={({ pressed }) => ({
              borderColor: 'rgba(255,255,255,0.55)',
              borderRadius: 24,
              borderWidth: 2,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Avatar name={user.name} size={40} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="display" style={{ color: ink }}>
          {greeting()}, {user.name.split(' ')[0]}
        </AppText>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
          <Icon name="briefcase-outline" size={14} color={ink} style={{ opacity: 0.8 }} />
          <AppText size="sm" numberOfLines={1} style={{ color: ink, flex: 1, opacity: 0.85 }}>
            {user.roleName} · {user.organization.name}
          </AppText>
        </View>
      </View>

      {navigation ? <BrandSearchField onPress={() => navigation.navigate('Search')} /> : null}
      {quickCreate.sheet}
    </View>
  );
}

/** A round button on the brand band. 44 points across: the header's controls are all targets. */
function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const ink = useTheme().colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        borderRadius: TOUCH_TARGET / 2,
        height: TOUCH_TARGET,
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
        overflow: 'hidden',
        width: TOUCH_TARGET,
      })}
    >
      <InkWash opacity={0.16} />
      <Icon name={icon} size={icon === 'add' ? 26 : 22} color={ink} />
    </Pressable>
  );
}

/** A faint circle in the header, for depth. */
function Bubble({
  size,
  color,
  opacity = 0.08,
  ...position
}: {
  size: number;
  color: string;
  opacity?: number;
  top?: number;
  left?: number;
  right?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        backgroundColor: color,
        borderRadius: size / 2,
        height: size,
        opacity,
        position: 'absolute',
        width: size,
        ...position,
      }}
    />
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** The short weekday leaves the row room for four buttons on the narrowest phones. */
function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}
