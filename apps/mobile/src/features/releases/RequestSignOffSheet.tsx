import type { ReleaseDetail, UatRequestSummary } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { SheetButtons } from './SheetButtons';

interface SignOffInput {
  releaseId: string;
  summaryPlain: string;
  previewUrl?: string;
  checklist?: string[];
}

/**
 * Ask the client to sign off the release.
 *
 * The summary is the whole of what the client reads about the release — no staging URL unless it
 * is given here, no internal note — so the sheet says so above the fields.
 */
export function RequestSignOffSheet({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [checklist, setChecklist] = useState('');
  const request = useApiMutation<SignOffInput, UatRequestSummary>({
    path: '/uat',
    body: (input) => input,
    invalidate: [['uat'], ['releases']],
    onSuccess: onClose,
  });

  const tooShort = summary.trim().length < 10;
  const lines = checklist
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const send = () =>
    void request.run({
      releaseId: release.id,
      summaryPlain: summary.trim(),
      ...(previewUrl.trim() ? { previewUrl: previewUrl.trim() } : {}),
      ...(lines.length > 0 ? { checklist: lines } : {}),
    });

  return (
    <Sheet
      visible
      title={`Ask the client to sign off ${release.version}`}
      onClose={onClose}
      maxHeightRatio={0.94}
      footer={
        <SheetButtons
          confirmLabel="Send to the client"
          confirmIcon="send"
          busy={request.busy}
          disabled={tooShort}
          onCancel={onClose}
          onConfirm={send}
        />
      }
    >
      <Banner tone="info" title="The client reads this">
        This is the whole of what they are shown about the release — no internal note, no other
        client’s work.
      </Banner>
      <Field
        label="What they are signing off"
        required
        hint="Plain language, no jargon. At least 10 characters."
      >
        <Input
          accessibilityLabel="What they are signing off"
          multiline
          numberOfLines={4}
          style={{ minHeight: 110 }}
          value={summary}
          onChangeText={setSummary}
        />
      </Field>
      <Field label="A link they can open" hint="Optional — where they can see it for themselves.">
        <Input
          accessibilityLabel="A link they can open"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://preview.example.com"
          value={previewUrl}
          onChangeText={setPreviewUrl}
        />
      </Field>
      <Field label="What to check" hint="Optional — one per line.">
        <Input
          accessibilityLabel="What to check"
          multiline
          numberOfLines={3}
          style={{ minHeight: 88 }}
          value={checklist}
          onChangeText={setChecklist}
        />
      </Field>
      {lines.length > 0 ? (
        <AppText size="xs" tone="muted">
          {lines.length === 1 ? '1 thing to check' : `${lines.length} things to check`}
        </AppText>
      ) : null}
      {request.error ? (
        <Banner tone="danger" role="alert">
          {request.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
