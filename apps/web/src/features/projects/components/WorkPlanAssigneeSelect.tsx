import {
  PRIORITY,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  WORK_PLAN_ASSIGN_SCOPE,
  type AssignWorkPlanInput,
  type Priority,
  type UserRef,
} from '@ashniva/types';
import { FormField, Select } from '@ashniva/ui';

export function WorkPlanAssigneeSelect({
  label,
  hint,
  developers,
  value,
  inherited,
  canAssign,
  busy,
  onAssign,
}: {
  label: string;
  hint?: string;
  developers: UserRef[];
  value: string | null;
  inherited?: UserRef | null;
  canAssign: boolean;
  busy: boolean;
  onAssign: (assignedToId: string | null) => void;
}) {
  if (!canAssign) {
    const person = developers.find((user) => user.id === value) ?? inherited;
    if (!person) {
      return null;
    }
    return (
      <p className="work-plan__assignee-read">
        {label}: {person.name}
      </p>
    );
  }
  if (developers.length === 0) {
    return (
      <p className="work-plan__assignee-read">Add developers to this project to assign work.</p>
    );
  }
  const inheritedHint =
    !value && inherited ? `Using ${inherited.name} from a broader assignment.` : hint;
  return (
    <FormField label={label} hint={inheritedHint}>
      <Select
        value={value ?? ''}
        disabled={busy}
        onChange={(event) => onAssign(event.target.value || null)}
        options={[
          { value: '', label: 'Unassigned' },
          ...developers.map((user) => ({ value: user.id, label: user.name })),
        ]}
      />
    </FormField>
  );
}

export function WorkPlanPrioritySelect({
  value,
  inherited,
  busy,
  canAssign,
  allowEmpty = false,
  label = 'Priority',
  onChange,
}: {
  value: Priority | null;
  inherited?: Priority | null;
  busy: boolean;
  canAssign: boolean;
  allowEmpty?: boolean;
  label?: string;
  onChange: (priority: Priority | null) => void;
}) {
  const shown = value ?? inherited ?? PRIORITY.MEDIUM;
  if (!canAssign) {
    return <p className="work-plan__assignee-read">Priority: {PRIORITY_LABELS[shown]}</p>;
  }
  const inheritedHint =
    allowEmpty && !value && inherited
      ? `Using ${PRIORITY_LABELS[inherited]} from a broader assignment.`
      : undefined;
  return (
    <FormField label={label} hint={inheritedHint}>
      <Select
        value={value ?? ''}
        disabled={busy}
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value;
          if (!next) {
            onChange(null);
            return;
          }
          if ((PRIORITY_ORDER as readonly string[]).includes(next)) {
            onChange(next as Priority);
          }
        }}
        options={[
          ...(allowEmpty ? [{ value: '', label: 'Same as above' }] : []),
          ...PRIORITY_ORDER.map((priority) => ({
            value: priority,
            label: PRIORITY_LABELS[priority],
          })),
        ]}
      />
    </FormField>
  );
}

export function assignScope(
  scope: AssignWorkPlanInput['scope'],
  assignedToId: string | null,
  ids: { phaseId?: string; titleId?: string } = {},
): AssignWorkPlanInput {
  return {
    scope,
    assignedToId,
    ...(scope === WORK_PLAN_ASSIGN_SCOPE.PHASE || scope === WORK_PLAN_ASSIGN_SCOPE.TITLE
      ? { phaseId: ids.phaseId }
      : {}),
    ...(scope === WORK_PLAN_ASSIGN_SCOPE.TITLE ? { titleId: ids.titleId } : {}),
  };
}
