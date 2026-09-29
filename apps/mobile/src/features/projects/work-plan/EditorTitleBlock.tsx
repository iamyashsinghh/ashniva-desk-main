import type { WorkPlanTitleInput } from '@ashniva/types';
import { View } from 'react-native';

import { AppText, Button, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { moveItem, newPoint, removeAt, replaceAt } from './draft-editing';
import { EditorPointRow } from './EditorPointRow';
import { ReorderControls } from './ReorderControls';

/** A topic in the editor: its name, its steps, and a way to add one. */
export function EditorTitleBlock({
  title,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  title: WorkPlanTitleInput;
  index: number;
  count: number;
  onChange: (next: WorkPlanTitleInput) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const setPoints = (points: WorkPlanTitleInput['points']) => onChange({ ...title, points });
  const minutes = title.points
    .filter((point) => !point.isError)
    .reduce((sum, point) => sum + point.estimateMinutes, 0);

  return (
    <View
      style={{
        borderLeftColor: theme.colors.border,
        borderLeftWidth: 3,
        gap: theme.spacing.sm,
        paddingLeft: theme.spacing.md,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppText variant="label" tone="muted" uppercase style={{ flex: 1 }}>
          Topic {index + 1} · {minutes} min
        </AppText>
        <ReorderControls
          name={`topic ${title.title.trim() || index + 1}`}
          index={index}
          count={count}
          onMove={onMove}
          onRemove={onRemove}
        />
      </View>
      <Input
        accessibilityLabel={`Topic ${index + 1} name`}
        placeholder="Topic name"
        value={title.title}
        onChangeText={(text) => onChange({ ...title, title: text })}
        invalid={!title.title.trim()}
      />
      {title.points.map((point, pointIndex) => (
        <EditorPointRow
          key={point.id ?? `new-${pointIndex}`}
          point={point}
          index={pointIndex}
          count={title.points.length}
          onChange={(next) => setPoints(replaceAt(title.points, pointIndex, next))}
          onMove={(delta) => setPoints(moveItem(title.points, pointIndex, delta))}
          onRemove={() => setPoints(removeAt(title.points, pointIndex))}
        />
      ))}
      <View style={{ alignSelf: 'flex-start' }}>
        <Button
          label="Add step"
          icon="add"
          variant="ghost"
          size="sm"
          onPress={() => setPoints([...title.points, newPoint()])}
        />
      </View>
    </View>
  );
}
