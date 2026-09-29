import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '../../shared/components/brand';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/** The brand-coloured block at the top of the sign-in screen, which the form card overlaps. */
export function LoginHeader() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.primary,
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
        gap: theme.spacing.md,
        overflow: 'hidden',
        paddingBottom: 88,
        paddingHorizontal: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing.xxl,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          backgroundColor: theme.colors.primaryText,
          borderRadius: 150,
          height: 300,
          left: -120,
          opacity: 0.06,
          position: 'absolute',
          top: -110,
          width: 300,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          backgroundColor: theme.colors.primaryText,
          borderRadius: 90,
          bottom: -40,
          height: 180,
          opacity: 0.07,
          position: 'absolute',
          right: -50,
          width: 180,
        }}
      />
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceRaised,
          borderRadius: 24,
          height: 80,
          justifyContent: 'center',
          width: 80,
          ...theme.shadow.raised,
        }}
      >
        <BrandMark size={48} color={theme.colors.primary} />
      </View>
      <AppText variant="display" align="center" style={{ color: theme.colors.primaryText }}>
        Ashniva Desk
      </AppText>
      <AppText align="center" style={{ color: theme.colors.primaryText, opacity: 0.85 }}>
        Projects, tasks and tickets — in your pocket.
      </AppText>
    </View>
  );
}
