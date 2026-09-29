import { PRIORITY, type ProjectWorkPlan } from '@ashniva/types';
import { View } from 'react-native';

import { Grow } from '../../../shared/components/layout';
import { AppText, Button, Card } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import type { AssignmentDraft } from './assignment-draft';
import { AssigneeField, PriorityField } from './AssignmentFields';

/** Edit plan and Add work — both need `canAssign`, which is what the API checks on save. */
export function SummaryToolbar({
  plan,
  onEdit,
  onAddWork,
}: {
  plan: ProjectWorkPlan;
  onEdit: () => void;
  onAddWork: () => void;
}) {
  const theme = useTheme();
  if (!plan.canAssign) {
    return null;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      <Grow>
        <Button
          label={plan.phases.length === 0 ? 'Add phase' : 'Edit plan'}
          icon="create-outline"
          variant="secondary"
          onPress={onEdit}
        />
      </Grow>
      <Grow>
        <Button
          label="Add work with AI"
          icon="sparkles-outline"
          variant="secondary"
          onPress={onAddWork}
        />
      </Grow>
    </View>
  );
}

/** Whole-project developer and priority. Phase and topic picks still override it. */
export function ProjectAssignmentCard({
  plan,
  assignment,
  onChange,
}: {
  plan: ProjectWorkPlan;
  assignment: AssignmentDraft;
  onChange: (next: AssignmentDraft) => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.md }}>
      <AppText variant="heading">Whole project</AppText>
      <AppText size="sm" tone="muted">
        Gives every phase and topic to this person. Phase and topic picks still override it.
      </AppText>
      <AssigneeField
        label="Developer"
        developers={plan.developers}
        value={assignment.assignedToId}
        clearLabel="Unassigned"
        onChange={(assignedToId) => onChange({ ...assignment, assignedToId })}
      />
      <PriorityField
        value={assignment.priority}
        onChange={(priority) => onChange({ ...assignment, priority: priority ?? PRIORITY.MEDIUM })}
      />
    </Card>
  );
}

/** The one-line "how this works" for whoever is looking, in the web's words. */
export function summaryHint(plan: ProjectWorkPlan, canCombine: boolean): string {
  if (plan.canAssign) {
    return 'Assign the whole project, or split phases and topics. Tick topics in the same phase to combine their minutes into one topic. Save assignments when you are done.';
  }
  if (canCombine) {
    return 'Tick topics in the same phase that you want to do together, then Combine — their minutes add into one topic. Start the timer, then send the point to the tester.';
  }
  return 'The developer starts the timer, then sends the point to the tester. The clock keeps running until Good.';
}

export function emptyPlanText(plan: ProjectWorkPlan): { title: string; description: string } {
  if (plan.canAssign) {
    return {
      title: 'No phase plan yet',
      description: 'Use Add phase, or describe the work and AI will lay it out.',
    };
  }
  return plan.source
    ? { title: 'Nothing assigned to you yet', description: 'Work shows here once it is yours.' }
    : { title: 'No phase plan yet', description: 'A manager will add it from Summary.' };
}
