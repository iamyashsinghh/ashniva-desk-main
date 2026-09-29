import { Pressable, View } from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import {
  WALLPAPER_COLOR_LABELS,
  WALLPAPER_COLOR_TOKENS,
  type WallpaperColorToken,
} from './wallpaper-colors';

/** One circle per theme colour a chat may be painted with; the chosen one carries a tick. */
export function WallpaperSwatches({
  selected,
  onSelect,
}: {
  selected: WallpaperColorToken | null;
  onSelect: (token: WallpaperColorToken) => void;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Colours"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}
    >
      {WALLPAPER_COLOR_TOKENS.map((token) => {
        const chosen = token === selected;
        return (
          <Pressable
            key={token}
            accessibilityRole="radio"
            accessibilityLabel={WALLPAPER_COLOR_LABELS[token]}
            accessibilityState={{ checked: chosen, selected: chosen }}
            onPress={() => onSelect(token)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: theme.colors[token],
              borderColor: chosen ? theme.colors.primary : theme.colors.borderStrong,
              borderRadius: TOUCH_TARGET / 2,
              borderWidth: chosen ? 3 : 1,
              height: TOUCH_TARGET,
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              width: TOUCH_TARGET,
            })}
          >
            {chosen ? <Glyph name="check" color={theme.colors.text} size={14} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
