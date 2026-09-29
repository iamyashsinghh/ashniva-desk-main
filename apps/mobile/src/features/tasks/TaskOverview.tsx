import { TASK_STATUS_LABELS, type TaskDetail } from '@ashniva/types';
import { View } from 'react-native';

import { Hero, Section, SectionHeader } from '../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { TaskFacts } from './TaskFacts';
import { TaskTimingPill } from './TaskTimingPill';
import { taskTone } from './task-display';

/** The top of the task: what it is and where it stands. */
export function TaskHero({ task }: { task: TaskDetail }) {
  return (
    <Hero overline={`${task.key} · ${task.project.code}`} title={task.title} icon="checkbox">
      <TaskFacts task={task} />
      <PillRow>
        <Pill label={TASK_STATUS_LABELS[task.status]} tone={taskTone(task.status)} />
        {/*
          The same verdict the list row shows, so opening a task never changes the answer.
          `isOverdue` below asks a different question — the calendar due date, which is what the
          list views filter on — so both appear rather than one standing in for the other.
        */}
        <TaskTimingPill timing={task.timing} />
        {task.isUpcoming ? <Pill label="Starts later" tone="info" /> : null}
        {task.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
        {task.clientVisible ? <Pill label="Client sees this" tone="info" /> : null}
      </PillRow>
    </Hero>
  );
}

/** What the work is and what counts as done. Draws nothing when neither was written. */
export function TaskDescription({ task }: { task: TaskDetail }) {
  const theme = useTheme();
  if (!task.description && !task.acceptanceCriteria) {
    return null;
  }
  return (
    <Section>
      {task.description ? (
        <View style={{ gap: theme.spacing.xs }}>
          <SectionHeader title="Description" icon="document-text-outline" />
          <AppText>{task.description}</AppText>
        </View>
      ) : null}
      {task.description && task.acceptanceCriteria ? <Divider /> : null}
      {task.acceptanceCriteria ? (
        <View style={{ gap: theme.spacing.xs }}>
          <SectionHeader title="What counts as done" icon="checkmark-done-outline" />
          <AppText>{task.acceptanceCriteria}</AppText>
        </View>
      ) : null}
    </Section>
  );
}
