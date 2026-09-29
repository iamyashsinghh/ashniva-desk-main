import type { ReleaseDetail } from '@ashniva/types';
import { useState } from 'react';

import { KeyValueRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useReleaseAction } from './release-api';
import { ENVIRONMENT_LABELS, publishBlockedReason } from './release-display';
import { SheetButtons } from './SheetButtons';

/**
 * The last step before production.
 *
 * The typed version is sent exactly as typed — no trim, no case-fold — and the server compares it
 * again before anything ships. Being kinder than the server here would mean passing input it then
 * rejects, or quietly accepting "close enough". When the project does not ask for it, nothing is
 * sent.
 */
export function PublishReleaseSheet({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const publish = useReleaseAction<string>(
    release.id,
    'publish',
    (confirmVersion) => (confirmVersion ? { confirmVersion } : {}),
    onClose,
  );

  const needsVersion = release.readiness.requiresTypedConfirmation;
  const blocked = publishBlockedReason(release);
  const mismatch = needsVersion && typed !== release.version;
  const environment = ENVIRONMENT_LABELS[release.environment];

  return (
    <Sheet
      visible
      title="Publish this release"
      subtitle={release.projectName}
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel={`Publish to ${environment}`}
          confirmIcon="rocket-outline"
          danger
          busy={publish.busy}
          disabled={Boolean(blocked) || mismatch}
          onCancel={onClose}
          onConfirm={() => void publish.run(needsVersion ? typed : '')}
        />
      }
    >
      <KeyValueRow label="Version" value={release.version} emphasis />
      <KeyValueRow label="Release" value={release.title} />
      <KeyValueRow label="Project" value={release.projectName} />
      <KeyValueRow label="Environment" value={environment} />
      <KeyValueRow
        label="Going out"
        value={`${release.items.length} item${release.items.length === 1 ? '' : 's'}`}
      />
      {blocked ? (
        <Banner tone="danger" title="Not ready to publish">
          {blocked}
        </Banner>
      ) : null}
      {needsVersion ? (
        <Field
          label="Type the version to confirm"
          required
          hint="Exactly as shown above — capitals and punctuation included."
          error={typed.length > 0 && mismatch ? 'That is not this release’s version' : null}
        >
          <Input
            accessibilityLabel="Type the version to confirm"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            spellCheck={false}
            placeholder={release.version}
            value={typed}
            onChangeText={setTyped}
          />
        </Field>
      ) : (
        <AppText size="sm" tone="muted">
          This project does not ask for the version to be typed back. Publishing is recorded against
          your name.
        </AppText>
      )}
      {publish.error ? (
        <Banner tone="danger" role="alert">
          {publish.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
