import type { ApprovalDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { APPROVAL_INVALIDATES } from './approval-display';
import { SheetFooter } from './SheetFooter';

/**
 * Taking a request off the table, with an optional reason — the web app's withdraw dialog.
 *
 * The reason goes into the request's history, which the client can read once the request has
 * been published, so it is optional and sent only when somebody wrote one: an empty string would
 * put a blank line on the client's trail.
 */
export function WithdrawApprovalSheet({
  approvalId,
  onClose,
  onDone,
}: {
  approvalId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const withdraw = useApiMutation<{ comment?: string }, ApprovalDetail>({
    path: `/approvals/${approvalId}/withdraw`,
    body: (variables) => variables,
    invalidate: APPROVAL_INVALIDATES,
    onSuccess: onDone,
  });

  return (
    <Sheet
      visible
      title="Withdraw this request"
      subtitle="It stays on record, but nobody can decide on it any more"
      onClose={onClose}
      footer={
        <SheetFooter
          confirmLabel="Withdraw"
          confirmIcon="remove-circle-outline"
          danger
          busy={withdraw.busy}
          onCancel={onClose}
          onConfirm={() => {
            const comment = reason.trim();
            void withdraw.run(comment ? { comment } : {});
          }}
        />
      }
    >
      <Field label="Reason" hint="Optional. Recorded in the request's history">
        <Input
          accessibilityLabel="Reason for withdrawing"
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={3}
          maxLength={2000}
          style={{ minHeight: 88 }}
        />
      </Field>
      {withdraw.error ? (
        <Banner tone="danger" role="alert">
          {withdraw.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
