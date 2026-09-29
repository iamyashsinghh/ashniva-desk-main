import type { AddWorkPlanWorkInput, ProjectWorkPlan } from '@ashniva/types';
import { useState } from 'react';

import { addedWorkLines, NO_SELECTION, toggleCombine, type CombineSelection } from './added-work';
import { usePlanShapeWrites } from './api';
import {
  assignmentChanges,
  assignmentDraftFrom,
  assignmentKey,
  type AssignmentDraft,
} from './assignment-draft';
import { titleEstimateMinutes } from './plan-helpers';
import { useAssignmentSave } from './use-assignment-save';

/**
 * Everything Summary holds locally: unsaved assignment picks, the topics ticked for combining, and
 * where the last "Add work" landed.
 */
export function useSummaryState(projectId: string, plan: ProjectWorkPlan | undefined) {
  const shape = usePlanShapeWrites(projectId);
  const [draft, setDraft] = useState<AssignmentDraft | null>(null);
  const [seenKey, setSeenKey] = useState('');
  const [selection, setSelection] = useState<CombineSelection>(NO_SELECTION);
  const [combining, setCombining] = useState(false);
  const [addingWork, setAddingWork] = useState(false);
  const [placement, setPlacement] = useState<string[]>([]);

  // A change on the server (our save landing, or someone else's) replaces the local picks, as the
  // web does, so nobody saves over assignments they never saw.
  const serverKey = plan?.canAssign ? assignmentKey(plan) : '';
  if (serverKey !== seenKey) {
    setSeenKey(serverKey);
    setDraft(null);
  }

  const base = plan?.canAssign ? assignmentDraftFrom(plan) : null;
  const assignment = draft ?? base;
  const changes = base && draft ? assignmentChanges(base, draft) : 0;
  const save = useAssignmentSave(projectId, plan, changes > 0 ? draft : null, () => setDraft(null));

  const combinePhase = plan?.phases.find((phase) => phase.id === selection.phaseId) ?? null;
  const liveTitleIds = selection.titleIds.filter((id) =>
    combinePhase?.titles.some((title) => title.id === id),
  );
  const combineMinutes = (combinePhase?.titles ?? [])
    .filter((title) => liveTitleIds.includes(title.id))
    .reduce((sum, title) => sum + titleEstimateMinutes(title), 0);

  return {
    assignment,
    changes,
    setAssignment: setDraft,
    discardAssignments: () => setDraft(null),
    save,
    selection: { phaseId: combinePhase ? selection.phaseId : null, titleIds: liveTitleIds },
    combinePhase,
    combineMinutes,
    toggleCombine: (phaseId: string, titleId: string) =>
      setSelection((current) => toggleCombine(current, phaseId, titleId)),
    clearCombine: () => setSelection(NO_SELECTION),
    combining,
    setCombining,
    combineBusy: shape.combineTitles.busy,
    combineError: shape.combineTitles.error,
    applyCombine: async () => {
      if (!combinePhase || liveTitleIds.length < 2) {
        return;
      }
      const result = await shape.combineTitles.run({
        phaseId: combinePhase.id,
        titleIds: liveTitleIds,
      });
      if (result) {
        setSelection(NO_SELECTION);
        setCombining(false);
      }
    },
    addingWork,
    setAddingWork,
    addWorkBusy: shape.addWork.busy || save.saving,
    addWorkError: shape.addWork.error ?? save.saveError,
    placement,
    dismissPlacement: () => setPlacement([]),
    /** Unsaved picks are saved first, as on the web, so the new work is placed on the saved plan. */
    addWork: async (input: AddWorkPlanWorkInput): Promise<boolean> => {
      if (changes > 0 && !(await save.saveNow())) {
        return false;
      }
      const before = plan?.phases ?? [];
      const result = await shape.addWork.run(input);
      if (!result) {
        return false;
      }
      setPlacement(addedWorkLines(before, result.phases));
      return true;
    },
  };
}
