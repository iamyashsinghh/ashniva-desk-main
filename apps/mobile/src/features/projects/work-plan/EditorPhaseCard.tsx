import type { WorkPlanPhaseInput } from '@ashniva/types';
import { Alert, View } from 'react-native';

import { IconTile } from '../../../shared/components/Icon';
import { AppText, Button, Card, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { moveItem, newTitle, removeAt, replaceAt } from './draft-editing';
import { EditorTitleBlock } from './EditorTitleBlock';
import { ReorderControls } from './ReorderControls';

/** Removing a phase or topic takes its steps with it, so it is confirmed; a single step is not. */
function confirmRemove(what: string, onConfirm: () => void) {
  Alert.alert(`Remove ${what}?`, 'Its steps are removed too when you save the plan.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
  ]);
}

/** A phase in the editor: heading, topics, and a way to add a topic. */
export function EditorPhaseCard({
  phase,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  phase: WorkPlanPhaseInput;
  index: number;
  count: number;
  onChange: (next: WorkPlanPhaseInput) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const setTitles = (titles: WorkPlanPhaseInput['titles']) => onChange({ ...phase, titles });
  const phaseName = phase.heading.trim() || `${index + 1}`;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <IconTile name="layers-outline" tone="violet" size={32} />
        <AppText variant="label" tone="muted" uppercase style={{ flex: 1 }}>
          Phase {index + 1}
        </AppText>
        <ReorderControls
          name={`phase ${phaseName}`}
          index={index}
          count={count}
          onMove={onMove}
          onRemove={() => confirmRemove(`phase ${phaseName}`, onRemove)}
        />
      </View>
      <Input
        accessibilityLabel={`Phase ${index + 1} heading`}
        placeholder="Phase heading"
        value={phase.heading}
        onChangeText={(heading) => onChange({ ...phase, heading })}
        invalid={!phase.heading.trim()}
      />
      {phase.titles.map((title, titleIndex) => (
        <EditorTitleBlock
          key={title.id ?? `new-${titleIndex}`}
          title={title}
          index={titleIndex}
          count={phase.titles.length}
          onChange={(next) => setTitles(replaceAt(phase.titles, titleIndex, next))}
          onMove={(delta) => setTitles(moveItem(phase.titles, titleIndex, delta))}
          onRemove={() =>
            confirmRemove(`topic ${title.title.trim() || titleIndex + 1}`, () =>
              setTitles(removeAt(phase.titles, titleIndex)),
            )
          }
        />
      ))}
      <View style={{ alignSelf: 'flex-start' }}>
        <Button
          label="Add topic"
          icon="add-circle-outline"
          variant="secondary"
          size="sm"
          onPress={() => setTitles([...phase.titles, newTitle(phase.titles.length + 1)])}
        />
      </View>
    </Card>
  );
}
