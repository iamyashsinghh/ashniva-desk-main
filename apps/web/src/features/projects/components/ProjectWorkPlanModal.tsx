import {
  type AddWorkPlanWorkInput,
  type ProjectWorkPlan,
  type WorkPlanExplainPreview,
  type WorkPlanPhaseInput,
} from '@ashniva/types';
import { Alert, Button, Modal } from '@ashniva/ui';
import { useEffect, useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { uploadFile } from '../../files/api';
import {
  describeAddedWork,
  emptyDraft,
  isDraftValid,
  toDraft,
  toSavePhases,
  type AddedWorkPlacement,
} from '../work-plan-layout';
import { useWorkPlanMutations, useWorkPlanQuery } from '../work-plan-api';
import { WorkPlanAddWorkPanel } from './WorkPlanAddWorkPanel';
import { WorkPlanEditor } from './WorkPlanEditor';
import {
  WorkPlanAssignWordsDialog,
  WorkPlanExplainDialog,
} from './WorkPlanExplainDialog';
import {
  assignmentDraftFrom,
  assignmentFingerprint,
  WorkPlanReader,
  type AssignmentDraft,
} from './WorkPlanReader';

import '../work-plan.css';

type ExplainStep = 'idle' | 'ask-words' | 'review';

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
  const {
    parse,
    save,
    start,
    submitTest,
    complete,
    fail,
    saveAssignments,
    explainPreview,
    explainApply,
    addWork,
    combineTitles,
  } = useWorkPlanMutations(projectId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState<WorkPlanPhaseInput[] | null>(null);
  const [assignDraft, setAssignDraft] = useState<AssignmentDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [placement, setPlacement] = useState<AddedWorkPlacement | null>(null);
  const [explainStep, setExplainStep] = useState<ExplainStep>('idle');
  const [explainPreviewData, setExplainPreviewData] = useState<WorkPlanExplainPreview | null>(
    null,
  );
  const [explainAttempt, setExplainAttempt] = useState(0);
  const [explainError, setExplainError] = useState<string | undefined>();
  const [aiHint, setAiHint] = useState<string | undefined>();

  const data = plan.data;
  const canEdit = Boolean(data?.canAssign);
  const pdfLocked = hasStartedWork(data);
  const showEditor = Boolean(canEdit && editing && draft);
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
    setDraft(data && data.phases.length === 0 ? emptyDraft() : toDraft(data?.phases ?? []));
  }, [canEdit, data, draft]);

  async function onUpload(file: File) {
    setError(undefined);
    setUploading(true);
    try {
      const uploaded = await uploadFile({ file, projectId });
      const next = await parse.mutateAsync({ fileId: uploaded.id });
      setDraft(toDraft(next.phases));
      setEditing(true);
      setPlacement(null);
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
      await save.mutateAsync({ phases: toSavePhases(draft) });
      setEditing(false);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function onAddWork(input: AddWorkPlanWorkInput) {
    setError(undefined);
    try {
      if (assignDirty) {
        await onSaveAssignments();
      }
      const previous = data?.phases ?? [];
      const next = await addWork.mutateAsync(input);
      setDraft(toDraft(next.phases));
      setEditing(false);
      setPlacement(describeAddedWork(previous, next.phases));
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }

  async function onReorder(phases: WorkPlanPhaseInput[]) {
    setError(undefined);
    try {
      if (assignDirty) {
        await onSaveAssignments();
      }
      await save.mutateAsync({ phases: toSavePhases(phases) });
      setDraft(phases);
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

  /** Save: ask AI only when configured; never rewrite without Yes. */
  function onSaveAssignmentsClick() {
    setError(undefined);
    setAiHint(undefined);
    if (!data?.canExplainWithAi) {
      void onSaveAssignments();
      return;
    }
    setExplainStep('ask-words');
  }

  async function loadExplainPreview(attempt: number) {
    setExplainError(undefined);
    setExplainAttempt(attempt);
    setExplainStep('review');
    try {
      const preview = await explainPreview.mutateAsync({ attempt });
      setExplainPreviewData(preview);
    } catch (cause) {
      setExplainError(errorMessage(cause));
    }
  }

  async function onExplainUpdate() {
    if (!explainPreviewData) {
      return;
    }
    setExplainError(undefined);
    try {
      await explainApply.mutateAsync({
        titles: explainPreviewData.titles.map((title) => ({
          id: title.id,
          title: title.title,
          points: title.points.map((point) => ({ id: point.id, body: point.body })),
        })),
      });
      setExplainStep('idle');
      setExplainPreviewData(null);
      setDraft(null);
      setAiHint(
        'AI wording is on the plan. Set times in Edit plan if needed, then press Save again for assignments.',
      );
    } catch (cause) {
      setExplainError(errorMessage(cause));
    }
  }

  async function onExplainKeepMine() {
    setExplainStep('idle');
    setExplainPreviewData(null);
    await onSaveAssignments();
  }

  return (
    <Modal
      open
      size="lg"
      title={`Summary · ${projectName}`}
      description="The developer presses Start, then Send to tester — that pauses leftover time. The tester marks Good or Error. Admin, project manager and team lead see extra time past the estimate, every send, and each tester error until Good."
      onClose={onClose}
      headerActions={
        canEdit && !showEditor ? (
          <>
            {data && data.phases.length > 0 ? (
              <Button
                variant="primary"
                size="sm"
                loading={
                  saveAssignments.isPending || explainPreview.isPending || explainApply.isPending
                }
                disabled={!assignDirty}
                disabledReason={!assignDirty ? 'Change an assignment to save it.' : undefined}
                onClick={onSaveAssignmentsClick}
              >
                Save
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => {
                setDraft(
                  data && data.phases.length === 0 ? emptyDraft() : toDraft(data?.phases ?? []),
                );
                setEditing(true);
              }}
            >
              {data && data.phases.length === 0 ? 'Add phase' : 'Edit plan'}
            </Button>
          </>
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
      {aiHint ? (
        <Alert tone="info" title={aiHint} dismissLabel="Dismiss" onDismiss={() => setAiHint(undefined)} />
      ) : null}
      {placement && placement.lines.length > 0 && !showEditor ? (
        <Alert
          tone="info"
          title="Added to this summary"
          dismissLabel="Dismiss where the work was placed"
          onDismiss={() => setPlacement(null)}
        >
          {placement.lines.join(' ')}. Drag a handle to move a phase, topic or step.
        </Alert>
      ) : null}

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

      {canEdit && !showEditor && data ? (
        <WorkPlanAddWorkPanel
          plan={data}
          busy={addWork.isPending || saveAssignments.isPending || save.isPending}
          onAdd={onAddWork}
        />
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
        <WorkPlanEditor draft={draft} onChange={setDraft} />
      ) : (
        <WorkPlanReader
          plan={data}
          busy={
            start.isPending ||
            submitTest.isPending ||
            complete.isPending ||
            fail.isPending ||
            saveAssignments.isPending ||
            explainPreview.isPending ||
            explainApply.isPending ||
            addWork.isPending ||
            save.isPending ||
            combineTitles.isPending
          }
          assignment={liveAssign}
          placement={placement}
          onAssignmentChange={setAssignDraft}
          onReorder={canEdit ? (phases) => void onReorder(phases) : undefined}
          onMoveError={setError}
          onCombineTitles={(phaseId, titleIds) => {
            setError(undefined);
            void combineTitles
              .mutateAsync({ phaseId, titleIds })
              .then(() => {
                setPlacement(null);
              })
              .catch((cause) => setError(errorMessage(cause)));
          }}
          onStart={(id) => {
            setError(undefined);
            void start.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
          onSubmitTest={(id) => {
            setError(undefined);
            void submitTest.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
          onPass={(id) => {
            setError(undefined);
            void complete.mutateAsync(id).catch((cause) => setError(errorMessage(cause)));
          }}
          onFail={async (id, body, fileId) => {
            await fail.mutateAsync({ pointId: id, body, fileId });
          }}
        />
      )}

      {explainStep === 'ask-words' ? (
        <WorkPlanAssignWordsDialog
          onYes={() => void loadExplainPreview(0)}
          onNo={() => {
            setExplainStep('idle');
            void onSaveAssignments();
          }}
          onClose={() => setExplainStep('idle')}
        />
      ) : null}

      {explainStep === 'review' ? (
        <WorkPlanExplainDialog
          preview={explainPreviewData}
          loading={explainPreview.isPending || explainApply.isPending}
          error={explainError}
          onUpdate={() => void onExplainUpdate()}
          onKeepMine={() => void onExplainKeepMine()}
          onRetry={() => void loadExplainPreview(explainAttempt + 1)}
          onClose={() => {
            setExplainStep('idle');
            setExplainPreviewData(null);
            setExplainError(undefined);
          }}
        />
      ) : null}
    </Modal>
  );
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
