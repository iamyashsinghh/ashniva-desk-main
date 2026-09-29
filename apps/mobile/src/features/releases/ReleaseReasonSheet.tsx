import type { ReleaseDetail } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useReleaseAction } from './release-api';
import { SheetButtons } from './SheetButtons';

interface ReasonCopy {
  title: string;
  consequence: string;
  label: string;
  hint: string;
  confirmLabel: string;
  danger: boolean;
}

/**
 * The two moves that must say why: rolling back and reopening. An unexplained rollback teaches
 * nobody, and reopening discards every sign-off, so the approvers asked again get to read what
 * changed underneath them. The API wants at least three characters.
 */
const COPY: Record<'rollback' | 'reopen', (version: string) => ReasonCopy> = {
  rollback: (version) => ({
    title: `Roll back ${version}`,
    consequence:
      'A version that was pulled is history: shipping it again is a new release with a new version.',
    label: 'Why it was pulled',
    hint: 'Kept on the release and in the audit log.',
    confirmLabel: 'Roll back',
    danger: true,
  }),
  reopen: (version) => ({
    title: `Reopen ${version}`,
    consequence:
      'This goes back to draft and every sign-off collected so far is discarded — what the approvers looked at is about to change.',
    label: 'Why it is going back',
    hint: 'The approvers you ask again will read this.',
    confirmLabel: 'Reopen',
    danger: false,
  }),
};

export function ReleaseReasonSheet({
  release,
  action,
  onClose,
}: {
  release: ReleaseDetail;
  action: 'rollback' | 'reopen';
  onClose: () => void;
}) {
  const copy = COPY[action](release.version);
  const [reason, setReason] = useState('');
  const send = useReleaseAction<string>(release.id, action, (text) => ({ reason: text }), onClose);
  const trimmed = reason.trim();

  return (
    <Sheet
      visible
      title={copy.title}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel={copy.confirmLabel}
          confirmIcon={action === 'rollback' ? 'arrow-undo-outline' : 'refresh'}
          danger={copy.danger}
          busy={send.busy}
          disabled={trimmed.length < 3}
          onCancel={onClose}
          onConfirm={() => void send.run(trimmed)}
        />
      }
    >
      <AppText size="sm" tone="muted">
        {copy.consequence}
      </AppText>
      <Field label={copy.label} required hint={copy.hint}>
        <Input
          accessibilityLabel={copy.label}
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={reason}
          onChangeText={setReason}
        />
      </Field>
      {send.error ? (
        <Banner tone="danger" role="alert">
          {send.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
