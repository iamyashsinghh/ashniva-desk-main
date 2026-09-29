import { View } from 'react-native';

import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { WallpaperBackground } from './WallpaperBackground';
import type { ChatWallpaper } from './wallpaper-store';

/** The wallpaper behind one message from somebody else and one of yours, as a thread draws them. */
export function WallpaperPreview({ wallpaper }: { wallpaper: ChatWallpaper }) {
  const theme = useTheme();
  const bubble = {
    borderRadius: theme.radius.md,
    maxWidth: '78%' as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  };

  return (
    <View
      accessibilityLabel="Preview of the chat wallpaper"
      style={{
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        height: 240,
        overflow: 'hidden',
      }}
    >
      <WallpaperBackground
        wallpaper={wallpaper}
        style={{ gap: theme.spacing.sm, justifyContent: 'flex-end', padding: theme.spacing.md }}
      >
        <View
          style={{
            ...bubble,
            alignSelf: 'flex-start',
            backgroundColor: theme.colors.surfaceRaised,
            borderBottomLeftRadius: theme.radius.xs,
          }}
        >
          <AppText size="sm">Morning! Is the build ready for testing?</AppText>
        </View>
        <View
          style={{
            ...bubble,
            alignSelf: 'flex-end',
            backgroundColor: theme.colors.primary,
            borderBottomRightRadius: theme.radius.xs,
          }}
        >
          <AppText size="sm" tone="inverse">
            Yes — it went out ten minutes ago.
          </AppText>
        </View>
      </WallpaperBackground>
    </View>
  );
}
