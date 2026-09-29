import type { ProjectWorkPlan, WorkPlanTitle } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { Icon } from '../../../shared/components/Icon';
import { AppText } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { levelOf, withLevel, type AssignmentDraft } from './assignment-draft';
import { AssigneeField, AssignmentSummary, developerById, PriorityField } from './AssignmentFields';
import { PointCard } from './PointCard';
import { titleEstimateMinutes } from './plan-helpers';

/** A topic: its name and minutes, who has it, and its steps. */
export function TitleBlock({
  plan,
  phaseId,
  title,
  assignment,
  onAssignment,
  combinable,
  checked,
  onToggleCombine,
}: {
  plan: ProjectWorkPlan;
  phaseId: string;
  title: WorkPlanTitle;
  assignment: AssignmentDraft | null;
  onAssignment: (next: AssignmentDraft) => void;
  combinable: boolean;
  checked: boolean;
  onToggleCombine: () => void;
}) {
  const theme = useTheme();
  const own = assignment ? levelOf(assignment, 'titles', title.id) : null;
  const phaseLevel = assignment ? levelOf(assignment, 'phases', phaseId) : null;

  return (
    <View
      style={{
        borderLeftColor: checked ? theme.colors.primary : theme.colors.border,
        borderLeftWidth: 3,
        gap: theme.spacing.sm,
        paddingLeft: theme.spacing.md,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        {combinable ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={`Combine ${title.title}`}
            accessibilityState={{ checked }}
            hitSlop={10}
            onPress={onToggleCombine}
          >
            <Icon
              name={checked ? 'checkbox' : 'square-outline'}
              size={22}
              color={checked ? theme.colors.primary : theme.colors.textFaint}
            />
          </Pressable>
        ) : null}
        <AppText weight="bold" style={{ flex: 1 }}>
          {title.title}
        </AppText>
        <View
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.pill,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: 2,
          }}
        >
          <AppText size="xs" tone="muted" tabular>
            {titleEstimateMinutes(title)} min
          </AppText>
        </View>
      </View>

      {plan.canAssign && assignment && own && phaseLevel ? (
        <View style={{ gap: theme.spacing.sm }}>
          <AssigneeField
            label="Topic developer"
            developers={plan.developers}
            value={own.assignedToId}
            inherited={developerById(
              plan.developers,
              phaseLevel.assignedToId ?? assignment.assignedToId,
            )}
            clearLabel="Same as above"
            onChange={(assignedToId) =>
              onAssignment(withLevel(assignment, 'titles', title.id, { assignedToId }))
            }
          />
          <PriorityField
            value={own.priority}
            inherited={phaseLevel.priority ?? assignment.priority}
            allowEmpty
            onChange={(priority) =>
              onAssignment(withLevel(assignment, 'titles', title.id, { priority }))
            }
          />
        </View>
      ) : (
        <AssignmentSummary
          assignee={title.effectiveAssignedTo}
          priority={title.effectivePriority}
        />
      )}

      <View style={{ gap: theme.spacing.sm }}>
        {title.points.map((point) => (
          <PointCard key={point.id} point={point} />
        ))}
      </View>
    </View>
  );
}
