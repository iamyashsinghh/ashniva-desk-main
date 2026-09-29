import type { AddWorkPlanWorkInput, ProjectWorkPlan, WorkPlanPhaseInput } from '@ashniva/types';
import { useState } from 'react';

import { addedWorkLines } from './added-work';
import { usePlanShapeWrites } from './api';
import { draftProblem, toDraft, toSavePhases } from './draft-editing';
import { usePdfImport } from './use-pdf-import';

/**
 * The editor's draft and the three ways it is replaced wholesale: a save, a PDF, and AI-added work.
 *
 * PDF and "Add work" are saved by the server as they run, so each one resets the draft to what
 * the server answered. "Add work" saves unsaved edits first — otherwise they would be lost under
 * the server's answer — and refuses while the draft cannot be saved.
 */
export function useEditorState(projectId: string, plan: ProjectWorkPlan | undefined) {
  const shape = usePlanShapeWrites(projectId);
  const [draft, setDraft] = useState<WorkPlanPhaseInput[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [placement, setPlacement] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);

  if (plan && draft === null) {
    setDraft(toDraft(plan.phases));
  }

  const replaceFrom = (next: ProjectWorkPlan) => {
    setDraft(toDraft(next.phases));
    setDirty(false);
  };

  const pdf = usePdfImport(projectId, shape.parse, (next) => {
    replaceFrom(next);
    setPlacement([]);
  });

  const problem = draft ? draftProblem(draft) : null;

  const save = async (): Promise<ProjectWorkPlan | null> => {
    if (!draft || problem) {
      return null;
    }
    const saved = await shape.save.run({ phases: toSavePhases(draft) });
    if (saved) {
      replaceFrom(saved);
    }
    return saved;
  };

  return {
    draft,
    dirty,
    problem,
    edit: (next: WorkPlanPhaseInput[]) => {
      setDraft(next);
      setDirty(true);
      setBlocked(null);
    },
    save,
    saving: shape.save.busy,
    saveError: shape.save.error,
    pdf,
    placement,
    dismissPlacement: () => setPlacement([]),
    addWorkBusy: shape.addWork.busy || shape.save.busy,
    addWorkError: blocked ?? shape.addWork.error ?? shape.save.error,
    addWork: async (input: AddWorkPlanWorkInput): Promise<boolean> => {
      setBlocked(null);
      let before = plan?.phases ?? [];
      if (dirty) {
        if (problem) {
          setBlocked(`Fix the plan before adding work: ${problem}`);
          return false;
        }
        const saved = await save();
        if (!saved) {
          return false;
        }
        before = saved.phases;
      }
      const result = await shape.addWork.run(input);
      if (!result) {
        return false;
      }
      setPlacement(addedWorkLines(before, result.phases));
      replaceFrom(result);
      return true;
    },
  };
}
