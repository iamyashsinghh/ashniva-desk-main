import { View } from 'react-native';

import { ListRow } from '../../../shared/components/data-display';
import { Divider } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import type { ActionKey, PlannedAction } from './action-plan';

/** Everything the person may do besides the primary action, one row each. */
export function MoreActionsSheet({
  actions,
  onPick,
  onClose,
}: {
  actions: readonly PlannedAction[];
  onPick: (key: ActionKey) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible title="More actions" subtitle="What you can do on this task" onClose={onClose}>
      <View>
        {actions.map((action, index) => (
          <View key={action.key}>
            {index > 0 ? <Divider inset={52} /> : null}
            <ListRow
              title={action.label}
              subtitle={action.reason}
              icon={action.icon}
              iconTone={action.destructive ? 'danger' : 'primary'}
              destructive={action.destructive}
              {...(action.enabled ? { onPress: () => onPick(action.key) } : {})}
            />
          </View>
        ))}
      </View>
    </Sheet>
  );
}
