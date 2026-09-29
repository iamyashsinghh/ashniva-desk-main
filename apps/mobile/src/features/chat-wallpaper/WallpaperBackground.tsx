import { useState, type ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../shared/theme/ThemeProvider';
import type { ChatWallpaper } from './wallpaper-store';

/**
 * A conversation's wallpaper, filling whatever it is placed in, with the thread on top.
 *
 * A picture or a strong colour gets a veil of the theme's surface over it: somebody's holiday
 * photo is busy, and a bubble's words have to stay readable on it in both light and dark mode.
 * A picture that cannot be read any more — deleted from under the app — draws the plain
 * background rather than a blank.
 */
export function WallpaperBackground({
  wallpaper,
  children,
  style,
}: {
  wallpaper: ChatWallpaper;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const veil = (
    <View
      pointerEvents="none"
      testID="wallpaper-veil"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.colors.surface, opacity: theme.isDark ? 0.45 : 0.3 },
      ]}
    />
  );

  if (wallpaper.kind === 'image' && failedUri !== wallpaper.uri) {
    return (
      <ImageBackground
        testID="wallpaper-image"
        source={{ uri: wallpaper.uri }}
        resizeMode="cover"
        onError={() => setFailedUri(wallpaper.uri)}
        style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}
      >
        {veil}
        {children}
      </ImageBackground>
    );
  }

  const background =
    wallpaper.kind === 'color' ? theme.colors[wallpaper.token] : theme.colors.background;
  return (
    <View testID="wallpaper-plain" style={[{ flex: 1, backgroundColor: background }, style]}>
      {wallpaper.kind === 'color' ? veil : null}
      {children}
    </View>
  );
}
