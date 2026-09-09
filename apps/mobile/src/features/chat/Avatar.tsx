import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Somebody's initials, or a group's.
 *
 * Initials rather than a picture, in both places. A group has an `imageFileId` and the phone does
 * not draw it: an image on every row of a list means a request per row through `GET
 * /files/:id/download`, which is the fan-out the list endpoint was shaped to avoid, and the same
 * bearer-token dance the attachment images do — for a 36-point circle. Initials cost nothing, are
 * legible at that size, and never leave a broken square where a face was.
 *
 * The two colours come from the theme like every other colour in this app, so a tenant's brand
 * and the device's dark mode both reach it without this component knowing about either.
 */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const theme = useTheme();
  return (
    <View
      // Decorative: the row it sits on already reads the name out, and hearing initials spelled
      // before it would be noise.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.pillBackground,
        borderColor: theme.colors.border,
        borderRadius: size / 2,
        borderWidth: StyleSheet.hairlineWidth,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: Math.round(size * 0.36),
          fontWeight: '700',
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/**
 * Up to two initials from a name.
 *
 * The first letter of the first and last words, which is what people recognise their own name by.
 * A name that is one word gets one letter rather than two from the middle of it, and an empty
 * name gets a dash rather than an empty circle that looks like a failure to load.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '—';
  }
  const first = (words[0] as string).charAt(0);
  const last = words.length > 1 ? (words[words.length - 1] as string).charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}
