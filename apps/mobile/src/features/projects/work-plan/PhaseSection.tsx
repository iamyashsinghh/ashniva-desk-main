import type { ProjectWorkPlan, WorkPlanPhase } from '@ashniva/types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Glyph } from '../../../shared/components/glyph';
import { IconTile } from '../../../shared/components/Icon';
import { AppText, cardStyle } from '../../../shared/components/primitives';
import { animateLayout } from '../../../shared/theme/motion';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import type { CombineSelection } from './added-work';
import { levelOf, withLevel, type AssignmentDraft } from './assignment-draft';
import { AssigneeField, AssignmentSummary, developerById, PriorityField } from './AssignmentFields';
import { titleEstimateMinutes, titleIsCombinable } from './plan-helpers';
import { TitleBlock } from './TitleBlock';

/** A phase card: heading, how much of it is done, its assignment, and its topics. */
export function PhaseSection({
  plan,
  phase,
  index,
  assignment,
  onAssignment,
  canCombine,
  selection,
  onToggleCombine,
}: {
  plan: ProjectWorkPlan;
  phase: WorkPlanPhase;
  index: number;
  assignment: AssignmentDraft | null;
  onAssignment: (next: AssignmentDraft) => void;
  canCombine: boolean;
  selection: CombineSelection;
  onToggleCombine: (phaseId: string, titleId: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(true);
  const steps = phase.titles.flatMap((title) => title.points.filter((point) => !point.isError));
  const done = steps.filter((point) => point.completedAt).length;
  const minutes = phase.titles.reduce((sum, title) => sum + titleEstimateMinutes(title), 0);
  const combinableCount = phase.titles.filter(titleIsCombinable).length;
  const own = assignment ? levelOf(assignment, 'phases', phase.id) : null;

  return (
    <View style={[cardStyle(theme), { gap: theme.spacing.md }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Phase ${index + 1}: ${phase.heading}, ${done} of ${steps.length} done`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          animateLayout();
          setOpen((value) => !value);
        }}
        style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}
      >
        <IconTile
          name={done === steps.length && steps.length > 0 ? 'checkmark-done' : 'layers-outline'}
          tone={done === steps.length && steps.length > 0 ? 'success' : 'violet'}
          size={36}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" tone="muted" uppercase>
            Phase {index + 1}
          </AppText>
          <AppText variant="heading">{phase.heading}</AppText>
          <AppText size="xs" tone="muted" tabular>
            {done}/{steps.length} steps · {minutes} min
          </AppText>
        </View>
        <Glyph name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </Pressable>

      {open && plan.canAssign && assignment && own ? (
        <View style={{ gap: theme.spacing.sm }}>
          <AssigneeField
            label="Phase developer"
            developers={plan.developers}
            value={own.assignedToId}
            inherited={developerById(plan.developers, assignment.assignedToId)}
            clearLabel="Same as above"
            onChange={(assignedToId) =>
              onAssignment(withLevel(assignment, 'phases', phase.id, { assignedToId }))
            }
          />
          <PriorityField
            value={own.priority}
            inherited={assignment.priority}
            allowEmpty
            onChange={(priority) =>
              onAssignment(withLevel(assignment, 'phases', phase.id, { priority }))
            }
          />
        </View>
      ) : null}
      {open && !plan.canAssign ? (
        <AssignmentSummary assignee={phase.assignedTo} priority={phase.effectivePriority} />
      ) : null}

      {open
        ? phase.titles.map((title) => (
            <TitleBlock
              key={title.id}
              plan={plan}
              phaseId={phase.id}
              title={title}
              assignment={assignment}
              onAssignment={onAssignment}
              combinable={canCombine && combinableCount >= 2 && titleIsCombinable(title)}
              checked={selection.phaseId === phase.id && selection.titleIds.includes(title.id)}
              onToggleCombine={() => onToggleCombine(phase.id, title.id)}
            />
          ))
        : null}
    </View>
  );
}
