import {
  AI_GENERATION_STATUS_LABELS,
  AI_SUMMARY_TYPE_LABELS,
  PERMISSIONS,
  isClientFacingSummary,
  type AiSummaryDetail,
} from '@ashniva/types';
import { Alert, Badge, Button, Card, FormField, PageHeader, Textarea } from '@ashniva/ui';
import { useState } from 'react';
import { useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { AiSummaryStatusPill } from '../../../shared/components/StatusPills';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDate, formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useAiSummaryMutations, useAiSummaryQuery, useAiVersionQuery } from '../api';
import { AiSummaryActions } from '../components/AiSummaryActions';
import { AiSummarySources } from '../components/AiSummarySources';

import '../ai-summaries.css';

/** The review screen: the generated text, what it was built from, and who signed it off. */
export function AiSummaryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useAiSummaryQuery(id);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Loaded summary={query.data} /> : null}
    </QueryState>
  );
}

function Loaded({ summary }: { summary: AiSummaryDetail }) {
  const canGenerate = usePermission(PERMISSIONS.AI_SUMMARY_GENERATE);
  const clientFacing = isClientFacingSummary(summary.type);
  const editable =
    summary.status === 'DRAFT' ||
    summary.status === 'CHANGES_REQUESTED' ||
    summary.status === 'GENERATION_FAILED';

  return (
    <div className="ai-page">
      <PageHeader
        title={summary.title}
        subtitle={`${AI_SUMMARY_TYPE_LABELS[summary.type]} · ${formatDate(summary.periodStart)} – ${formatDate(summary.periodEnd)}`}
        actions={<AiSummaryActions summary={summary} />}
      >
        <AiSummaryStatusPill status={summary.status} />
        {summary.isDraftOutput ? (
          <Badge tone="warning">Draft — not approved by a person</Badge>
        ) : null}
        {clientFacing ? null : <Badge tone="neutral">Internal only</Badge>}
      </PageHeader>

      {summary.missingDataNote ? <p className="ai-warning">{summary.missingDataNote}</p> : null}
      {summary.reviewNote ? (
        <p className="ai-warning">Changes requested: {summary.reviewNote}</p>
      ) : null}
      {summary.cancelReason ? (
        <p className="ai-warning">Cancelled: {summary.cancelReason}</p>
      ) : null}

      <div className="ai-page__columns">
        <div className="ai-page__main">
          <TextPanel
            summary={summary}
            field="internalContent"
            title="Internal version"
            hint="What the team reads. Never sent to a client."
            editable={editable && canGenerate}
            internal
          />

          {clientFacing ? (
            <TextPanel
              summary={summary}
              field="clientContent"
              title="Client version"
              hint="This is the text that gets published, once it is approved."
              editable={editable && canGenerate}
            />
          ) : null}

          <AiSummarySources summaryId={summary.id} />
        </div>

        <div className="ai-page__aside">
          <Card title="How it was made">
            <p className="muted">
              Provider: {summary.providerName ?? 'not generated yet'}
              <br />
              Model: {summary.model ?? '—'}
              <br />
              Prompt version: {summary.promptVersion ?? '—'}
              <br />
              Output version: {summary.outputVersion ?? '—'}
              <br />
              Generated: {summary.generatedAt ? formatDateTime(summary.generatedAt) : 'never'}
            </p>
          </Card>

          <Card title="Review">
            <p className="muted">
              Approved by: {summary.approvedByName ?? 'nobody yet'}
              {summary.approvedAt ? ` · ${formatDateTime(summary.approvedAt)}` : ''}
              <br />
              Published by: {summary.publishedByName ?? '—'}
              {summary.publishedAt ? ` · ${formatDateTime(summary.publishedAt)}` : ''}
            </p>
          </Card>

          <Card title={`Earlier versions (${summary.versions.length})`}>
            <VersionList summary={summary} />
          </Card>

          <Card title={`Generation runs (${summary.runs.length})`}>
            {summary.runs.length === 0 ? (
              <p className="muted">Nothing has been generated yet.</p>
            ) : (
              <ul className="ai-runs">
                {summary.runs.map((run) => (
                  <li key={run.id} className="ai-runs__row">
                    <span>
                      {AI_GENERATION_STATUS_LABELS[run.status]}
                      {run.failureCode ? ` (${run.failureCode})` : ''}
                    </span>
                    <span className="muted">
                      {run.inputTokens ?? 0}/{run.outputTokens ?? 0} tokens ·{' '}
                      {formatDateTime(run.startedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** One editable block of text. Internal and client versions differ only in tone and label. */
function TextPanel({
  summary,
  field,
  title,
  hint,
  editable,
  internal = false,
}: {
  summary: AiSummaryDetail;
  field: 'internalContent' | 'clientContent';
  title: string;
  hint: string;
  editable: boolean;
  internal?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { edit } = useAiSummaryMutations(summary.id);
  const value = summary[field];

  const save = async () => {
    setError(null);
    try {
      await edit.mutateAsync({ [field]: draft ?? '' });
      setDraft(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <Card
      title={title}
      headerAddon={internal ? <Badge tone="warning">Never shown to a client</Badge> : null}
    >
      <p className="muted">{hint}</p>

      {draft === null ? (
        <>
          {value ? (
            <p className={internal ? 'ai-text ai-text--internal' : 'ai-text'}>{value}</p>
          ) : (
            <p className="muted">Nothing here yet.</p>
          )}
          {editable ? (
            <div className="detail-actions">
              <Button onClick={() => setDraft(value ?? '')}>Edit</Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <FormField label={title}>
            <Textarea rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </FormField>
          <div className="detail-actions">
            <Button onClick={() => setDraft(null)}>Discard</Button>
            <Button variant="primary" loading={edit.isPending} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </>
      )}

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Card>
  );
}

/** Reading back what an earlier draft said, one at a time. */
function VersionList({ summary }: { summary: AiSummaryDetail }) {
  const [open, setOpen] = useState<number | null>(null);
  const version = useAiVersionQuery(summary.id, open);

  if (summary.versions.length === 0) {
    return <p className="muted">Nothing has been replaced yet.</p>;
  }

  return (
    <ol className="release-note-history">
      {summary.versions.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            className="link-button"
            onClick={() => setOpen(open === entry.version ? null : entry.version)}
          >
            Version {entry.version}
          </button>
          <span className="muted">
            {entry.createdByName} · {formatDateTime(entry.createdAt)}
            {entry.note ? ` · ${entry.note}` : ''}
          </span>
          {open === entry.version && version.data ? (
            <p className="ai-text ai-text--internal">
              {version.data.internalContent ?? 'This version had no text.'}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
