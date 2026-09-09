import { UAT_DECISION, type ReleaseDetail, type UatRequestSummary } from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { formatDateTime } from '../../../shared/lib/format';
import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useRequestSignOff, useUatRequestsQuery } from '../api';
import { UatThreadModal } from './UatThreadModal';

const DECISION_LABELS: Record<UatRequestSummary['status'], string> = {
  [UAT_DECISION.PENDING]: 'Waiting on the client',
  [UAT_DECISION.APPROVED]: 'Signed off',
  [UAT_DECISION.CHANGES_REQUESTED]: 'Changes requested',
};

const DECISION_TONES = {
  [UAT_DECISION.PENDING]: 'warning',
  [UAT_DECISION.APPROVED]: 'success',
  [UAT_DECISION.CHANGES_REQUESTED]: 'danger',
} as const;

/**
 * The client's sign-off on this release: what has been asked, and how to ask.
 *
 * The client's half of this — the list, the detail, the decision and the thread — has been built
 * since the QA package; this is the side that raises the request. Without it a project with
 * `requiresClientUat` waited for ever on a sign-off nothing could ask for.
 */
export function ClientSignOffCard({
  release,
  canManage,
}: {
  release: ReleaseDetail;
  canManage: boolean;
}) {
  const [asking, setAsking] = useState(false);
  // Which thread is open. The list is a summary; the conversation is a separate read.
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const requests = useUatRequestsQuery(release.id, canManage);
  const rows = requests.data ?? [];

  return (
    <Card
      title="Client sign-off"
      headerAddon={
        canManage ? (
          <Button variant="secondary" onClick={() => setAsking(true)}>
            Request client sign-off
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="The client has not been asked"
          description="Ask in plain language what they should look at. They answer in their portal, and their approval is what the client sign-off gate reads."
        />
      ) : (
        <ul className="release-history">
          {rows.map((row) => (
            <li key={row.id}>
              <strong>
                <Badge tone={DECISION_TONES[row.status]}>{DECISION_LABELS[row.status]}</Badge>
              </strong>
              <p>{row.summaryPlain}</p>
              {row.note ? <p className="muted">“{row.note}”</p> : null}
              <span className="muted">
                {row.decidedAt
                  ? `${row.decidedByName ?? 'The client'} · ${formatDateTime(row.decidedAt)}`
                  : `Asked ${formatDateTime(row.createdAt)}`}
              </span>
              {canManage ? (
                <Button variant="ghost" onClick={() => setOpenThreadId(row.id)}>
                  Open the thread
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {asking ? <RequestSignOffModal release={release} onClose={() => setAsking(false)} /> : null}
      {openThreadId ? (
        <UatThreadModal requestId={openThreadId} onClose={() => setOpenThreadId(null)} />
      ) : null}
    </Card>
  );
}

function RequestSignOffModal({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const request = useRequestSignOff();
  const { error, wrap } = useSubmitHandler(onClose);
  const [summary, setSummary] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [checklist, setChecklist] = useState('');

  const tooShort = summary.trim().length < 10;

  return (
    <Modal
      open
      title={`Ask the client to sign off ${release.version}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={request.isPending}
            disabled={tooShort}
            disabledReason="Say what the client is being asked to look at"
            onClick={() =>
              void wrap(() =>
                request.mutateAsync({
                  releaseId: release.id,
                  summaryPlain: summary.trim(),
                  ...(previewUrl.trim() ? { previewUrl: previewUrl.trim() } : {}),
                  ...(checklist.trim()
                    ? {
                        checklist: checklist
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean),
                      }
                    : {}),
                }),
              )()
            }
          >
            Send to the client
          </Button>
        </>
      }
    >
      <p className="muted">
        The client reads this and nothing else about the release — no staging URL, no internal note,
        no other client’s work.
      </p>
      <FormGrid>
        <FormGridFull>
          <FormField
            label="What they are signing off"
            required
            hint="Plain language, no jargon. This is the whole of what they are shown."
          >
            <Textarea
              rows={4}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField
            label="A link they can open"
            hint="Optional — where they can see it for themselves"
          >
            <Input
              type="url"
              value={previewUrl}
              placeholder="https://preview.example.com"
              onChange={(event) => setPreviewUrl(event.target.value)}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="What to check" hint="Optional — one per line">
            <Textarea
              rows={3}
              value={checklist}
              onChange={(event) => setChecklist(event.target.value)}
            />
          </FormField>
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
