import type { ReleaseDetail } from '@ashniva/types';
import { Alert, Button, DescriptionList, FormField, Input, Modal } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReleaseMutations } from '../api';
import { ENVIRONMENT_LABELS, publishBlockedReason } from '../release-display';

/**
 * The last step before production (design reference 2t).
 *
 * Two checks, and only one of them is here. The screen refuses a version that does not match what
 * is on it, and the server compares the same string again before anything ships — so a browser
 * that skipped this dialog, or was more forgiving than it should have been, still cannot publish
 * the wrong release.
 *
 * The typed value is sent exactly as typed: no trim, no case-fold. The point of the check is that
 * the operator read what is actually on the screen, and being kinder than the server would mean
 * passing input the server then rejects — or worse, quietly accepting "close enough" here.
 */
export function PublishConfirmDialog({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const { publish } = useReleaseMutations();
  const { error, wrap } = useSubmitHandler(onClose);

  const needsVersion = release.readiness.requiresTypedConfirmation;
  const blocked = publishBlockedReason(release);
  const mismatch = needsVersion && typed !== release.version;
  const reason =
    blocked ?? (mismatch ? `Type ${release.version} exactly to confirm this publish` : undefined);

  return (
    <Modal
      open
      title="Publish this release"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={publish.isPending}
            disabled={Boolean(reason)}
            disabledReason={reason}
            onClick={() =>
              void wrap(() =>
                // Exactly what was typed, or nothing at all when the project does not ask for it.
                publish.mutateAsync({ id: release.id, confirmVersion: typed || undefined }),
              )()
            }
          >
            Publish to {ENVIRONMENT_LABELS[release.environment]}
          </Button>
        </>
      }
    >
      <div className="publish-confirm">
        <DescriptionList
          className="publish-confirm__facts"
          items={[
            { key: 'version', term: 'Version', description: <strong>{release.version}</strong> },
            { key: 'release', term: 'Release', description: release.title },
            { key: 'project', term: 'Project', description: release.projectName },
            {
              key: 'environment',
              term: 'Environment',
              description: ENVIRONMENT_LABELS[release.environment],
            },
            {
              key: 'going-out',
              term: 'Going out',
              description: `${release.items.length} item${release.items.length === 1 ? '' : 's'}`,
            },
          ]}
        />

        {needsVersion ? (
          <FormField
            label="Type the version to confirm"
            required
            hint="Exactly as shown above — capitals and punctuation included."
            error={typed.length > 0 && mismatch ? 'That is not this release’s version' : undefined}
          >
            <Input
              value={typed}
              autoComplete="off"
              spellCheck={false}
              placeholder={release.version}
              onChange={(event) => setTyped(event.target.value)}
            />
          </FormField>
        ) : (
          <p className="muted">
            This project does not ask for the version to be typed back. Publishing is recorded
            against your name.
          </p>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}
