import { View } from 'react-native';

import { Grow, StickyActionBar } from '../../../shared/components/layout';
import { AppText, Button } from '../../../shared/components/primitives';

/** Pinned while assignment picks are unsaved, so leaving them half-done is a visible choice. */
export function SaveBar({
  changes,
  busy,
  onSave,
  onDiscard,
}: {
  changes: number;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <StickyActionBar
      note={
        <View accessibilityLiveRegion="polite">
          <AppText size="sm" tone="muted">
            {changes} unsaved assignment {changes === 1 ? 'change' : 'changes'}
          </AppText>
        </View>
      }
    >
      <Grow>
        <Button label="Discard" variant="secondary" disabled={busy} onPress={onDiscard} />
      </Grow>
      <Grow>
        <Button label="Save assignments" icon="save-outline" loading={busy} onPress={onSave} />
      </Grow>
    </StickyActionBar>
  );
}

/** Pinned while two or more topics in one phase are ticked for combining. */
export function CombineBar({
  count,
  minutes,
  onCombine,
  onClear,
}: {
  count: number;
  minutes: number;
  onCombine: () => void;
  onClear: () => void;
}) {
  return (
    <StickyActionBar>
      <Grow>
        <Button label="Clear" variant="secondary" onPress={onClear} />
      </Grow>
      <Grow>
        <Button
          label={`Combine ${count} topics · ${minutes} min`}
          icon="git-merge-outline"
          onPress={onCombine}
        />
      </Grow>
    </StickyActionBar>
  );
}
