import type { ApprovalDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Sheet } from '../../shared/components/Sheet';
import { APPROVAL_INVALIDATES } from './approval-display';
import {
  ApprovalWordingFields,
  wordingBody,
  wordingProblems,
  type ApprovalWording,
} from './ApprovalWordingFields';
import { SheetFooter } from './SheetFooter';

/**
 * The wording of a request, before the client reads it — `PATCH /approvals/:id`, the same body
 * the web app's edit dialog sends.
 *
 * Whether editing is allowed at all is the API's `edit` action; this sheet is only opened when it
 * was offered and enabled.
 */
export function EditApprovalSheet({
  approval,
  onClose,
  onSaved,
}: {
  approval: ApprovalDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [wording, setWording] = useState<ApprovalWording>({
    title: approval.title,
    summary: approval.summary,
    dueDate: approval.dueDate?.slice(0, 10) ?? null,
    internalNotes: approval.internalNotes ?? '',
  });

  const save = useApiMutation<ApprovalWording, ApprovalDetail>({
    path: `/approvals/${approval.id}`,
    method: 'PATCH',
    body: wordingBody,
    invalidate: APPROVAL_INVALIDATES,
    onSuccess: onSaved,
  });

  const problems = wordingProblems(wording);

  return (
    <Sheet
      visible
      title="Edit approval request"
      subtitle="The client reads the title and summary once it is published"
      onClose={onClose}
      footer={
        <SheetFooter
          confirmLabel="Save"
          confirmIcon="save-outline"
          busy={save.busy}
          disabled={Boolean(problems.title ?? problems.summary)}
          onCancel={onClose}
          onConfirm={() => void save.run(wording)}
        />
      }
    >
      <ApprovalWordingFields value={wording} onChange={setWording} />
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
