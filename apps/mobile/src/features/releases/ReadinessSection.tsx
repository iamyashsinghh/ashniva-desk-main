import {
  RELEASE_STATUS,
  TESTING_ASSIGNMENT_KIND,
  type ReleaseDetail,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Icon } from '../../shared/components/Icon';
import { Section } from '../../shared/components/layout';
import { AppText, Pill } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { SendToTestingButton } from '../qa/SendToTestingSheet';
import { GATE_LABELS } from './release-display';

/**
 * The readiness checklist, as the server computed it.
 *
 * Nothing is worked out on the phone: `publishable` and every gate's `satisfied` and `reason`
 * arrive on the release and are printed. Unsatisfied gates are listed first as blockers, so the
 * person who has to clear them does not read the whole checklist to find them.
 *
 * The testing hand-off lives here because the QA gate is what it satisfies. Before publishing it
 * asks for QA on the release as a whole; once published it asks for the live check that "Verify
 * live" waits on.
 */
export function ReadinessSection({
  release,
  onOpenAssignment,
}: {
  release: ReleaseDetail;
  onOpenAssignment?: (assignmentId: string) => void;
}) {
  const theme = useTheme();
  const { readiness } = release;
  const blockers = readiness.gates.filter((gate) => !gate.satisfied);
  const published = release.status === RELEASE_STATUS.PUBLISHED;
  const onSent = onOpenAssignment
    ? (assignment: TestingAssignmentDetail) => onOpenAssignment(assignment.id)
    : undefined;

  return (
    <Section
      title="Readiness"
      icon="shield-checkmark-outline"
      action={
        readiness.publishable ? (
          <Pill label="Ready to publish" tone="success" />
        ) : (
          <Pill
            label={blockers.length === 1 ? '1 blocker' : `${blockers.length} blockers`}
            tone="danger"
          />
        )
      }
    >
      {blockers.length > 0 ? (
        <Banner tone="danger" title="Unresolved blockers">
          <View style={{ gap: 2 }}>
            {blockers.map((gate) => (
              <AppText key={gate.key} size="sm" tone="danger">
                • {gate.reason}
              </AppText>
            ))}
          </View>
        </Banner>
      ) : null}

      {readiness.gates.map((gate) => (
        <View
          key={gate.key}
          accessible
          accessibilityLabel={`${GATE_LABELS[gate.key]}: ${gate.satisfied ? 'satisfied' : 'blocked'}. ${gate.reason}`}
          style={{ flexDirection: 'row', gap: theme.spacing.sm }}
        >
          <Icon
            name={gate.satisfied ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={gate.satisfied ? theme.colors.success : theme.colors.danger}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size="sm" weight="medium">
              {GATE_LABELS[gate.key]}
            </AppText>
            <AppText size="xs" tone="muted">
              {gate.reason}
            </AppText>
          </View>
        </View>
      ))}

      {readiness.publishable && readiness.requiresTypedConfirmation ? (
        <AppText size="xs" tone="faint">
          Publishing this project’s releases asks for the version, typed back.
        </AppText>
      ) : null}

      <SendToTestingButton
        subject={{
          projectId: release.projectId,
          releaseId: release.id,
          label: release.version,
          whatToTest: `${release.version} — ${release.title}`,
        }}
        {...(published
          ? { kind: TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION, label: 'Send for live check' }
          : {})}
        {...(onSent ? { onSent } : {})}
      />
    </Section>
  );
}
