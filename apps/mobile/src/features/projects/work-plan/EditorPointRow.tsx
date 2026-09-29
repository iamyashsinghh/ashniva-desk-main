import type { WorkPlanPointInput } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { parseMinutes } from './draft-editing';
import { ReorderControls } from './ReorderControls';

/** One step in the editor: what it covers and how many minutes it gets. */
export function EditorPointRow({
  point,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  point: WorkPlanPointInput;
  index: number;
  count: number;
  onChange: (next: WorkPlanPointInput) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  // The minutes field keeps its own text while focused, so clearing it to type "45" does not snap
  // to 1 on the first keystroke.
  const [minutesText, setMinutesText] = useState<string | null>(null);

  return (
    <View
      style={{
        backgroundColor: point.isError ? theme.colors.dangerSoft : theme.colors.surfaceSunken,
        borderRadius: theme.radius.sm,
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppText variant="label" tone="muted" uppercase style={{ flex: 1 }}>
          Step {index + 1}
          {point.isError ? ' · tester error' : ''}
        </AppText>
        <ReorderControls
          name={`step ${index + 1}`}
          index={index}
          count={count}
          onMove={onMove}
          onRemove={onRemove}
        />
      </View>
      <Input
        multiline
        accessibilityLabel={`Step ${index + 1}`}
        placeholder="What this step covers"
        value={point.body}
        onChangeText={(body) => onChange({ ...point, body })}
        invalid={!point.body.trim()}
        style={{ minHeight: 64 }}
      />
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppText size="sm" tone="muted">
          Minutes
        </AppText>
        {point.isError ? (
          <AppText size="sm" tone="danger" weight="medium">
            error
          </AppText>
        ) : (
          <Input
            accessibilityLabel={`Minutes for step ${index + 1}`}
            keyboardType="number-pad"
            value={minutesText ?? String(point.estimateMinutes)}
            onFocus={() => setMinutesText(String(point.estimateMinutes))}
            onBlur={() => setMinutesText(null)}
            onChangeText={(text) => {
              setMinutesText(text);
              if (text.trim()) {
                onChange({ ...point, estimateMinutes: parseMinutes(text) });
              }
            }}
            style={{ minWidth: 88, textAlign: 'right' }}
          />
        )}
      </View>
    </View>
  );
}
