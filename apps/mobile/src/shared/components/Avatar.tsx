import { Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { ChamferTile } from './glyph';

/**
 * Somebody's initials, or a group's.
 *
 * Initials rather than a picture, in both places. A group has an `imageFileId` and the phone does
 * not draw it: an image on every row of a list means a request per row through `GET
 * /files/:id/download`, which is the fan-out the list endpoint was shaped to avoid, and the same
 * bearer-token dance the attachment images do — for a 36-point circle. Initials cost nothing, are
 * legible at that size, and never leave a broken square where a face was.
 *
 * Each name gets one of a few quiet tints, the same one every time, so a busy list is easier to
 * scan by person than a column of identical grey circles. A group is a chamfered tile in the
 * language of the brand mark, so a group and a person are told apart at a glance.
 */
export function Avatar({
  name,
  size = 40,
  shape = 'person',
  cutColor,
}: {
  name: string;
  size?: number;
  shape?: 'person' | 'group';
  /** For a group tile: the colour it sits on, which its cut corner shows through to. */
  cutColor?: string;
}) {
  const theme = useTheme();
  const tint = avatarTint(theme, name);

  if (shape === 'group') {
    return (
      <ChamferTile
        label={initialsOf(name)}
        size={size}
        background={tint.background}
        color={tint.color}
        cutColor={cutColor}
      />
    );
  }

  return (
    <View
      // Decorative: the row it sits on already reads the name out, and hearing initials spelled
      // before it would be noise.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: 'center',
        backgroundColor: tint.background,
        borderRadius: size / 2,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <Text style={{ color: tint.color, fontSize: Math.round(size * 0.38), fontWeight: '700' }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/** The semantic soft colours double as avatar tints, so they follow dark mode for free. */
function avatarTint(
  theme: ReturnType<typeof useTheme>,
  name: string,
): { background: string; color: string } {
  const { colors } = theme;
  const first = { background: colors.primarySoft, color: colors.primary };
  const tints = [
    first,
    { background: colors.infoSoft, color: colors.info },
    { background: colors.successSoft, color: colors.success },
    { background: colors.warningSoft, color: colors.warning },
    { background: colors.pillBackground, color: colors.textMuted },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return tints[hash % tints.length] ?? first;
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
