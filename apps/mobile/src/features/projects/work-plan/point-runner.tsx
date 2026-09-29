import { createContext, useContext, useState, type ReactNode } from 'react';

import { usePointWrites } from './api';

/**
 * The step buttons' shared state, provided once for the whole plan.
 *
 * One set of mutations for every point rather than five per card: the plan can hold hundreds of
 * steps. The runner remembers which point a press belongs to, so only that card spins and the
 * error is shown where the person tapped rather than at the top of a long scroll.
 */

export type SimplePointAction = 'start' | 'submitTest' | 'startTest' | 'complete';

export interface PointRunner {
  projectId: string;
  /** Admin / PM / TL: the plan-level `canAssign`, which is who the server sends the lead trail to. */
  showLeadLog: boolean;
  pendingPointId: string | null;
  failure: { pointId: string; message: string } | null;
  busy: boolean;
  run: (action: SimplePointAction, pointId: string) => void;
  returnPoint: (pointId: string, body: string, fileId?: string) => Promise<boolean>;
  returnError: string | null;
  returnBusy: boolean;
  addNote: (pointId: string, body: string) => Promise<boolean>;
  reply: (pointId: string, noteId: string, body: string) => Promise<boolean>;
  noteError: string | null;
  noteBusy: boolean;
  dismissFailure: () => void;
  /** A sheet reopened for another point should not greet it with the last point's error. */
  clearSheetErrors: () => void;
}

const PointRunnerContext = createContext<PointRunner | null>(null);

export function PointRunnerProvider({
  projectId,
  showLeadLog,
  children,
}: {
  projectId: string;
  showLeadLog: boolean;
  children: ReactNode;
}) {
  const writes = usePointWrites(projectId);
  const [pendingPointId, setPendingPointId] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ pointId: string; action: SimplePointAction } | null>(null);
  const failureMessage = failed ? writes[failed.action].error : null;

  const runner: PointRunner = {
    projectId,
    showLeadLog,
    pendingPointId,
    failure: failed && failureMessage ? { pointId: failed.pointId, message: failureMessage } : null,
    busy:
      writes.start.busy ||
      writes.submitTest.busy ||
      writes.startTest.busy ||
      writes.complete.busy ||
      writes.fail.busy,
    run: (action, pointId) => {
      setFailed(null);
      setPendingPointId(pointId);
      void writes[action].run(pointId).then((result) => {
        setPendingPointId(null);
        if (result === null) {
          setFailed({ pointId, action });
        }
      });
    },
    returnPoint: async (pointId, body, fileId) =>
      (await writes.fail.run({ pointId, body, ...(fileId ? { fileId } : {}) })) !== null,
    returnError: writes.fail.error,
    returnBusy: writes.fail.busy,
    addNote: async (pointId, body) => (await writes.addNote.run({ pointId, body })) !== null,
    reply: async (pointId, noteId, body) =>
      (await writes.reply.run({ pointId, noteId, body })) !== null,
    noteError: writes.addNote.error ?? writes.reply.error,
    noteBusy: writes.addNote.busy || writes.reply.busy,
    dismissFailure: () => setFailed(null),
    clearSheetErrors: () => {
      writes.fail.reset();
      writes.addNote.reset();
      writes.reply.reset();
    },
  };

  return <PointRunnerContext.Provider value={runner}>{children}</PointRunnerContext.Provider>;
}

export function usePointRunner(): PointRunner {
  const runner = useContext(PointRunnerContext);
  if (!runner) {
    throw new Error('usePointRunner must be used inside PointRunnerProvider');
  }
  return runner;
}
