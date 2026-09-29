import { PERMISSIONS, type AiSummaryDetail } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { Grow, StickyActionBar } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useSession } from '../auth/SessionProvider';
import { useAiSummaryStep, useGenerateAiSummary } from './api';
import { ReasonSheet, type ReasonAction } from './ReasonSheet';
import { summaryActions } from './summary-display';

/**
 * The review buttons, pinned to the bottom of the summary.
 *
 * Which appear follows the rules the API enforces — the status's allowed transitions and each
 * route's permission — so the bar never offers a step that will be refused. The two that need a
 * reason (sending back, cancelling) open a sheet, because the API refuses them without one.
 */
export function SummaryActions({
  summary,
  providerConfigured,
}: {
  summary: AiSummaryDetail;
  providerConfigured: boolean;
}) {
  const { can } = useSession();
  const [reasonFor, setReasonFor] = useState<ReasonAction | null>(null);
  const generate = useGenerateAiSummary();
  const step = useAiSummaryStep(summary.id);
  const actions = summaryActions(summary, {
    canGenerate: can(PERMISSIONS.AI_SUMMARY_GENERATE),
    canApprove: can(PERMISSIONS.AI_SUMMARY_APPROVE),
    canPublishToClients: can(PERMISSIONS.CLIENT_UPDATE_PUBLISH),
  });
  const offered = [
    actions.generate,
    actions.submit,
    actions.approve,
    actions.requestChanges,
    actions.publish,
    actions.reopen,
    actions.cancel,
  ].some(Boolean);

  if (!offered) {
    return null;
  }

  const notes = [
    ...(actions.generate && !providerConfigured
      ? ['No AI provider is configured, so the text cannot be generated — it can still be written.']
      : []),
    ...actions.notes,
  ];
  const error = generate.error ?? step.error;
  const busy = generate.busy || step.busy;

  return (
    <>
      <StickyActionBar
        note={
          <>
            {error ? (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            ) : null}
            {notes.map((note) => (
              <AppText key={note} size="xs" tone="muted">
                {note}
              </AppText>
            ))}
          </>
        }
      >
        {actions.generate ? (
          <Grow>
            <Button
              label={summary.generatedAt ? 'Regenerate' : 'Generate'}
              icon="sparkles-outline"
              variant="secondary"
              loading={generate.busy}
              disabled={busy || !providerConfigured}
              onPress={() => void generate.run(summary.id)}
            />
          </Grow>
        ) : null}
        {actions.submit ? (
          <Grow>
            <Button
              label="Send for review"
              icon="send-outline"
              loading={step.busy}
              disabled={busy || !summary.internalContent}
              onPress={() => void step.run({ step: 'submit' })}
            />
          </Grow>
        ) : null}
        {actions.approve ? (
          <Grow>
            <Button
              label="Approve"
              icon="checkmark-circle-outline"
              loading={step.busy}
              disabled={busy}
              onPress={() => void step.run({ step: 'approve' })}
            />
          </Grow>
        ) : null}
        {actions.requestChanges ? (
          <Grow>
            <Button
              label="Request changes"
              icon="return-down-back-outline"
              variant="secondary"
              disabled={busy}
              onPress={() => setReasonFor('request-changes')}
            />
          </Grow>
        ) : null}
        {actions.publish ? (
          <Grow>
            <Button
              label="Publish to the client"
              icon="megaphone-outline"
              loading={step.busy}
              disabled={busy || !summary.clientContent}
              onPress={() => void step.run({ step: 'publish' })}
            />
          </Grow>
        ) : null}
        {actions.reopen ? (
          <Grow>
            <Button
              label="Reopen"
              icon="refresh"
              variant="secondary"
              loading={step.busy}
              disabled={busy}
              onPress={() => void step.run({ step: 'return-to-draft' })}
            />
          </Grow>
        ) : null}
        {actions.cancel ? (
          <Grow>
            <Button
              label="Cancel summary"
              icon="close-circle-outline"
              variant="dangerGhost"
              disabled={busy}
              onPress={() => setReasonFor('cancel')}
            />
          </Grow>
        ) : null}
      </StickyActionBar>
      <ReasonSheet summaryId={summary.id} action={reasonFor} onClose={() => setReasonFor(null)} />
    </>
  );
}
