import type { WorkPlanPoint } from '@ashniva/types';
import { View } from 'react-native';

import type { IconName } from '../../../shared/components/Icon';
import { Button, type ButtonVariant } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { visiblePointActions, type PointActionKey } from './plan-helpers';
import { usePointRunner } from './point-runner';

interface ActionLook {
  label: string;
  icon: IconName;
  variant: ButtonVariant;
}

/** The labels are the web's words, so a developer moving between the two reads the same loop. */
function lookFor(action: PointActionKey, point: WorkPlanPoint): ActionLook {
  switch (action) {
    case 'start':
      return {
        label: point.startedAt && !point.isError ? 'Resume' : 'Start',
        icon: 'play',
        variant: 'primary',
      };
    case 'submitTest':
      return { label: 'Send to tester', icon: 'paper-plane-outline', variant: 'primary' };
    case 'startTest':
      return { label: 'Start test', icon: 'flask-outline', variant: 'secondary' };
    case 'complete':
      return { label: 'Good', icon: 'checkmark-circle-outline', variant: 'primary' };
    case 'return':
      return { label: 'Error', icon: 'arrow-undo-outline', variant: 'dangerGhost' };
  }
}

/**
 * The step buttons the API offered this person on this point, and nothing else.
 *
 * "Error" does not post on tap: it asks what is wrong first, because an error without a
 * description sends a developer back to a step with nothing to fix.
 */
export function PointActions({ point, onReturn }: { point: WorkPlanPoint; onReturn: () => void }) {
  const theme = useTheme();
  const runner = usePointRunner();
  const actions = visiblePointActions(point);
  if (actions.length === 0) {
    return null;
  }
  const pending = runner.pendingPointId === point.id;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      {actions.map((action) => {
        const look = lookFor(action, point);
        return (
          <Button
            key={action}
            label={look.label}
            icon={look.icon}
            variant={look.variant}
            size="sm"
            loading={pending && action !== 'return'}
            disabled={runner.busy && !pending}
            onPress={() => (action === 'return' ? onReturn() : runner.run(action, point.id))}
          />
        );
      })}
    </View>
  );
}
