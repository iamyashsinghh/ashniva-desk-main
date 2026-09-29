import { TASK_STATUS_LABELS, type TaskStatus } from '@ashniva/types';
import { Fragment } from 'react';
import { View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { AppText, Card, Pill } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { taskSteps, taskTone, type StepState } from './task-display';

/**
 * Where the task is on its way: Assigned → In progress → Review → Completed, with the side state
 * underneath when it has stepped off that path.
 */
export function TaskSteps({ status }: { status: TaskStatus }) {
  const theme = useTheme();
  const { steps, offPath } = taskSteps(status);

  const dotColor = (state: StepState) => {
    if (state === 'todo') {
      return theme.colors.borderStrong;
    }
    return state === 'current' ? theme.colors.primary : theme.colors.success;
  };

  return (
    <Card>
      <View
        accessible
        accessibilityLabel={`Workflow: ${steps
          .map((step) => `${TASK_STATUS_LABELS[step.status]} ${step.state}`)
          .join(', ')}`}
        style={{ alignItems: 'flex-start', flexDirection: 'row' }}
      >
        {steps.map((step, index) => (
          <Fragment key={step.status}>
            {index > 0 ? (
              <View
                style={{
                  backgroundColor:
                    step.state === 'todo' ? theme.colors.border : theme.colors.success,
                  flex: 1,
                  height: 2,
                  marginTop: 13,
                }}
              />
            ) : null}
            <View style={{ alignItems: 'center', gap: 4, width: 72 }}>
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor:
                    step.state === 'todo' ? theme.colors.surface : dotColor(step.state),
                  borderColor: dotColor(step.state),
                  borderRadius: 14,
                  borderWidth: 2,
                  height: 28,
                  justifyContent: 'center',
                  width: 28,
                }}
              >
                {step.state === 'done' ? (
                  <Icon name="checkmark" size={16} color={theme.colors.primaryText} />
                ) : null}
                {step.state === 'current' ? (
                  <View
                    style={{
                      backgroundColor: theme.colors.primaryText,
                      borderRadius: 4,
                      height: 8,
                      width: 8,
                    }}
                  />
                ) : null}
              </View>
              <AppText
                size="xs"
                align="center"
                weight={step.state === 'current' ? 'bold' : 'regular'}
                tone={step.state === 'todo' ? 'faint' : 'default'}
                numberOfLines={2}
              >
                {TASK_STATUS_LABELS[step.status]}
              </AppText>
            </View>
          </Fragment>
        ))}
      </View>
      {offPath ? (
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
          <AppText size="xs" tone="muted">
            Currently
          </AppText>
          <Pill label={TASK_STATUS_LABELS[offPath]} tone={taskTone(offPath)} />
        </View>
      ) : null}
    </Card>
  );
}
