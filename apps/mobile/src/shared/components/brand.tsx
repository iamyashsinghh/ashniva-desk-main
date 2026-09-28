import { Image, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './primitives';

/**
 * The Ashniva mark.
 *
 * A single-colour PNG tinted at runtime, so it is ink on the light theme and near-white on the
 * dark one without a second asset. Decorative wherever it appears: the product name next to it
 * is what a screen reader reads.
 */
export function BrandMark({ size = 40, color }: { size?: number; color?: string }) {
  const theme = useTheme();
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityElementsHidden
      importantForAccessibility="no"
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves assets by require.
      source={require('../../../assets/brand-mark.png')}
      style={{ height: size, tintColor: color ?? theme.colors.text, width: size }}
    />
  );
}

/** The mark with the product name, for the sign-in and splash screens. */
export function BrandLockup({ size = 44, title = 'Ashniva Desk' }: { size?: number; title?: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
      <BrandMark size={size} />
      <AppText variant="title">{title}</AppText>
    </View>
  );
}
