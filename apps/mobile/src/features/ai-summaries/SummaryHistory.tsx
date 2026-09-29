import { AI_GENERATION_STATUS_LABELS, type AiSummaryDetail } from '@ashniva/types';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { KeyValueRow, ListRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useAiVersion } from './api';

/** How the text was made and who signed it off: the provenance a reviewer checks. */
export function SummaryProvenance({ summary }: { summary: AiSummaryDetail }) {
  return (
    <Section title="How it was made" icon="construct-outline" collapsible initiallyOpen={false}>
      <KeyValueRow label="Provider" value={summary.providerName ?? 'Not generated yet'} />
      <KeyValueRow label="Model" value={summary.model ?? '—'} />
      <KeyValueRow label="Prompt version" value={summary.promptVersion ?? '—'} />
      <KeyValueRow label="Output version" value={summary.outputVersion ?? '—'} />
      <KeyValueRow
        label="Generated"
        value={summary.generatedAt ? (formatDateTime(summary.generatedAt) ?? '—') : 'Never'}
      />
      <Divider />
      <KeyValueRow
        label="Approved by"
        value={signOff(summary.approvedByName, summary.approvedAt, 'Nobody yet')}
      />
      <KeyValueRow
        label="Published by"
        value={signOff(summary.publishedByName, summary.publishedAt, '—')}
      />
    </Section>
  );
}

function signOff(name: string | null, at: string | null, fallback: string): string {
  if (!name) {
    return fallback;
  }
  return at ? `${name} · ${formatDateTime(at)}` : name;
}

/** Earlier drafts, read back one at a time. */
export function SummaryVersions({ summary }: { summary: AiSummaryDetail }) {
  const theme = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  const version = useAiVersion(summary.id, open);

  return (
    <Section
      title="Earlier versions"
      icon="git-branch-outline"
      count={summary.versions.length}
      collapsible
      initiallyOpen={false}
    >
      {summary.versions.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing has been replaced yet.
        </AppText>
      ) : null}
      {summary.versions.map((entry) => {
        const expanded = open === entry.version;
        return (
          <View key={entry.id}>
            <ListRow
              title={`Version ${entry.version}`}
              subtitle={[entry.createdByName, formatDateTime(entry.createdAt), entry.note]
                .filter(Boolean)
                .join(' · ')}
              icon="document-outline"
              iconTone="neutral"
              onPress={() => setOpen(expanded ? null : entry.version)}
              accessibilityHint={expanded ? 'Hides this version' : 'Shows what this version said'}
            />
            {expanded && version.isLoading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : null}
            {expanded && version.data ? (
              <View
                style={{
                  backgroundColor: theme.colors.warningSoft,
                  borderRadius: theme.radius.sm,
                  padding: theme.spacing.md,
                }}
              >
                <AppText size="sm">
                  {version.data.internalContent ?? 'This version had no text.'}
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}

/** Each attempt at generating, with its outcome and token counts. */
export function SummaryRuns({ summary }: { summary: AiSummaryDetail }) {
  return (
    <Section
      title="Generation runs"
      icon="pulse-outline"
      count={summary.runs.length}
      collapsible
      initiallyOpen={false}
    >
      {summary.runs.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing has been generated yet.
        </AppText>
      ) : null}
      {summary.runs.map((run) => (
        <ListRow
          key={run.id}
          title={`${AI_GENERATION_STATUS_LABELS[run.status] ?? run.status}${run.failureCode ? ` (${run.failureCode})` : ''}`}
          subtitle={`${run.inputTokens ?? 0}/${run.outputTokens ?? 0} tokens · ${formatDateTime(run.startedAt)}`}
          icon={run.status === 'SUCCEEDED' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          iconTone={run.status === 'SUCCEEDED' ? 'success' : 'warning'}
        />
      ))}
    </Section>
  );
}
