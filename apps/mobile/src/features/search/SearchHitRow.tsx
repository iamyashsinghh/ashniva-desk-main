import type { SearchHit } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { AppText, Pill } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { statusLabel } from './search-targets';

/**
 * One match: its identifier, its title, one line of context and its status — exactly the four
 * things the API sends, and nothing the module's own list would not show.
 *
 * Without `onPress` the row is drawn the same but is not a button, and has no chevron: it is a
 * match with nowhere on the phone to open it, and saying so is better than a tap that does nothing.
 */
export function SearchHitRow({ hit, onPress }: { hit: SearchHit; onPress?: () => void }) {
  const theme = useTheme();
  const status = hit.status ? statusLabel(hit.status) : null;
  const label = [hit.reference, hit.title, hit.subtitle, status && `Status: ${status}`]
    .filter(Boolean)
    .join(', ');

  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        {hit.reference ? (
          <AppText size="xs" weight="bold" tone="primary" numberOfLines={1} tabular>
            {hit.reference}
          </AppText>
        ) : null}
        <AppText weight="medium" numberOfLines={2}>
          {hit.title}
        </AppText>
        {hit.subtitle || status ? (
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              marginTop: 2,
            }}
          >
            {status ? <Pill label={status} /> : null}
            {hit.subtitle ? (
              <AppText size="xs" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {hit.subtitle}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
      {onPress ? <Glyph name="chevron-right" color={theme.colors.textFaint} size={14} /> : null}
    </>
  );

  const frame = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    minHeight: TOUCH_TARGET + 12,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  };

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={frame}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        frame,
        pressed ? { backgroundColor: theme.colors.surfaceSunken } : null,
      ]}
    >
      {body}
    </Pressable>
  );
}
