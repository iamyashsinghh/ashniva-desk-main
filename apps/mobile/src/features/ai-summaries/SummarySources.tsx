import { AI_SOURCE_KIND_LABELS } from '@ashniva/types';
import { ActivityIndicator, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useAiSources } from './api';

/**
 * The records the summary was built from.
 *
 * A reviewer's job is to decide whether the text matches the facts, which they cannot do without
 * the facts. So this shows what was actually sent — the sanitised text, not a paraphrase — and
 * marks the records that were not client-visible and so never fed the client version.
 */
export function SummarySources({
  summaryId,
  generatedAt,
}: {
  summaryId: string;
  generatedAt: string | null;
}) {
  const theme = useTheme();
  const query = useAiSources(summaryId, generatedAt);
  const sources = query.data ?? [];

  let body = (
    <AppText size="sm" tone="muted">
      Nothing was collected for this period. Generating again after logging work will pick it up.
    </AppText>
  );
  if (query.isLoading) {
    body = <ActivityIndicator color={theme.colors.primary} />;
  } else if (query.error) {
    body = (
      <AppText size="sm" tone="danger">
        {errorMessage(query.error)}
      </AppText>
    );
  } else if (sources.length > 0) {
    body = (
      <View>
        {sources.map((source, index) => (
          <View
            key={source.id}
            style={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.sm }}
          >
            {index > 0 ? <Divider /> : null}
            <AppText size="sm" weight="medium">
              {source.label}
            </AppText>
            <AppText size="xs" tone="faint">
              {AI_SOURCE_KIND_LABELS[source.kind] ?? source.kind}
              {source.occurredAt ? ` · ${formatDate(source.occurredAt)}` : ''}
            </AppText>
            {source.promptText ? (
              <AppText size="sm" tone="muted" numberOfLines={6}>
                {source.promptText}
              </AppText>
            ) : null}
            {source.clientVisible ? null : (
              <Pill label="Internal — never used for client text" tone="warning" />
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <Section
      title="Source records"
      icon="documents-outline"
      count={sources.length}
      collapsible
      initiallyOpen={false}
    >
      {body}
    </Section>
  );
}
