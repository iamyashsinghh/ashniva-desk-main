import {
  PERMISSIONS,
  RELEASE_APPROVAL_DECISION,
  RELEASE_STATUS,
  type ReleaseDetail,
} from '@ashniva/types';
import { Alert, Button } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { usePermission } from '../../auth/session-context';
import { useReleaseMutations } from '../api';
import { publishBlockedReason } from '../release-display';
import { PublishConfirmDialog } from './PublishConfirmDialog';
import {
  ApprovalDecisionModal,
  ReopenReleaseModal,
  RollbackReleaseModal,
  ScheduleReleaseModal,
} from './ReleaseDialogs';

type Dialog = 'publish' | 'schedule' | 'approve' | 'reject' | 'rollback' | 'reopen';

/** Where in its life a release still has publishing ahead of it. */
const BEFORE_PUBLISH: string[] = [
  RELEASE_STATUS.DRAFT,
  RELEASE_STATUS.APPROVAL_REQUESTED,
  RELEASE_STATUS.APPROVED,
  RELEASE_STATUS.SCHEDULED,
];

const CAN_ROLL_BACK: string[] = [
  RELEASE_STATUS.PUBLISHING,
  RELEASE_STATUS.PUBLISHED,
  RELEASE_STATUS.VERIFIED,
];

/**
 * The workflow buttons for one release.
 *
 * Which buttons appear follows the release's status and the caller's permissions — the same two
 * things the API checks, so the screen does not offer a call that comes back 409. Whether
 * **Publish** works is not decided here at all: `readiness.publishable` decides, and when it is
 * false the failing gates' own reasons are what the disabled button says. Hiding a button is
 * presentation; the API refuses the call regardless.
 */
export function ReleaseActions({ release }: { release: ReleaseDetail }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = usePermission(PERMISSIONS.RELEASE_MANAGE);
  const canApprove = usePermission(PERMISSIONS.RELEASE_APPROVE);
  const canPublish = usePermission(PERMISSIONS.RELEASE_PUBLISH);
  const { requestApproval, verifyLive } = useReleaseMutations();

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const status = release.status;
  const blocked = publishBlockedReason(release);

  return (
    <>
      {canManage && status === RELEASE_STATUS.DRAFT ? (
        <Button
          variant="primary"
          loading={requestApproval.isPending}
          disabled={release.items.length === 0}
          disabledReason="Add what is going out before asking anyone to approve it"
          onClick={() => void run(() => requestApproval.mutateAsync(release.id))}
        >
          Request approval
        </Button>
      ) : null}

      {canApprove && status === RELEASE_STATUS.APPROVAL_REQUESTED ? (
        <>
          <Button variant="primary" onClick={() => setDialog('approve')}>
            Approve
          </Button>
          <Button variant="danger" onClick={() => setDialog('reject')}>
            Reject
          </Button>
        </>
      ) : null}

      {canManage && (status === RELEASE_STATUS.APPROVED || status === RELEASE_STATUS.SCHEDULED) ? (
        <Button onClick={() => setDialog('schedule')}>
          {release.scheduledFor ? 'Reschedule' : 'Schedule'}
        </Button>
      ) : null}

      {/*
        Shown to everyone who can see a release that has not gone out yet, including people who
        may approve but not publish: the publisher gate is one of the reasons the button gives for
        being off, and a button that is simply absent teaches nobody whose job this is.
      */}
      {BEFORE_PUBLISH.includes(status) ? (
        <Button
          variant="danger"
          disabled={Boolean(blocked)}
          disabledReason={blocked}
          onClick={() => setDialog('publish')}
        >
          Publish
        </Button>
      ) : null}

      {canManage && status === RELEASE_STATUS.PUBLISHED ? (
        <Button
          variant="primary"
          loading={verifyLive.isPending}
          onClick={() => void run(() => verifyLive.mutateAsync({ id: release.id }))}
        >
          Verify live
        </Button>
      ) : null}

      {CAN_ROLL_BACK.includes(status) ? (
        <Button
          variant="danger"
          disabled={!canPublish}
          disabledReason="Rolling a release back needs the release:publish permission"
          onClick={() => setDialog('rollback')}
        >
          Roll back
        </Button>
      ) : null}

      {canManage && status === RELEASE_STATUS.FAILED ? (
        <Button
          title="The sign-offs are collected again, because what they covered is about to change"
          onClick={() => setDialog('reopen')}
        >
          Reopen for editing
        </Button>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {dialog === 'publish' ? (
        <PublishConfirmDialog release={release} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'schedule' ? (
        <ScheduleReleaseModal release={release} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'approve' || dialog === 'reject' ? (
        <ApprovalDecisionModal
          release={release}
          decision={
            dialog === 'approve'
              ? RELEASE_APPROVAL_DECISION.APPROVED
              : RELEASE_APPROVAL_DECISION.REJECTED
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'rollback' ? (
        <RollbackReleaseModal release={release} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'reopen' ? (
        <ReopenReleaseModal release={release} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}
