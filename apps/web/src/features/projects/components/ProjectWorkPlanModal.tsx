import {
  PRIORITY,
  WORK_PLAN_DEFAULT_ESTIMATE_MINUTES,
  WORK_PLAN_NOTE_KIND_LABELS,
  WORK_PLAN_POINT_STATUS_LABELS,
  type Priority,
  type ProjectWorkPlan,
  type WorkPlanNote,
  type WorkPlanPhaseInput,
  type WorkPlanPoint,
} from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, PriorityDot, Textarea } from '@ashniva/ui';
import { useEffect, useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { uploadFile } from '../../files/api';
import { useWorkPlanMutations, useWorkPlanQuery } from '../work-plan-api';
import { WorkPlanAssigneeSelect, WorkPlanPrioritySelect } from './WorkPlanAssigneeSelect';

import '../work-plan.css';

/**
 * Phase plan for one project: upload a PDF, edit phases by hand, start a point to run its
 * timer. Overruns lower that person's on-time % on this plan only.
 */
export function ProjectWorkPlanModal({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const plan = useWorkPlanQuery(projectId);
  const { parse, save, start, submitTest, startTest, complete, fail, reply, saveAssignments } =
    useWorkPlanMutations(projectId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState<WorkPlanPhaseInput[] | null>(null);
  const [assignDraft, setAssignDraft] = useState<AssignmentDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const data = plan.data;
  const canEdit = Boolean(data?.canAssign);
  const pdfLocked = hasStartedWork(data);
  const showEditor = Boolean(canEdit && editing && draft);
  const startedIds = startedPointIds(data);
  const assignmentKey = data?.canAssign ? assignmentFingerprint(data) : '';
  const liveAssign = assignDraft ?? (data?.canAssign ? assignmentDraftFrom(data) : null);
  const assignDirty = Boolean(
    liveAssign && data && JSON.stringify(liveAssign) !== assignmentFingerprint(data),
  );

  useEffect(() => {
    if (!assignmentKey) {
      setAssignDraft(null);
      return;
    }
    setAssignDraft(JSON.parse(assignmentKey) as AssignmentDraft);
  }, [assignmentKey]);

  useEffect(() => {
    if (!canEdit || draft !== null) {
      return;
    }
    const next = data && data.phases.length === 0 ? emptyDraft() : toDraft(data?.phases ?? []);
    setDraft(next);
    if (data && data.phases.length === 0) {
      setEditing(true);
    }
  }, [canEdit, data, draft]);

  async function onUpload(file: File) {
    setError(undefined);
    setUploading(true);
    try {
      const uploaded = await uploadFile({ file, projectId });
      const next = await parse.mutateAsync({ fileId: uploaded.id });
      setDraft(toDraft(next.phases));
      setEditing(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (!draft || !isDraftValid(draft)) {
      return;
    }
    setError(undefined);
    try {
      await save.mutateAsync({ phases: draft });
      setEditing(false);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function onSaveAssignments() {
    if (!data || !liveAssign) {
      return;
    }
    setError(undefined);
    try {
      await saveAssignments.mutateAsync({
        assignedToId: liveAssign.assignedToId,
        priority: liveAssign.priority,
        phases: data.phases.map((phase) => ({
          id: phase.id,
          assignedToId: liveAssign.phases[phase.id]?.assignedToId ?? null,
          priority: liveAssign.phases[phase.id]?.priority ?? null,
        })),
        titles: data.phases.flatMap((phase) =>
          phase.titles.map((title) => ({
            id: title.id,
            assignedToId: liveAssign.titles[title.id]?.assignedToId ?? null,
            priority: liveAssign.titles[title.id]?.priority ?? null,
          })),
        ),
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={`Summary · ${projectName}`}
      description="Phases stay on this project's team. The developer presses Start, then Send to tester. The tester then presses Start testing. The timer keeps running until Complete."
      onClose={onClose}
      headerActions={
        data?.canAssign && !showEditor && data.phases.length > 0 ? (
          <Button
            variant="primary"
            size="sm"
            loading={saveAssignments.isPending}
            disabled={!assignDirty}
            disabledReason={!assignDirty ? 'Change an assignment to save it.' : undefined}
            onClick={() => void onSaveAssignments()}
          >
            Save
          </Button>
        ) : null
      }
      footer={
        showEditor ? (
          <>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft || !isDraftValid(draft)}
              disabledReason={
                draft && isDraftValid(draft)
                  ? undefined
                  : 'Every phase needs a heading, a title, and at least one point with text and time.'
              }
              onClick={() => void onSave()}
            >
              Save plan
            </Button>
          </>
        ) : undefined
      }
    >
      {plan.isError ? <Alert tone="danger">{errorMessage(plan.error)}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {canEdit ? (
        <div className="work-plan__upload">
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploading || parse.isPending || pdfLocked}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onUpload(file);
              }
              event.target.value = '';
            }}
          />
          <div className="work-plan__upload-copy">
            <strong>Upload PDF</strong>
            <span>
              {pdfLocked
                ? 'Someone has already started, so a PDF cannot replace this plan. Edit or add phases by hand instead.'
                : 'AI reads the brief and divides it into phases. You can still edit every heading, title and point.'}
            </span>
          </div>
          <Button
            size="sm"
            loading={uploading || parse.isPending}
            disabled={pdfLocked}
            disabledReason={pdfLocked ? 'Started points cannot be replaced by a PDF.' : undefined}
            onClick={() => fileInput.current?.click()}
          >
            Choose PDF
          </Button>
        </div>
      ) : null}

      {data && data.scores.length > 0 ? (
        <ul className="work-plan__scores" aria-label="On-time percentage for this plan">
          {data.scores.map((score) => (
            <li key={score.user.id} className="work-plan__score">
              {score.user.name}
              <b>{score.percent}%</b>
            </li>
          ))}
        </ul>
      ) : null}

      {plan.isLoading || !data ? (
        <p className="muted">Loading the plan…</p>
      ) : showEditor && draft ? (
        <Editor draft={draft} startedIds={startedIds} onChange={setDraft} />
      ) : (
        <Reader
          plan={data}
          busy={
            start.isPending ||
            submitTest.isPending ||
            startTest.isPending ||
            complete.isPending ||
            fail.isPending ||
            reply.isPending ||
            saveAssignments.isPending
          }
          assignment={liveAssign}
          onAssignmentChange={setAssignDraft}
          onEdit={
            canEdit
              ? () => {
                  setDraft(data.phases.length === 0 ? emptyDraft() : toDraft(data.phases));
                  setEditing(true);
                }
              : undefined
          }
          onStart={(id) => {
            setError(undefined);
            void start.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
          onSubmitTest={(id) => {
            setError(undefined);
            void submitTest.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
          onStartTest={(id) => {
            setError(undefined);
            void startTest.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
          onPass={(id) => {
            setError(undefined);
            void complete.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
          onFail={(id, body) => {
            setError(undefined);
            void fail
              .mutateAsync({ pointId: id, body })
              .catch((cause) => setError(errorMessage(cause)));
          }}
          onReply={(pointId, noteId, body) => {
            setError(undefined);
            void reply
              .mutateAsync({ pointId, noteId, body })
              .catch((cause) => setError(errorMessage(cause)));
          }}
        />
      )}
    </Modal>
  );
}

function Editor({
  draft,
  startedIds,
  onChange,
}: {
  draft: WorkPlanPhaseInput[];
  startedIds: Set<string>;
  onChange: (next: WorkPlanPhaseInput[]) => void;
}) {
  function setPhase(index: number, patch: Partial<WorkPlanPhaseInput>) {
    onChange(draft.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)));
  }

  return (
    <div className="work-plan">
      {draft.map((phase, phaseIndex) => {
        const phaseStarted = draftHasStarted(phase, startedIds);
        return (
          <section key={phase.id ?? `phase-${phaseIndex}`} className="work-plan__phase">
            <div className="work-plan__phase-head">
              <FormField label="Phase heading">
                <Input
                  value={phase.heading}
                  onChange={(event) => setPhase(phaseIndex, { heading: event.target.value })}
                />
              </FormField>
              <Button
                size="sm"
                variant="ghost"
                disabled={phaseStarted}
                disabledReason={
                  phaseStarted ? 'This phase has started work, so it stays in the plan.' : undefined
                }
                onClick={() => onChange(draft.filter((_, i) => i !== phaseIndex))}
              >
                Remove phase
              </Button>
            </div>
            {phase.titles.map((title, titleIndex) => {
              const titleStarted = titleHasStarted(title, startedIds);
              return (
                <div key={title.id ?? `title-${titleIndex}`} className="work-plan__title">
                  <div className="work-plan__title-head">
                    <FormField label="Title">
                      <Input
                        value={title.title}
                        onChange={(event) => {
                          const titles = phase.titles.map((row, i) =>
                            i === titleIndex ? { ...row, title: event.target.value } : row,
                          );
                          setPhase(phaseIndex, { titles });
                        }}
                      />
                    </FormField>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={titleStarted}
                      disabledReason={
                        titleStarted
                          ? 'This topic has started work, so it stays in the plan.'
                          : undefined
                      }
                      onClick={() =>
                        setPhase(phaseIndex, {
                          titles: phase.titles.filter((_, i) => i !== titleIndex),
                        })
                      }
                    >
                      Remove title
                    </Button>
                  </div>
                  <div className="work-plan__points">
                    <div className="work-plan__points-head">
                      <span>Point</span>
                      <span>Min</span>
                      <span className="sr-only">Actions</span>
                    </div>
                    {title.points.map((point, pointIndex) => (
                      <div key={point.id ?? `point-${pointIndex}`} className="work-plan__point-row">
                        <Textarea
                          rows={2}
                          aria-label={`Point ${pointIndex + 1}`}
                          placeholder="What this step covers"
                          value={point.body}
                          onChange={(event) => {
                            const points = title.points.map((row, i) =>
                              i === pointIndex ? { ...row, body: event.target.value } : row,
                            );
                            const titles = phase.titles.map((row, i) =>
                              i === titleIndex ? { ...row, points } : row,
                            );
                            setPhase(phaseIndex, { titles });
                          }}
                        />
                        <Input
                          className="work-plan__minutes"
                          type="number"
                          min={1}
                          aria-label={`Minutes for point ${pointIndex + 1}`}
                          value={point.estimateMinutes}
                          onChange={(event) => {
                            const points = title.points.map((row, i) =>
                              i === pointIndex
                                ? {
                                    ...row,
                                    estimateMinutes: Math.max(
                                      1,
                                      Math.floor(Number(event.target.value)) || 1,
                                    ),
                                  }
                                : row,
                            );
                            const titles = phase.titles.map((row, i) =>
                              i === titleIndex ? { ...row, points } : row,
                            );
                            setPhase(phaseIndex, { titles });
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={Boolean(point.id && startedIds.has(point.id))}
                          disabledReason={
                            point.id && startedIds.has(point.id)
                              ? 'This point has already started, so it stays in the plan.'
                              : undefined
                          }
                          onClick={() => {
                            const titles = phase.titles.map((row, i) =>
                              i === titleIndex
                                ? { ...row, points: row.points.filter((_, p) => p !== pointIndex) }
                                : row,
                            );
                            setPhase(phaseIndex, { titles });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="work-plan__add"
                    size="sm"
                    onClick={() => {
                      const titles = phase.titles.map((row, i) =>
                        i === titleIndex
                          ? {
                              ...row,
                              points: [
                                ...row.points,
                                { body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES },
                              ],
                            }
                          : row,
                      );
                      setPhase(phaseIndex, { titles });
                    }}
                  >
                    Add point
                  </Button>
                </div>
              );
            })}
            <Button
              className="work-plan__add"
              size="sm"
              onClick={() =>
                setPhase(phaseIndex, {
                  titles: [
                    ...phase.titles,
                    {
                      title: `Title ${phase.titles.length + 1}`,
                      points: [{ body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES }],
                    },
                  ],
                })
              }
            >
              Add title
            </Button>
          </section>
        );
      })}
      <Button
        className="work-plan__add"
        onClick={() =>
          onChange([
            ...draft,
            {
              heading: `Phase ${draft.length + 1}`,
              titles: [
                {
                  title: 'Title 1',
                  points: [{ body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES }],
                },
              ],
            },
          ])
        }
      >
        Add phase
      </Button>
    </div>
  );
}

function Reader({
  plan,
  busy,
  assignment,
  onAssignmentChange,
  onEdit,
  onStart,
  onSubmitTest,
  onStartTest,
  onPass,
  onFail,
  onReply,
}: {
  plan: ProjectWorkPlan;
  busy: boolean;
  assignment: AssignmentDraft | null;
  onAssignmentChange: (next: AssignmentDraft) => void;
  onEdit?: () => void;
  onStart: (pointId: string) => void;
  onSubmitTest: (pointId: string) => void;
  onStartTest: (pointId: string) => void;
  onPass: (pointId: string) => void;
  onFail: (pointId: string, body: string) => void;
  onReply: (pointId: string, noteId: string, body: string) => void;
}) {
  if (plan.phases.length === 0) {
    return (
      <div className="work-plan">
        <p className="work-plan__hint">
          {plan.canAssign
            ? 'Upload a PDF or add a phase by hand.'
            : plan.source
              ? 'Nothing is assigned to you yet.'
              : 'No phase plan yet. A manager will add it from Summary.'}
        </p>
        {onEdit ? (
          <Button className="work-plan__add" variant="primary" onClick={onEdit}>
            Add phase
          </Button>
        ) : null}
      </div>
    );
  }

  function patchAssignment(next: AssignmentDraft) {
    onAssignmentChange(next);
  }

  return (
    <div className="work-plan">
      <div className="work-plan__toolbar">
        <p className="work-plan__hint">
          {plan.canAssign
            ? 'Assign the whole project to one developer, or split phases and topics across the team. Press Save in the header when you are done. You can still edit or add phases after a developer has started. Developer starts the timer, then sends the point to the tester. The clock keeps running until Complete.'
            : 'Developer starts the timer, then sends the point to the tester. The clock keeps running until Complete.'}
        </p>
        {onEdit ? <Button onClick={onEdit}>Edit plan</Button> : null}
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
      {plan.phases.map((phase) => (
        <section key={phase.id} className="work-plan__phase">
          <div className="work-plan__read-head">
            <h3 className="work-plan__phase-name">{phase.heading}</h3>
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
          {phase.titles.map((title) => (
            <div key={title.id} className="work-plan__title">
              <div className="work-plan__read-head">
                <h4 className="work-plan__title-name">{title.title}</h4>
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
                            assignment.phases[phase.id]?.assignedToId ?? assignment.assignedToId,
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
                      inherited={phaseDraft(assignment, phase.id).priority ?? assignment.priority}
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
                  <PointRow
                    key={point.id}
                    point={point}
                    busy={busy}
                    onStart={() => onStart(point.id)}
                    onSubmitTest={() => onSubmitTest(point.id)}
                    onStartTest={() => onStartTest(point.id)}
                    onPass={() => onPass(point.id)}
                    onFail={(body) => onFail(point.id, body)}
                    onReply={(noteId, body) => onReply(point.id, noteId, body)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function PointRow({
  point,
  busy,
  onStart,
  onSubmitTest,
  onStartTest,
  onPass,
  onFail,
  onReply,
}: {
  point: WorkPlanPoint;
  busy: boolean;
  onStart: () => void;
  onSubmitTest: () => void;
  onStartTest: () => void;
  onPass: () => void;
  onFail: (body: string) => void;
  onReply: (noteId: string, body: string) => void;
}) {
  const remaining = useRemaining(point.dueAt, point.completedAt, point.remainingSeconds);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'fail' | { replyTo: string } | null>(null);

  function send() {
    const body = draft.trim();
    if (!body) {
      return;
    }
    if (mode === 'fail') {
      onFail(body);
    } else if (mode && typeof mode === 'object') {
      onReply(mode.replyTo, body);
    }
    setDraft('');
    setMode(null);
  }

  const replyTo = mode && typeof mode === 'object' ? mode.replyTo : null;

  return (
    <div className="work-plan__read-point">
      {point.body ? <p>{point.body}</p> : null}
      <div className="work-plan__read-meta">
        <span>{point.estimateMinutes} min</span>
        <span>{WORK_PLAN_POINT_STATUS_LABELS[point.status]}</span>
        {point.startedBy && point.startedAt ? <span>{point.startedBy.name}</span> : null}
        {point.startedAt && !point.completedAt ? (
          remaining === 0 || point.overdue ? (
            <span className="work-plan__timer work-plan__timer--late">Overdue</span>
          ) : (
            <span className="work-plan__timer">{formatClock(remaining)}</span>
          )
        ) : null}
        {point.completedAt ? <span className="work-plan__done">Done</span> : null}
        {point.canStart ? (
          <Button size="sm" loading={busy} onClick={onStart}>
            Start
          </Button>
        ) : null}
        {point.canSubmitTest ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onSubmitTest}>
            Send to tester
          </Button>
        ) : null}
        {point.canStartTest ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onStartTest}>
            Start testing
          </Button>
        ) : null}
        {point.canPass ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onPass}>
            Complete
          </Button>
        ) : null}
        {point.canFail ? (
          <Button size="sm" loading={busy} onClick={() => setMode('fail')}>
            Not complete
          </Button>
        ) : null}
      </div>
      {point.notes.length > 0 ? (
        <ul className="work-plan__notes">
          {point.notes.map((note) => (
            <li key={note.id}>
              <NoteLine note={note} />
              {note.replies.length > 0 ? (
                <ul className="work-plan__replies">
                  {note.replies.map((reply) => (
                    <li key={reply.id}>
                      <NoteLine note={reply} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {point.canReply ? (
                <Button size="sm" loading={busy} onClick={() => setMode({ replyTo: note.id })}>
                  Reply
                </Button>
              ) : null}
              {replyTo === note.id ? (
                <div className="work-plan__note-form">
                  <FormField
                    label="Reply"
                    hint="Developer and tester both see this thread. You can add as many replies as you need."
                  >
                    <Textarea
                      rows={3}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                  </FormField>
                  <div className="work-plan__note-actions">
                    <Button size="sm" onClick={() => setMode(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={send}>
                      Send
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {mode === 'fail' ? (
        <div className="work-plan__note-form">
          <FormField
            label="What is wrong?"
            hint="The developer sees this and the timer keeps running until you or the team lead mark it done."
          >
            <Textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </FormField>
          <div className="work-plan__note-actions">
            <Button size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NoteLine({ note }: { note: WorkPlanNote }) {
  return (
    <div className="work-plan__note-line">
      <b>
        {note.author.name} · {WORK_PLAN_NOTE_KIND_LABELS[note.kind]}
      </b>
      <span>{note.body}</span>
    </div>
  );
}

function useRemaining(dueAt: string | null, completedAt: string | null, initial: number): number {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    setSeconds(initial);
    if (!dueAt || completedAt) {
      return undefined;
    }
    const tick = () => {
      setSeconds(Math.max(0, Math.floor((new Date(dueAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [dueAt, completedAt, initial]);
  return seconds;
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function hasStartedWork(plan: ProjectWorkPlan | undefined): boolean {
  return startedPointIds(plan).size > 0;
}

function startedPointIds(plan: ProjectWorkPlan | undefined): Set<string> {
  const ids = new Set<string>();
  for (const phase of plan?.phases ?? []) {
    for (const title of phase.titles) {
      for (const point of title.points) {
        if (point.startedAt) {
          ids.add(point.id);
        }
      }
    }
  }
  return ids;
}

function titleHasStarted(
  title: WorkPlanPhaseInput['titles'][number],
  startedIds: Set<string>,
): boolean {
  return title.points.some((point) => Boolean(point.id && startedIds.has(point.id)));
}

function draftHasStarted(phase: WorkPlanPhaseInput, startedIds: Set<string>): boolean {
  return phase.titles.some((title) => titleHasStarted(title, startedIds));
}

function emptyDraft(): WorkPlanPhaseInput[] {
  return [
    {
      heading: 'Phase 1',
      titles: [
        {
          title: 'Title 1',
          points: [{ body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES }],
        },
      ],
    },
  ];
}

function isDraftValid(draft: WorkPlanPhaseInput[]): boolean {
  return (
    draft.length > 0 &&
    draft.every(
      (phase) =>
        phase.heading.trim().length > 0 &&
        phase.titles.length > 0 &&
        phase.titles.every(
          (title) =>
            title.title.trim().length > 0 &&
            title.points.length > 0 &&
            title.points.every(
              (point) => point.body.trim().length > 0 && point.estimateMinutes >= 1,
            ),
        ),
    )
  );
}

function toDraft(phases: ProjectWorkPlan['phases']): WorkPlanPhaseInput[] {
  if (phases.length === 0) {
    return emptyDraft();
  }
  return phases.map((phase) => ({
    id: phase.id,
    heading: phase.heading,
    titles: phase.titles.map((title) => ({
      id: title.id,
      title: title.title,
      points: title.points.map((point) => ({
        id: point.id,
        body: point.body ?? '',
        estimateMinutes: point.estimateMinutes,
      })),
    })),
  }));
}

type LevelAssignmentDraft = {
  assignedToId: string | null;
  priority: Priority | null;
};

type AssignmentDraft = {
  assignedToId: string | null;
  priority: Priority;
  phases: Record<string, LevelAssignmentDraft>;
  titles: Record<string, LevelAssignmentDraft>;
};

function assignmentDraftFrom(plan: ProjectWorkPlan): AssignmentDraft {
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

function phaseDraft(assignment: AssignmentDraft, phaseId: string): LevelAssignmentDraft {
  return assignment.phases[phaseId] ?? { assignedToId: null, priority: null };
}

function titleDraft(assignment: AssignmentDraft, titleId: string): LevelAssignmentDraft {
  return assignment.titles[titleId] ?? { assignedToId: null, priority: null };
}

function assignmentFingerprint(plan: ProjectWorkPlan): string {
  return JSON.stringify(assignmentDraftFrom(plan));
}

function developerById(
  developers: ProjectWorkPlan['developers'],
  id: string | null | undefined,
): ProjectWorkPlan['developers'][number] | undefined {
  return id ? developers.find((user) => user.id === id) : undefined;
}
