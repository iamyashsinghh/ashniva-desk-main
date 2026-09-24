import {
  PRIORITY,
  WORK_PLAN_POINT_STATUS,
  type Priority,
  type ProjectWorkPlan,
  type WorkPlanPhaseInput,
  type WorkPlanTitle,
} from '@ashniva/types';
import { Button, PriorityDot } from '@ashniva/ui';
import { useEffect, useRef, useState, type DragEvent } from 'react';

import {
  canAcceptDrop,
  moveWorkPlanDraft,
  toDraft,
  type AddedWorkPlacement,
  type WorkPlanDragItem,
  type WorkPlanDropTarget,
} from '../work-plan-layout';
import { WorkPlanAssigneeSelect, WorkPlanPrioritySelect } from './WorkPlanAssigneeSelect';
import { WorkPlanPointRow } from './WorkPlanPointRow';

export type LevelAssignmentDraft = {
  assignedToId: string | null;
  priority: Priority | null;
};

export type AssignmentDraft = {
  assignedToId: string | null;
  priority: Priority;
  phases: Record<string, LevelAssignmentDraft>;
  titles: Record<string, LevelAssignmentDraft>;
};

export function WorkPlanReader({
  plan,
  busy,
  assignment,
  placement,
  onAssignmentChange,
  onReorder,
  onMoveError,
  onCombineTitles,
  onStart,
  onSubmitTest,
  onPass,
  onFail,
}: {
  plan: ProjectWorkPlan;
  busy: boolean;
  assignment: AssignmentDraft | null;
  placement?: AddedWorkPlacement | null;
  onAssignmentChange: (next: AssignmentDraft) => void;
  onReorder?: (phases: WorkPlanPhaseInput[]) => void;
  onMoveError?: (reason: string) => void;
  onCombineTitles?: (phaseId: string, titleIds: string[]) => void;
  onStart: (pointId: string) => void;
  onSubmitTest: (pointId: string) => void;
  onPass: (pointId: string) => void;
  onFail: (pointId: string, body: string, fileId?: string) => Promise<void> | void;
}) {
  const canReorder = Boolean(plan.canAssign && onReorder);
  const canCombine = Boolean((plan.canAssign || plan.canWork) && onCombineTitles);
  const [over, setOver] = useState<WorkPlanDropTarget | null>(null);
  const [combinePhaseId, setCombinePhaseId] = useState<string | null>(null);
  const [selectedTitleIds, setSelectedTitleIds] = useState<string[]>([]);
  const draggingRef = useRef<WorkPlanDragItem | null>(null);

  function setDragItem(item: WorkPlanDragItem | null) {
    draggingRef.current = item;
    if (!item) {
      setOver(null);
    }
  }

  useEffect(() => {
    if (!placement?.firstId) {
      return;
    }
    const node = document.querySelector(`[data-work-plan-id="${cssEscape(placement.firstId)}"]`);
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [placement?.firstId]);

  useEffect(() => {
    const alive = new Set(plan.phases.flatMap((phase) => phase.titles.map((title) => title.id)));
    setSelectedTitleIds((ids) => ids.filter((id) => alive.has(id)));
  }, [plan]);

  if (plan.phases.length === 0) {
    return (
      <div className="work-plan">
        <p className="work-plan__hint">
          {plan.canAssign
            ? 'Use Add phase in the header, or describe extra work below and AI will add related steps here.'
            : plan.source
              ? 'Nothing is assigned to you yet.'
              : 'No phase plan yet. A manager will add it from Summary.'}
        </p>
      </div>
    );
  }

  function patchAssignment(next: AssignmentDraft) {
    onAssignmentChange(next);
  }

  function toggleTitle(phaseId: string, titleId: string) {
    if (combinePhaseId && combinePhaseId !== phaseId) {
      setCombinePhaseId(phaseId);
      setSelectedTitleIds([titleId]);
      return;
    }
    setCombinePhaseId(phaseId);
    setSelectedTitleIds((ids) =>
      ids.includes(titleId) ? ids.filter((id) => id !== titleId) : [...ids, titleId],
    );
  }

  const selectedMinutes =
    combinePhaseId == null
      ? 0
      : (plan.phases
          .find((phase) => phase.id === combinePhaseId)
          ?.titles.filter((title) => selectedTitleIds.includes(title.id))
          .reduce((sum, title) => sum + titleEstimateMinutes(title), 0) ?? 0);

  function dropOn(target: WorkPlanDropTarget, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const item = draggingRef.current ?? readDragItem(event);
    setOver(null);
    setDragItem(null);
    if (!item || !onReorder || !canAcceptDrop(item, target)) {
      return;
    }
    const moved = moveWorkPlanDraft(toDraft(plan.phases), item, target);
    if (moved.ok) {
      onReorder(moved.phases);
      return;
    }
    onMoveError?.(moved.reason);
  }

  function hover(target: WorkPlanDropTarget, event: DragEvent<HTMLElement>) {
    const item = draggingRef.current;
    if (!item || !canAcceptDrop(item, target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const at = target.at === 'inside' ? 'inside' : edgeFromY(event);
    const next = { ...target, at } as WorkPlanDropTarget;
    if (over?.kind !== next.kind || JSON.stringify(over) !== JSON.stringify(next)) {
      setOver(next);
    }
  }

  return (
    <div className="work-plan">
      <div className="work-plan__toolbar">
        <p className="work-plan__hint">
          {plan.canAssign
            ? 'Assign the whole project, or split phases and topics. Drag handles to reorder. Tick topics in the same phase and press Combine to merge their minutes into one topic. Press Save in the header for assignments.'
            : canCombine
              ? 'Tick topics in the same phase that you want to do together, then Combine — their minutes add into one topic. Start the timer, then send the point to the tester.'
              : 'Developer starts the timer, then sends the point to the tester. The clock keeps running until Complete.'}
        </p>
        <div className="work-plan__toolbar-actions">
          {canCombine && selectedTitleIds.length >= 2 && combinePhaseId ? (
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => onCombineTitles?.(combinePhaseId, selectedTitleIds)}
            >
              Combine {selectedTitleIds.length} topics · {selectedMinutes} min
            </Button>
          ) : null}
          {canCombine && selectedTitleIds.length > 0 ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setSelectedTitleIds([]);
                setCombinePhaseId(null);
              }}
            >
              Clear selection
            </Button>
          ) : null}
        </div>
      </div>
      {plan.canAssign && assignment ? (
        <div className="work-plan__assign-row">
          <WorkPlanAssigneeSelect
            label="Whole project"
            hint="Gives every phase and topic to this person. Phase and topic picks still override it."
            developers={plan.developers}
            value={assignment.assignedToId}
            canAssign
            busy={busy}
            onAssign={(assignedToId) => patchAssignment({ ...assignment, assignedToId })}
          />
          <WorkPlanPrioritySelect
            value={assignment.priority}
            canAssign
            busy={busy}
            onChange={(priority) =>
              patchAssignment({ ...assignment, priority: priority ?? PRIORITY.MEDIUM })
            }
          />
        </div>
      ) : null}
      {plan.phases.map((phase) => {
        const phaseHighlight = Boolean(placement?.phaseIds.includes(phase.id));
        const phaseDrop = dropClass(over, { kind: 'phase', phaseId: phase.id });
        const phaseCanCombine =
          canCombine && phase.titles.filter((title) => titleIsCombinable(title)).length >= 2;
        return (
          <section
            key={phase.id}
            className={[
              'work-plan__phase',
              phaseHighlight ? 'work-plan__just-added' : '',
              phaseDrop,
            ]
              .filter(Boolean)
              .join(' ')}
            data-work-plan-id={phase.id}
            onDragOver={(event) =>
              hover(
                {
                  kind: draggingRef.current?.kind === 'title' ? 'phase' : 'phase',
                  phaseId: phase.id,
                  at: draggingRef.current?.kind === 'title' ? 'inside' : 'before',
                },
                event,
              )
            }
            onDrop={(event) =>
              dropOn(
                over?.kind === 'phase' && over.phaseId === phase.id
                  ? over
                  : {
                      kind: 'phase',
                      phaseId: phase.id,
                      at: draggingRef.current?.kind === 'title' ? 'inside' : 'after',
                    },
                event,
              )
            }
          >
            {phaseHighlight ? <p className="work-plan__placed">Just added here</p> : null}
            <div className="work-plan__read-head">
              <div className="work-plan__name-row">
                {canReorder ? (
                  <DragHandle
                    label={`Move phase ${phase.heading}`}
                    disabled={busy}
                    item={{ kind: 'phase', phaseId: phase.id }}
                    onDragStart={setDragItem}
                    onDragEnd={() => {
                      setDragItem(null);
                      setOver(null);
                    }}
                  />
                ) : null}
                <h3 className="work-plan__phase-name">{phase.heading}</h3>
              </div>
              {plan.canAssign && assignment ? (
                <div className="work-plan__assign-row">
                  <WorkPlanAssigneeSelect
                    label="Phase developer"
                    developers={plan.developers}
                    value={phaseDraft(assignment, phase.id).assignedToId}
                    inherited={developerById(plan.developers, assignment.assignedToId)}
                    canAssign
                    busy={busy}
                    onAssign={(assignedToId) =>
                      patchAssignment({
                        ...assignment,
                        phases: {
                          ...assignment.phases,
                          [phase.id]: { ...phaseDraft(assignment, phase.id), assignedToId },
                        },
                      })
                    }
                  />
                  <WorkPlanPrioritySelect
                    value={phaseDraft(assignment, phase.id).priority}
                    inherited={assignment.priority}
                    allowEmpty
                    canAssign
                    busy={busy}
                    onChange={(priority) =>
                      patchAssignment({
                        ...assignment,
                        phases: {
                          ...assignment.phases,
                          [phase.id]: { ...phaseDraft(assignment, phase.id), priority },
                        },
                      })
                    }
                  />
                </div>
              ) : (
                <PriorityDot priority={phase.effectivePriority} showLabel />
              )}
            </div>
            {phase.titles.map((title) => {
              const titleHighlight = Boolean(
                placement?.titleIds.includes(title.id) || phaseHighlight,
              );
              const combinable = phaseCanCombine && titleIsCombinable(title);
              const checked = selectedTitleIds.includes(title.id);
              return (
                <div
                  key={title.id}
                  className={[
                    'work-plan__title',
                    titleHighlight ? 'work-plan__just-added' : '',
                    checked ? 'work-plan__title--selected' : '',
                    dropClass(over, { kind: 'title', phaseId: phase.id, titleId: title.id }),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-work-plan-id={title.id}
                  onDragOver={(event) =>
                    hover(
                      {
                        kind: draggingRef.current?.kind === 'point' ? 'title' : 'title',
                        phaseId: phase.id,
                        titleId: title.id,
                        at: draggingRef.current?.kind === 'point' ? 'inside' : 'before',
                      },
                      event,
                    )
                  }
                  onDrop={(event) =>
                    dropOn(
                      over?.kind === 'title' && over.titleId === title.id
                        ? over
                        : {
                            kind: 'title',
                            phaseId: phase.id,
                            titleId: title.id,
                            at: draggingRef.current?.kind === 'point' ? 'inside' : 'after',
                          },
                      event,
                    )
                  }
                >
                  {placement?.titleIds.includes(title.id) && !phaseHighlight ? (
                    <p className="work-plan__placed">Just added here</p>
                  ) : null}
                  <div className="work-plan__read-head">
                    <div className="work-plan__name-row">
                      {combinable ? (
                        <label className="work-plan__combine-pick">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={() => toggleTitle(phase.id, title.id)}
                          />
                          <span className="sr-only">Combine {title.title}</span>
                        </label>
                      ) : null}
                      {canReorder ? (
                        <DragHandle
                          label={`Move topic ${title.title}`}
                          disabled={busy}
                          item={{ kind: 'title', phaseId: phase.id, titleId: title.id }}
                          onDragStart={setDragItem}
                          onDragEnd={() => {
                            setDragItem(null);
                            setOver(null);
                          }}
                        />
                      ) : null}
                      <h4 className="work-plan__title-name">{title.title}</h4>
                      <span className="work-plan__title-mins">{titleEstimateMinutes(title)} min</span>
                    </div>
                    <div className="work-plan__assign-row">
                      <WorkPlanAssigneeSelect
                        label={plan.canAssign ? 'Topic developer' : 'Assigned to'}
                        developers={plan.developers}
                        value={
                          plan.canAssign && assignment
                            ? titleDraft(assignment, title.id).assignedToId
                            : (title.effectiveAssignedTo?.id ?? null)
                        }
                        inherited={
                          plan.canAssign && assignment
                            ? developerById(
                                plan.developers,
                                assignment.phases[phase.id]?.assignedToId ??
                                  assignment.assignedToId,
                              )
                            : null
                        }
                        canAssign={plan.canAssign}
                        busy={busy}
                        onAssign={(assignedToId) =>
                          assignment &&
                          patchAssignment({
                            ...assignment,
                            titles: {
                              ...assignment.titles,
                              [title.id]: { ...titleDraft(assignment, title.id), assignedToId },
                            },
                          })
                        }
                      />
                      {plan.canAssign && assignment ? (
                        <WorkPlanPrioritySelect
                          value={titleDraft(assignment, title.id).priority}
                          inherited={
                            phaseDraft(assignment, phase.id).priority ?? assignment.priority
                          }
                          allowEmpty
                          canAssign
                          busy={busy}
                          onChange={(priority) =>
                            patchAssignment({
                              ...assignment,
                              titles: {
                                ...assignment.titles,
                                [title.id]: { ...titleDraft(assignment, title.id), priority },
                              },
                            })
                          }
                        />
                      ) : (
                        <PriorityDot priority={title.effectivePriority} showLabel />
                      )}
                    </div>
                  </div>
                  <div className="work-plan__points">
                    {title.points.map((point) => (
                      <WorkPlanPointRow
                        key={point.id}
                        point={point}
                        projectId={plan.projectId}
                        busy={busy}
                        highlighted={Boolean(placement?.pointIds.includes(point.id))}
                        dropClass={dropClass(over, {
                          kind: 'point',
                          phaseId: phase.id,
                          titleId: title.id,
                          pointId: point.id,
                        })}
                        showLeadLog={plan.canAssign}
                        dragHandle={
                          canReorder ? (
                            <DragHandle
                              label={`Move step ${point.body ?? 'hidden'}`}
                              disabled={busy}
                              item={{
                                kind: 'point',
                                phaseId: phase.id,
                                titleId: title.id,
                                pointId: point.id,
                              }}
                              onDragStart={setDragItem}
                              onDragEnd={() => {
                                setDragItem(null);
                                setOver(null);
                              }}
                            />
                          ) : null
                        }
                        onDragOver={(event) =>
                          hover(
                            {
                              kind: 'point',
                              phaseId: phase.id,
                              titleId: title.id,
                              pointId: point.id,
                              at: 'before',
                            },
                            event,
                          )
                        }
                        onDrop={(event) =>
                          dropOn(
                            over?.kind === 'point' && over.pointId === point.id
                              ? over
                              : {
                                  kind: 'point',
                                  phaseId: phase.id,
                                  titleId: title.id,
                                  pointId: point.id,
                                  at: 'after',
                                },
                            event,
                          )
                        }
                        onStart={() => onStart(point.id)}
                        onSubmitTest={() => onSubmitTest(point.id)}
                        onPass={() => onPass(point.id)}
                        onFail={(body, fileId) => onFail(point.id, body, fileId)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function titleEstimateMinutes(title: WorkPlanTitle): number {
  return title.points
    .filter((point) => !point.isError)
    .reduce((sum, point) => sum + point.estimateMinutes, 0);
}

function titleIsCombinable(title: WorkPlanTitle): boolean {
  return (
    title.points.length > 0 &&
    title.points.every(
      (point) =>
        !point.isError && !point.startedAt && point.status === WORK_PLAN_POINT_STATUS.PENDING,
    )
  );
}

function DragHandle({
  label,
  disabled,
  item,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  disabled: boolean;
  item: WorkPlanDragItem;
  onDragStart: (item: WorkPlanDragItem) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      className="work-plan__handle"
      aria-label={label}
      draggable={!disabled}
      disabled={disabled}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/json', JSON.stringify(item));
        event.dataTransfer.setData('text/plain', label);
        onDragStart(item);
      }}
      onDragEnd={onDragEnd}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}

function dropClass(over: WorkPlanDropTarget | null, node: WorkPlanDragItem): string {
  if (!over || over.kind !== node.kind) {
    return '';
  }
  if (over.kind === 'phase' && node.kind === 'phase' && over.phaseId === node.phaseId) {
    return over.at === 'inside' ? 'work-plan__drop-inside' : `work-plan__drop-${over.at}`;
  }
  if (over.kind === 'title' && node.kind === 'title' && over.titleId === node.titleId) {
    return over.at === 'inside' ? 'work-plan__drop-inside' : `work-plan__drop-${over.at}`;
  }
  if (over.kind === 'point' && node.kind === 'point' && over.pointId === node.pointId) {
    return `work-plan__drop-${over.at}`;
  }
  return '';
}

function edgeFromY(event: DragEvent<HTMLElement>): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function readDragItem(event: DragEvent<HTMLElement>): WorkPlanDragItem | null {
  const raw = event.dataTransfer.getData('application/json');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as WorkPlanDragItem;
  } catch {
    return null;
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

export function assignmentDraftFrom(plan: ProjectWorkPlan): AssignmentDraft {
  return {
    assignedToId: plan.assignedTo?.id ?? null,
    priority: plan.priority,
    phases: Object.fromEntries(
      plan.phases.map((phase) => [
        phase.id,
        { assignedToId: phase.assignedTo?.id ?? null, priority: phase.priority },
      ]),
    ),
    titles: Object.fromEntries(
      plan.phases.flatMap((phase) =>
        phase.titles.map((title) => [
          title.id,
          { assignedToId: title.assignedTo?.id ?? null, priority: title.priority },
        ]),
      ),
    ),
  };
}

export function assignmentFingerprint(plan: ProjectWorkPlan): string {
  return JSON.stringify(assignmentDraftFrom(plan));
}

function phaseDraft(assignment: AssignmentDraft, phaseId: string): LevelAssignmentDraft {
  return assignment.phases[phaseId] ?? { assignedToId: null, priority: null };
}

function titleDraft(assignment: AssignmentDraft, titleId: string): LevelAssignmentDraft {
  return assignment.titles[titleId] ?? { assignedToId: null, priority: null };
}

function developerById(
  developers: ProjectWorkPlan['developers'],
  id: string | null | undefined,
): ProjectWorkPlan['developers'][number] | undefined {
  return id ? developers.find((user) => user.id === id) : undefined;
}
