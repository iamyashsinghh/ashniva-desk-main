import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Icon, IconTile } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The staging address, tappable.
 *
 * Opened the way the sign-off screen opens a preview link: handed to the platform, with a line
 * of its own if the device has nothing that can open it, rather than a tap that silently does
 * nothing.
 */
export function QaStagingLink({ url }: { url: string }) {
  const theme = useTheme();
  const [openError, setOpenError] = useState<string | null>(null);

  const open = async () => {
    setOpenError(null);
    try {
      await Linking.openURL(url);
    } catch {
      setOpenError('That link could not be opened on this device.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Pressable
        accessibilityRole="link"
        accessibilityHint="Opens the staging site in your browser"
        hitSlop={8}
        onPress={() => void open()}
        style={({ pressed }) => ({
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <IconTile name="globe-outline" tone="info" size={32} />
        <AppText size="sm" tone="primary" weight="medium" style={{ flex: 1 }}>
          {url}
        </AppText>
        <Icon name="open-outline" size={16} color={theme.colors.primary} />
      </Pressable>
      {openError ? (
        <AppText size="xs" tone="danger">
          {openError}
        </AppText>
      ) : null}
    </View>
  );
}
