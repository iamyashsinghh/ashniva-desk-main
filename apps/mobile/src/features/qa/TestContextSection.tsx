import type { TestingAssignmentDetail } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { CHECK_STATUS_LABELS, CHECK_STATUS_TONES, ENVIRONMENT_LABELS } from './qa-labels';
import { QaStagingLink } from './QaStagingLink';

/**
 * Everything the developer wrote down when they handed the work over.
 *
 * A tester should never have to go and ask what changed, so each part is shown even when it is
 * empty — an unanswered "what to test" is a fact about the handover, not a section to hide.
 */
export function TestContextSection({ assignment }: { assignment: TestingAssignmentDetail }) {
  const theme = useTheme();
  return (
    <Section title="What to test" icon="list-outline">
      {assignment.checksStatus ? (
        <Pill
          label={CHECK_STATUS_LABELS[assignment.checksStatus]}
          tone={CHECK_STATUS_TONES[assignment.checksStatus]}
        />
      ) : (
        <AppText size="xs" tone="faint">
          No automated checks reported
        </AppText>
      )}

      <Part title="What was developed" body={assignment.whatDeveloped} />
      <Part title="What to test" body={assignment.whatToTest} />
      <Part title="Acceptance criteria" body={assignment.acceptanceCriteria} />
      <Part title="Notes from the developer" body={assignment.developerNotes} />

      <Divider />
      <KeyValueRow label="Environment" value={ENVIRONMENT_LABELS[assignment.environment]} />
      {assignment.stagingUrl ? (
        <QaStagingLink url={assignment.stagingUrl} />
      ) : (
        <KeyValueRow label="Where" value="No URL given" />
      )}
      <View style={{ gap: theme.spacing.xs }}>
        <AppText size="sm" tone="muted">
          Browsers / devices
        </AppText>
        {assignment.browserDevice.length > 0 ? (
          <PillRow>
            {assignment.browserDevice.map((item) => (
              <Pill key={item} label={item} tone="neutral" />
            ))}
          </PillRow>
        ) : (
          <AppText size="sm">Anything you have</AppText>
        )}
      </View>
      <KeyValueRow
        label="Handed over"
        value={`${assignment.assignedByName} · ${formatDateTime(assignment.createdAt) ?? ''}`}
      />

      {assignment.clarificationQuestion ? (
        <View
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.md,
            gap: theme.spacing.xs,
            padding: theme.spacing.md,
          }}
        >
          <AppText size="sm">
            <AppText size="sm" weight="bold">
              You asked:{' '}
            </AppText>
            {assignment.clarificationQuestion}
          </AppText>
          <AppText size="sm" tone={assignment.clarificationAnswer ? 'default' : 'muted'}>
            <AppText size="sm" weight="bold">
              Answer:{' '}
            </AppText>
            {assignment.clarificationAnswer ?? 'Still waiting on the developer.'}
          </AppText>
        </View>
      ) : null}
    </Section>
  );
}

function Part({ title, body }: { title: string; body: string | null }) {
  const text = body?.trim();
  return (
    <View style={{ gap: 2 }}>
      <AppText size="sm" weight="bold">
        {title}
      </AppText>
      <AppText size="sm" tone={text ? 'default' : 'muted'}>
        {text || 'Nothing written down.'}
      </AppText>
    </View>
  );
}
