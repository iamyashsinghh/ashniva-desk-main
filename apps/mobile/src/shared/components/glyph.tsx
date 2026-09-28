import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * The app's handful of small marks, drawn from plain views.
 *
 * There is no icon font here by decision: the brand's own mark is the only picture the app
 * carries, and the few glyphs a screen needs — a chevron, a plus, a tick — are strokes simple
 * enough to draw. Square line caps and 45° angles echo the chamfered corners of the mark, so the
 * glyphs read as part of the same family rather than borrowed from a set.
 *
 * Always decorative. Every control that shows one also has words, or an accessibility label
 * that says what it does.
 */
export type GlyphName =
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'plus'
  | 'close'
  | 'check'
  | 'arrow-up'
  | 'dot'
  | 'clock';

export function Glyph({
  name,
  color,
  size = 14,
  strokeWidth = 2,
}: {
  name: GlyphName;
  color?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const theme = useTheme();
  const tint = color ?? theme.colors.textMuted;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ alignItems: 'center', height: size, justifyContent: 'center', width: size }}
    >
      {draw(name, tint, size, strokeWidth)}
    </View>
  );
}

function draw(name: GlyphName, color: string, size: number, stroke: number): ReactNode {
  const arm = size * 0.52;
  const chevron = (rotate: string, nudge: ViewStyle) => (
    <View
      style={{
        borderBottomWidth: stroke,
        borderColor: color,
        borderRightWidth: stroke,
        height: arm,
        transform: [{ rotate }],
        width: arm,
        ...nudge,
      }}
    />
  );

  switch (name) {
    case 'chevron-right':
      return chevron('-45deg', { marginLeft: -arm * 0.3 });
    case 'chevron-left':
      return chevron('135deg', { marginLeft: arm * 0.3 });
    case 'chevron-down':
      return chevron('45deg', { marginTop: -arm * 0.3 });
    case 'chevron-up':
      return chevron('-135deg', { marginTop: arm * 0.3 });
    case 'plus':
      return <Cross color={color} size={size} stroke={stroke} />;
    case 'close':
      return (
        <View style={{ transform: [{ rotate: '45deg' }] }}>
          <Cross color={color} size={size * 1.1} stroke={stroke} />
        </View>
      );
    case 'check':
      return (
        <View
          style={{
            borderBottomWidth: stroke,
            borderColor: color,
            borderRightWidth: stroke,
            height: size * 0.62,
            marginTop: -size * 0.15,
            transform: [{ rotate: '45deg' }],
            width: size * 0.34,
          }}
        />
      );
    case 'arrow-up':
      return (
        <View style={{ alignItems: 'center', height: size, width: size }}>
          <View
            style={{
              borderColor: color,
              borderLeftWidth: stroke,
              borderTopWidth: stroke,
              height: arm,
              marginTop: size * 0.12,
              transform: [{ rotate: '45deg' }],
              width: arm,
            }}
          />
          <View
            style={{
              backgroundColor: color,
              height: size * 0.62,
              position: 'absolute',
              top: size * 0.16,
              width: stroke,
            }}
          />
        </View>
      );
    case 'dot':
      return (
        <View
          style={{ backgroundColor: color, borderRadius: size / 2, height: size, width: size }}
        />
      );
    case 'clock':
      return (
        <View
          style={{
            borderColor: color,
            borderRadius: size / 2,
            borderWidth: stroke * 0.8,
            height: size,
            width: size,
          }}
        >
          <View
            style={{
              backgroundColor: color,
              height: size * 0.32,
              left: size / 2 - stroke * 0.8 - stroke / 2,
              position: 'absolute',
              top: size * 0.14,
              width: stroke,
            }}
          />
          <View
            style={{
              backgroundColor: color,
              height: stroke,
              left: size / 2 - stroke * 0.8 - stroke / 2,
              position: 'absolute',
              top: size / 2 - stroke * 0.8 - stroke / 2,
              width: size * 0.26,
            }}
          />
        </View>
      );
  }
}

function Cross({ color, size, stroke }: { color: string; size: number; stroke: number }) {
  return (
    <View style={{ alignItems: 'center', height: size, justifyContent: 'center', width: size }}>
      <View style={{ backgroundColor: color, height: stroke, position: 'absolute', width: size }} />
      <View style={{ backgroundColor: color, height: size, position: 'absolute', width: stroke }} />
    </View>
  );
}

/**
 * A square tile with the brand's chamfered top-left corner, holding a letter or two.
 *
 * Where another app would put a pictogram — a destination on Home, an empty state, a group
 * avatar — this app puts a tile in the language of its own mark. The corner is cut by a
 * triangle in the colour behind the tile, so `cutColor` must match what the tile sits on.
 */
export function ChamferTile({
  label,
  size = 40,
  background,
  color,
  cutColor,
  style,
}: {
  label?: string;
  size?: number;
  background?: string;
  color?: string;
  cutColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const cut = Math.round(size * 0.26);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          alignItems: 'center',
          backgroundColor: background ?? theme.colors.primarySoft,
          borderRadius: Math.max(2, size * 0.06),
          height: size,
          justifyContent: 'center',
          overflow: 'hidden',
          width: size,
        },
        style,
      ]}
    >
      <View
        style={{
          borderRightColor: 'transparent',
          borderRightWidth: cut,
          borderTopColor: cutColor ?? theme.colors.surface,
          borderTopWidth: cut,
          height: 0,
          left: 0,
          position: 'absolute',
          top: 0,
          width: 0,
        }}
      />
      {label ? (
        <Text
          style={{
            color: color ?? theme.colors.primary,
            fontSize: Math.round(size * 0.36),
            fontWeight: '700',
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
