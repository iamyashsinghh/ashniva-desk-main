import type { TestResultRow } from '@ashniva/types';
import { View } from 'react-native';

import { Expandable } from '../../shared/components/Expandable';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ENVIRONMENT_LABELS, SEVERITY_LABELS, SEVERITY_TONES } from './qa-labels';

/**
 * Every result ever recorded against this assignment, newest first.
 *
 * `test_results` is append-only on the server, so this is a history and not a current value: "it
 * failed twice before it passed" is the fact somebody reads this for.
 */
export function ResultHistorySection({ results }: { results: readonly TestResultRow[] }) {
  const theme = useTheme();
  return (
    <Section
      title="Results"
      icon="clipboard-outline"
      {...(results.length > 0 ? { count: results.length } : {})}
    >
      {results.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nothing recorded yet. The first result will show here.
        </AppText>
      ) : (
        <Expandable items={results} initial={5} noun="results">
          {(row, index) => (
            <View key={row.id} style={{ gap: theme.spacing.xs }}>
              {index > 0 ? <Divider /> : null}
              <PillRow>
                <Pill
                  label={row.outcome === 'PASS' ? 'Passed' : 'Failed'}
                  tone={row.outcome === 'PASS' ? 'success' : 'danger'}
                />
                {row.severity ? (
                  <Pill label={SEVERITY_LABELS[row.severity]} tone={SEVERITY_TONES[row.severity]} />
                ) : null}
                {row.retestRequired ? <Pill label="Retest needed" tone="warning" /> : null}
              </PillRow>
              <AppText size="xs" tone="faint">
                {row.recordedByName} · {formatDateTime(row.createdAt)} ·{' '}
                {ENVIRONMENT_LABELS[row.environment]}
                {row.browserDevice ? ` · ${row.browserDevice}` : ''}
              </AppText>
              <Labelled label="Tested" text={row.whatTested} />
              <Labelled label="Result" text={row.actualResult} />
              {row.failureDescription ? (
                <Labelled label="Broken" text={row.failureDescription} />
              ) : null}
              {row.commentForDeveloper ? (
                <Labelled label="For the developer" text={row.commentForDeveloper} />
              ) : null}
              {row.evidenceFileId ? (
                <AppText size="xs" tone="muted">
                  Evidence attached to the work
                </AppText>
              ) : null}
            </View>
          )}
        </Expandable>
      )}
    </Section>
  );
}

function Labelled({ label, text }: { label: string; text: string }) {
  return (
    <AppText size="sm">
      <AppText size="sm" weight="bold">
        {label}:{' '}
      </AppText>
      {text}
    </AppText>
  );
}
