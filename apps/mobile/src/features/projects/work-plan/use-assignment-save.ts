import type { ProjectWorkPlan, WorkPlanExplainPreview } from '@ashniva/types';
import { useState } from 'react';

import { useAssignmentWrites } from './api';
import { toAssignmentsInput, type AssignmentDraft } from './assignment-draft';

export type ExplainStep = 'idle' | 'ask' | 'review';

const APPLIED_HINT =
  'AI wording is on the plan. Set times in Edit plan if needed, then press Save again for assignments.';

/**
 * Saving assignments, with the web's "Can we assign on my words?" gate in front of it.
 *
 * The question is only asked when the API says AI is configured (`canExplainWithAi`). No saves
 * the picks with exactly the manager's wording. Yes asks for a rewrite preview — nothing is saved
 * by the preview — and then: Update applies the new wording (assignments are still unsaved, so the
 * bar stays), Keep saves the picks without the rewrite, Retry asks again with a higher attempt so
 * the model varies its wording.
 */
export function useAssignmentSave(
  projectId: string,
  plan: ProjectWorkPlan | undefined,
  draft: AssignmentDraft | null,
  onSaved: () => void,
) {
  const writes = useAssignmentWrites(projectId);
  const [step, setStep] = useState<ExplainStep>('idle');
  const [preview, setPreview] = useState<WorkPlanExplainPreview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  const saveNow = async (): Promise<boolean> => {
    if (!plan || !draft) {
      return true;
    }
    const saved = await writes.saveAssignments.run(toAssignmentsInput(plan, draft));
    if (saved) {
      onSaved();
    }
    return saved !== null;
  };

  const loadPreview = async (next: number) => {
    setAttempt(next);
    setStep('review');
    const result = await writes.explainPreview.run({ attempt: next });
    if (result) {
      setPreview(result);
    }
  };

  const reset = () => {
    setStep('idle');
    setPreview(null);
    writes.explainPreview.reset();
    writes.explainApply.reset();
  };

  return {
    step,
    preview,
    hint,
    dismissHint: () => setHint(null),
    saving: writes.saveAssignments.busy,
    saveError: writes.saveAssignments.error,
    explainBusy: writes.explainPreview.busy || writes.explainApply.busy,
    explainError: writes.explainPreview.error ?? writes.explainApply.error,
    saveNow,
    /** The Save button. */
    start: () => {
      setHint(null);
      writes.saveAssignments.reset();
      if (plan?.canExplainWithAi) {
        setStep('ask');
        return;
      }
      void saveNow();
    },
    answerYes: () => void loadPreview(0),
    answerNo: () => {
      reset();
      void saveNow();
    },
    retry: () => void loadPreview(attempt + 1),
    update: async () => {
      if (!preview) {
        return;
      }
      const applied = await writes.explainApply.run({
        titles: preview.titles.map((title) => ({
          id: title.id,
          title: title.title,
          points: title.points.map((point) => ({ id: point.id, body: point.body })),
        })),
      });
      if (applied) {
        reset();
        setHint(APPLIED_HINT);
      }
    },
    keepMine: () => {
      reset();
      void saveNow();
    },
    close: reset,
  };
}
