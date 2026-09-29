import type { SessionUser } from '@ashniva/types';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../shared/components/Icon';
import { PersonAvatar } from '../../shared/components/PersonAvatar';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The brand-coloured top of the profile: who you are, which the cards below overlap. The picture
 * opens the sheet that changes it when `onEditPicture` is given.
 */
export function ProfileHeader({
  user,
  onOpenMenu,
  onEditPicture,
}: {
  user: SessionUser;
  onOpenMenu?: () => void;
  onEditPicture?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ink = theme.colors.primaryText;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.primary,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        gap: theme.spacing.sm,
        overflow: 'hidden',
        paddingBottom: theme.spacing.xxl + theme.spacing.lg,
        paddingHorizontal: theme.spacing.screen,
        paddingTop: insets.top + theme.spacing.xl,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          backgroundColor: ink,
          borderRadius: 130,
          height: 260,
          opacity: 0.07,
          position: 'absolute',
          right: -90,
          top: -120,
          width: 260,
        }}
      />
      {onOpenMenu ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={8}
          onPress={onOpenMenu}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.16)',
            borderRadius: 20,
            height: 40,
            justifyContent: 'center',
            left: theme.spacing.screen,
            opacity: pressed ? 0.7 : 1,
            position: 'absolute',
            top: insets.top + theme.spacing.md,
            width: 40,
          })}
        >
          <Icon name="menu" size={22} color={ink} />
        </Pressable>
      ) : null}
      <Pressable
        {...(onEditPicture
          ? {
              accessibilityRole: 'button' as const,
              accessibilityLabel: 'Change profile picture',
              onPress: onEditPicture,
            }
          : { disabled: true })}
        style={({ pressed }) => ({ marginBottom: theme.spacing.xs, opacity: pressed ? 0.85 : 1 })}
      >
        <View style={{ borderColor: ink, borderRadius: 48, borderWidth: 3 }}>
          <PersonAvatar person={user} size={84} />
        </View>
        {onEditPicture ? (
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.primary,
              borderRadius: 16,
              borderWidth: 2,
              bottom: 0,
              height: 32,
              justifyContent: 'center',
              position: 'absolute',
              right: -2,
              width: 32,
            }}
          >
            <Icon name="camera" size={16} color={theme.colors.primary} />
          </View>
        ) : null}
      </Pressable>
      <AppText variant="title" align="center" style={{ color: ink }}>
        {user.name}
      </AppText>
      {user.title ? (
        <AppText size="sm" align="center" style={{ color: ink, opacity: 0.9 }}>
          {user.title}
        </AppText>
      ) : null}
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
        <Icon name="mail-outline" size={14} color={ink} style={{ opacity: 0.85 }} />
        <AppText size="sm" style={{ color: ink, opacity: 0.9 }}>
          {user.email}
        </AppText>
      </View>
    </View>
  );
}
