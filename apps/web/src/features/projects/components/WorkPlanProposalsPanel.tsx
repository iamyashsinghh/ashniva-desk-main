import {
  type Priority,
  type ProjectWorkPlan,
  type UpdateWorkPlanProposalInput,
  type WorkPlanProposal,
} from '@ashniva/types';
import { Alert, Button, FormField, Input, Select, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useWorkPlanMutations, useWorkPlanProposalsQuery } from '../work-plan-api';
import { WorkPlanAssigneeSelect, WorkPlanPrioritySelect } from './WorkPlanAssigneeSelect';

const NEW_PHASE = '__new__';

type Draft = {
  title: string;
  /** Existing topic it was aimed at; dropped when the phase is changed. */
  titleId: string | null;
  originalPhaseId: string;
  phaseId: string;
  phaseHeading: string;
  points: { body: string; estimateMinutes: number }[];
  assignedToId: string | null;
  priority: Priority | null;
  dueDate: string;
  context: string;
};

/**
 * Work sent to this Summary from AI Memory. Nothing here is in the plan until an admin, project
 * manager or team lead publishes it (as sent or after editing); the rest of the team only sees it.
 */
export function WorkPlanProposalsPanel({
  projectId,
  plan,
}: {
  projectId: string;
  plan: ProjectWorkPlan;
}) {
  const proposals = useWorkPlanProposalsQuery(projectId);
  const items = proposals.data ?? [];
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="work-plan__proposals" aria-label="Waiting for approval">
      <div className="work-plan__upload-copy">
        <strong>Waiting for approval ({items.length})</strong>
        <span>
          {plan.canAssign
            ? 'Sent from AI Memory. Edit anything, then publish it into the Summary, or reject it.'
            : 'Sent from AI Memory. An admin, project manager or team lead will publish or reject it.'}
        </span>
      </div>
      {items.map((proposal) => (
        <ProposalCard key={proposal.id} projectId={projectId} plan={plan} proposal={proposal} />
      ))}
    </section>
  );
}

function ProposalCard({
  projectId,
  plan,
  proposal,
}: {
  projectId: string;
  plan: ProjectWorkPlan;
  proposal: WorkPlanProposal;
}) {
  const { publishProposal, rejectProposal, updateProposal } = useWorkPlanMutations(projectId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const busy = publishProposal.isPending || rejectProposal.isPending || updateProposal.isPending;
  const phaseName = placeLabel(plan, proposal);

  async function run(action: () => Promise<unknown>) {
    setError(undefined);
    try {
      await action();
      setDraft(null);
      setRejecting(false);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const draftReady =
    draft !== null &&
    draft.title.trim().length > 0 &&
    draft.points.some((point) => point.body.trim().length > 0) &&
    (draft.phaseId !== NEW_PHASE || draft.phaseHeading.trim().length > 0);

  return (
    <article className="work-plan__proposal">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {draft ? (
        <ProposalEditor plan={plan} draft={draft} busy={busy} onChange={setDraft} />
      ) : (
        <>
          <header className="work-plan__proposal-head">
            <strong>{proposal.title}</strong>
            <span className="muted">
              {phaseName}
              {proposal.assignedTo ? ` · ${proposal.assignedTo.name}` : ' · Unassigned'}
              {proposal.dueDate ? ` · due ${proposal.dueDate}` : ''}
              {proposal.createdBy ? ` · sent by ${proposal.createdBy.name}` : ''}
            </span>
          </header>
          <ul className="work-plan__proposal-points">
            {proposal.points.map((point, index) => (
              <li key={index}>
                {point.body} <span className="muted">({point.estimateMinutes} min)</span>
              </li>
            ))}
          </ul>
          {proposal.context ? (
            <p className="muted work-plan__proposal-context">{proposal.context}</p>
          ) : null}
        </>
      )}

      {rejecting ? (
        <FormField label="Why not? (optional)">
          <Textarea
            rows={2}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      ) : null}

      {proposal.canDecide && draft ? (
        <div className="work-plan__proposal-actions">
          <Button size="sm" disabled={busy} onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={updateProposal.isPending}
            disabled={!draftReady}
            disabledReason="Needs a title, a phase and at least one step."
            onClick={() =>
              void run(() => updateProposal.mutateAsync({ id: proposal.id, body: toInput(draft) }))
            }
          >
            Save edits
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={publishProposal.isPending}
            disabled={!draftReady}
            disabledReason="Needs a title, a phase and at least one step."
            onClick={() =>
              void run(() => publishProposal.mutateAsync({ id: proposal.id, body: toInput(draft) }))
            }
          >
            Publish
          </Button>
        </div>
      ) : null}

      {proposal.canDecide && !draft ? (
        <div className="work-plan__proposal-actions">
          {rejecting ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={rejectProposal.isPending}
                onClick={() =>
                  void run(() =>
                    rejectProposal.mutateAsync({
                      id: proposal.id,
                      body: note.trim() ? { note: note.trim() } : {},
                    }),
                  )
                }
              >
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </Button>
              <Button size="sm" disabled={busy} onClick={() => setDraft(toDraft(plan, proposal))}>
                Edit
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={publishProposal.isPending}
                onClick={() =>
                  void run(() => publishProposal.mutateAsync({ id: proposal.id, body: {} }))
                }
              >
                Publish
              </Button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function ProposalEditor({
  plan,
  draft,
  busy,
  onChange,
}: {
  plan: ProjectWorkPlan;
  draft: Draft;
  busy: boolean;
  onChange: (draft: Draft) => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="work-plan__add-work-fields">
      <FormField label="Title">
        <Input
          value={draft.title}
          disabled={busy}
          onChange={(e) => set({ title: e.target.value })}
        />
      </FormField>
      <FormField label="Phase" hint="Where it goes in the Summary.">
        <Select
          value={draft.phaseId}
          disabled={busy}
          onChange={(e) => set({ phaseId: e.target.value })}
          options={[
            ...plan.phases.map((phase) => ({ value: phase.id, label: phase.heading })),
            { value: NEW_PHASE, label: 'New phase…' },
          ]}
        />
      </FormField>
      {draft.phaseId === NEW_PHASE ? (
        <FormField label="New phase heading">
          <Input
            value={draft.phaseHeading}
            disabled={busy}
            onChange={(e) => set({ phaseHeading: e.target.value })}
          />
        </FormField>
      ) : null}
      <FormField label="Steps" hint="One step per row, with minutes.">
        <div className="work-plan__proposal-steps">
          {draft.points.map((point, index) => (
            <div key={index} className="work-plan__proposal-step">
              <Input
                aria-label={`Step ${index + 1}`}
                value={point.body}
                disabled={busy}
                onChange={(e) =>
                  set({
                    points: draft.points.map((p, i) =>
                      i === index ? { ...p, body: e.target.value } : p,
                    ),
                  })
                }
              />
              <Input
                aria-label={`Minutes for step ${index + 1}`}
                type="number"
                min={1}
                max={1440}
                step={5}
                value={point.estimateMinutes}
                disabled={busy}
                onChange={(e) =>
                  set({
                    points: draft.points.map((p, i) =>
                      i === index
                        ? {
                            ...p,
                            estimateMinutes: Math.min(
                              1440,
                              Math.max(1, Number(e.target.value) || 1),
                            ),
                          }
                        : p,
                    ),
                  })
                }
              />
              <Button
                size="sm"
                disabled={busy || draft.points.length === 1}
                onClick={() => set({ points: draft.points.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            disabled={busy || draft.points.length >= 40}
            onClick={() => set({ points: [...draft.points, { body: '', estimateMinutes: 30 }] })}
          >
            Add step
          </Button>
        </div>
      </FormField>
      <div className="work-plan__assign-row work-plan__proposal-assign">
        <WorkPlanAssigneeSelect
          label="Developer"
          hint="Optional. Only developers on this project."
          developers={plan.developers}
          value={draft.assignedToId}
          canAssign
          busy={busy}
          onAssign={(assignedToId) => set({ assignedToId })}
        />
        <WorkPlanPrioritySelect
          value={draft.priority}
          inherited={plan.priority}
          allowEmpty
          canAssign
          busy={busy}
          onChange={(priority) => set({ priority })}
        />
        <FormField label="Due date">
          <Input
            type="date"
            value={draft.dueDate}
            disabled={busy}
            onChange={(e) => set({ dueDate: e.target.value })}
          />
        </FormField>
      </div>
      <FormField label="Context" hint="What was said about it.">
        <Textarea
          rows={2}
          value={draft.context}
          disabled={busy}
          onChange={(e) => set({ context: e.target.value })}
        />
      </FormField>
    </div>
  );
}

function placeLabel(plan: ProjectWorkPlan, proposal: WorkPlanProposal): string {
  const phase = plan.phases.find((p) => p.id === proposal.phaseId);
  const title = phase?.titles.find((t) => t.id === proposal.titleId);
  if (phase && title) return `${phase.heading} › ${title.title}`;
  if (phase) return phase.heading;
  return proposal.phaseHeading?.trim() || 'General (new phase)';
}

function toDraft(plan: ProjectWorkPlan, proposal: WorkPlanProposal): Draft {
  const phase = plan.phases.find((p) => p.id === proposal.phaseId);
  const developer = plan.developers.some((d) => d.id === proposal.assignedTo?.id)
    ? (proposal.assignedTo?.id ?? null)
    : null;
  const titleId = phase?.titles.some((t) => t.id === proposal.titleId) ? proposal.titleId : null;
  return {
    title: proposal.title,
    titleId,
    originalPhaseId: phase ? phase.id : NEW_PHASE,
    phaseId: phase ? phase.id : NEW_PHASE,
    phaseHeading: phase ? '' : proposal.phaseHeading?.trim() || 'General',
    points: proposal.points.length ? proposal.points : [{ body: '', estimateMinutes: 30 }],
    assignedToId: developer,
    priority: proposal.priority,
    dueDate: proposal.dueDate ?? '',
    context: proposal.context ?? '',
  };
}

function toInput(draft: Draft): UpdateWorkPlanProposalInput {
  const newPhase = draft.phaseId === NEW_PHASE;
  return {
    title: draft.title.trim(),
    titleId: draft.phaseId === draft.originalPhaseId ? draft.titleId : null,
    phaseId: newPhase ? null : draft.phaseId,
    phaseHeading: newPhase ? draft.phaseHeading.trim() : null,
    points: draft.points
      .map((point) => ({ body: point.body.trim(), estimateMinutes: point.estimateMinutes }))
      .filter((point) => point.body.length > 0),
    assignedToId: draft.assignedToId,
    priority: draft.priority,
    dueDate: draft.dueDate || null,
    context: draft.context.trim() || null,
  };
}
