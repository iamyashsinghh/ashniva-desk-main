import { PERMISSIONS, type ApprovalDetail, type ApprovalSubjectType } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Button } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useSession } from '../auth/SessionProvider';
import { APPROVAL_INVALIDATES } from './approval-display';
import {
  ApprovalWordingFields,
  wordingBody,
  wordingProblems,
  type ApprovalWording,
} from './ApprovalWordingFields';
import { SheetFooter } from './SheetFooter';

export interface RequestApprovalSheetProps {
  visible: boolean;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  /** The title to start from, e.g. "Sign off: Payment 2". */
  defaultTitle: string;
  defaultSummary?: string;
  onClose: () => void;
  /** The new draft's id — the caller usually opens it. */
  onCreated: (approvalId: string) => void;
}

/**
 * Preparing an approval request for a milestone, document, update or change request —
 * `POST /approvals`, the web app's "Request client approval".
 *
 * It starts as a draft, which the client cannot see, so nothing here is published by accident:
 * the provider still sends it for review and publishes it from the request's own screen.
 */
export function RequestApprovalSheet({
  visible,
  subjectType,
  subjectId,
  defaultTitle,
  defaultSummary = '',
  onClose,
  onCreated,
}: RequestApprovalSheetProps) {
  const [wording, setWording] = useState<ApprovalWording>({
    title: defaultTitle,
    summary: defaultSummary,
    dueDate: null,
    internalNotes: '',
  });

  const create = useApiMutation<ApprovalWording, ApprovalDetail>({
    path: '/approvals',
    body: (variables) => ({ subjectType, subjectId, ...wordingBody(variables) }),
    invalidate: APPROVAL_INVALIDATES,
    onSuccess: (created) => onCreated(created.id),
  });

  const problems = wordingProblems(wording);

  return (
    <Sheet
      visible={visible}
      title="Prepare an approval request"
      subtitle="Starts as a draft. Send it for internal review, then publish it so the client can decide."
      onClose={onClose}
      footer={
        <SheetFooter
          confirmLabel="Create draft"
          confirmIcon="document-text-outline"
          busy={create.busy}
          disabled={Boolean(problems.title ?? problems.summary)}
          onCancel={onClose}
          onConfirm={() => void create.run(wording)}
        />
      }
    >
      <ApprovalWordingFields value={wording} onChange={setWording} />
      {create.error ? (
        <Banner tone="danger" role="alert">
          {create.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}

/**
 * The button and its sheet together, for a subject screen to drop in. Drawn only for somebody
 * who may manage approvals — the API refuses anyone else, and a button that can only fail is not
 * worth showing.
 */
export function RequestApprovalButton({
  label = 'Request client approval',
  ...sheet
}: Omit<RequestApprovalSheetProps, 'visible' | 'onClose'> & { label?: string }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can(PERMISSIONS.APPROVAL_MANAGE)) {
    return null;
  }
  return (
    <>
      <Button
        label={label}
        icon="shield-checkmark-outline"
        variant="secondary"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <RequestApprovalSheet
          {...sheet}
          visible
          onClose={() => setOpen(false)}
          onCreated={(approvalId) => {
            setOpen(false);
            sheet.onCreated(approvalId);
          }}
        />
      ) : null}
    </>
  );
}
