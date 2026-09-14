import {
  WORK_PLAN_DEFAULT_ESTIMATE_MINUTES,
  type ProjectWorkPlan,
  type WorkPlanPhaseInput,
  type WorkPlanPoint,
} from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Textarea } from '@ashniva/ui';
import { useEffect, useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { uploadFile } from '../../files/api';
import { useWorkPlanMutations, useWorkPlanQuery } from '../work-plan-api';

import '../work-plan.css';

/**
 * Phase plan for one project: upload a PDF, edit phases by hand, start a point to reveal it and
 * run its timer. Overruns lower that person's on-time % on this plan only.
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
  const { parse, save, start, complete } = useWorkPlanMutations(projectId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState<WorkPlanPhaseInput[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const data = plan.data;
  const locked = hasStartedWork(data);
  const showEditor = Boolean(data?.canManage && editing && draft && !locked);

  useEffect(() => {
    if (!data?.canManage || locked || draft !== null) {
      return;
    }
    const next = data.phases.length === 0 ? emptyDraft() : toDraft(data.phases);
    setDraft(next);
    if (data.phases.length === 0) {
      setEditing(true);
    }
  }, [data, draft, locked]);

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

  return (
    <Modal
      open
      size="lg"
      title={`Summary · ${projectName}`}
      description="Split the brief into phases, titles and timed points. Start reveals a point and starts its timer."
      onClose={onClose}
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

      {data?.canManage ? (
        <div className="work-plan__upload">
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploading || parse.isPending || locked}
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
              {locked
                ? 'This plan already has started work, so the brief cannot be replaced.'
                : 'AI reads the brief and divides it into phases. You can still edit every heading, title and point.'}
            </span>
          </div>
          <Button
            size="sm"
            loading={uploading || parse.isPending}
            disabled={locked}
            disabledReason={locked ? 'Started points cannot be rewritten.' : undefined}
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
        <Editor draft={draft} onChange={setDraft} />
      ) : (
        <Reader
          plan={data}
          busy={start.isPending || complete.isPending}
          onEdit={
            data.canManage && !locked
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
          onComplete={(id) => {
            setError(undefined);
            void complete.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
        />
      )}
    </Modal>
  );
}

function Editor({
  draft,
  onChange,
}: {
  draft: WorkPlanPhaseInput[];
  onChange: (next: WorkPlanPhaseInput[]) => void;
}) {
  function setPhase(index: number, patch: Partial<WorkPlanPhaseInput>) {
    onChange(draft.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)));
  }

  return (
    <div className="work-plan">
      {draft.map((phase, phaseIndex) => (
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
              onClick={() => onChange(draft.filter((_, i) => i !== phaseIndex))}
            >
              Remove phase
            </Button>
          </div>
          {phase.titles.map((title, titleIndex) => (
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
          ))}
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
      ))}
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
  onEdit,
  onStart,
  onComplete,
}: {
  plan: ProjectWorkPlan;
  busy: boolean;
  onEdit?: () => void;
  onStart: (pointId: string) => void;
  onComplete: (pointId: string) => void;
}) {
  if (plan.phases.length === 0) {
    return (
      <div className="work-plan">
        <p className="work-plan__hint">
          {plan.canManage
            ? 'Upload a PDF or add a phase by hand.'
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

  return (
    <div className="work-plan">
      <div className="work-plan__toolbar">
        <p className="work-plan__hint">
          Points stay hidden until Start. Start also starts the timer. Missing the timer lowers
          that person&apos;s on-time % on this plan.
        </p>
        {onEdit ? <Button onClick={onEdit}>Edit plan</Button> : null}
      </div>
      {plan.phases.map((phase) => (
        <section key={phase.id} className="work-plan__phase">
          <h3 className="work-plan__phase-name">{phase.heading}</h3>
          {phase.titles.map((title) => (
            <div key={title.id} className="work-plan__title">
              <h4 className="work-plan__title-name">{title.title}</h4>
              <div className="work-plan__points">
                {title.points.map((point) => (
                  <PointRow
                    key={point.id}
                    point={point}
                    busy={busy}
                    onStart={() => onStart(point.id)}
                    onComplete={() => onComplete(point.id)}
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
  onComplete,
}: {
  point: WorkPlanPoint;
  busy: boolean;
  onStart: () => void;
  onComplete: () => void;
}) {
  const remaining = useRemaining(point.dueAt, point.completedAt, point.remainingSeconds);
  return (
    <div className="work-plan__read-point">
      {point.body ? <p>{point.body}</p> : <p className="work-plan__hidden">Hidden until Start</p>}
      <div className="work-plan__read-meta">
        <span>{point.estimateMinutes} min</span>
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
        {point.canComplete ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onComplete}>
            Complete
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function useRemaining(
  dueAt: string | null,
  completedAt: string | null,
  initial: number,
): number {
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
  return (
    plan?.phases.some((phase) =>
      phase.titles.some((title) => title.points.some((point) => point.startedAt)),
    ) ?? false
  );
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
