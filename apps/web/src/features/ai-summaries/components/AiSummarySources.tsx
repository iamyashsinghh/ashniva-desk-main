import { AI_SOURCE_KIND_LABELS } from '@ashniva/types';
import { Badge, Card } from '@ashniva/ui';

import { formatDate } from '../../../shared/lib/format';
import { useAiSourcesQuery } from '../api';

/**
 * The records the summary was built from.
 *
 * A reviewer's job is to decide whether the text matches the facts, which they cannot do without
 * seeing the facts. So this shows what was actually sent — the sanitised text, not a paraphrase
 * of it — and marks which records were client-visible.
 */
export function AiSummarySources({ summaryId }: { summaryId: string }) {
  const query = useAiSourcesQuery(summaryId);
  const sources = query.data ?? [];

  return (
    <Card title={`Source records (${sources.length})`}>
      {sources.length === 0 ? (
        <p className="muted">
          Nothing was collected for this period. Generating again after logging work will pick it
          up.
        </p>
      ) : (
        <ul className="ai-sources">
          {sources.map((source) => (
            <li key={source.id} className="ai-sources__row">
              <div className="ai-sources__head">
                <span>{source.label}</span>
                <span className="muted">
                  {AI_SOURCE_KIND_LABELS[source.kind]}
                  {source.occurredAt ? ` · ${formatDate(source.occurredAt)}` : ''}
                </span>
              </div>
              {source.promptText ? <p className="ai-sources__text">{source.promptText}</p> : null}
              {source.clientVisible ? null : (
                <Badge tone="warning">Internal — never used for client text</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
