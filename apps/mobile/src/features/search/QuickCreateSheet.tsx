import { Pressable, View } from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { IconTile } from '../../shared/components/Icon';
import { AppText, cardStyle } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import type { QuickCreateAction, QuickCreateRoute } from './quick-create';

/**
 * The "+" menu: one large, labelled row per thing this person may start.
 *
 * Rows rather than a grid of icons, because each one says what it makes in a sentence — "New
 * task" and "Assign intern work" both make a task, and the difference is the description.
 */
export function QuickCreateSheet({
  visible,
  actions,
  onClose,
  onSelect,
}: {
  visible: boolean;
  actions: readonly QuickCreateAction[];
  onClose: () => void;
  onSelect: (route: QuickCreateRoute) => void;
}) {
  const theme = useTheme();

  return (
    <Sheet visible={visible} title="Create" subtitle="Start something new" onClose={onClose}>
      <View style={{ gap: theme.spacing.sm }}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityHint={action.description}
            onPress={() => onSelect(action.route)}
            style={({ pressed }) => [
              cardStyle(theme),
              {
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.md,
                minHeight: TOUCH_TARGET + 20,
                paddingVertical: theme.spacing.md,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              },
              pressed ? { backgroundColor: theme.colors.surfaceSunken } : null,
            ]}
          >
            <IconTile name={action.icon} tone={action.tone} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="heading">{action.label}</AppText>
              <AppText size="sm" tone="muted">
                {action.description}
              </AppText>
            </View>
            <Glyph name="chevron-right" color={theme.colors.textFaint} size={14} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
