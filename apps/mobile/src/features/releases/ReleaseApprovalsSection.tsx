import { RELEASE_APPROVAL_DECISION, type ReleaseDetail } from '@ashniva/types';
import { View } from 'react-native';

import { Section } from '../../shared/components/layout';
import { AppText, Divider, Pill } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useReleasePolicy } from './release-api';
import { APPROVER_ROLE_LABELS, DECISION_LABELS, DECISION_TONES, isDraft } from './release-display';

/**
 * The sign-offs this release is actually waiting on.
 *
 * The rows are a snapshot written from the project's policy when approval was requested, so
 * "the project requires a QA lead" and "this release is waiting on a QA lead" are different
 * statements. Before the snapshot exists the policy is the only answer, so only then is it read.
 */
export function ReleaseApprovalsSection({ release }: { release: ReleaseDetail }) {
  const theme = useTheme();
  const none = release.approvals.length === 0;
  const policy = useReleasePolicy(release.projectId, none);

  return (
    <Section
      title="Sign-offs"
      icon="people-outline"
      {...(none ? {} : { count: release.approvals.length })}
    >
      {none ? (
        <>
          <AppText size="sm" tone="muted">
            No sign-offs have been recorded. They are fixed onto the release when approval is
            requested.
          </AppText>
          {policy.data ? (
            <AppText size="sm" tone="muted">
              {policy.data.approverRoles.length === 0
                ? 'This project requires no sign-off.'
                : `This project currently asks for: ${policy.data.approverRoles
                    .map((role) => APPROVER_ROLE_LABELS[role])
                    .join(', ')}.`}
            </AppText>
          ) : null}
        </>
      ) : (
        <>
          <AppText size="xs" tone="faint">
            Fixed when approval was requested.
          </AppText>
          {release.approvals.map((approval, index) => (
            <View key={approval.id} style={{ gap: theme.spacing.xs }}>
              {index > 0 ? <Divider /> : null}
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
                <AppText weight="medium" style={{ flex: 1 }}>
                  {APPROVER_ROLE_LABELS[approval.approverRole]}
                </AppText>
                <Pill
                  label={DECISION_LABELS[approval.decision]}
                  tone={DECISION_TONES[approval.decision]}
                />
              </View>
              <AppText size="xs" tone="muted">
                {approval.decision === RELEASE_APPROVAL_DECISION.PENDING
                  ? 'Not decided yet'
                  : `${approval.approverName ?? 'Someone'} · ${formatDateTime(approval.decidedAt) ?? ''}`}
              </AppText>
              {approval.note ? <AppText size="sm">{approval.note}</AppText> : null}
            </View>
          ))}
        </>
      )}
      {isDraft(release.status) && !none ? (
        <AppText size="xs" tone="faint">
          These will be collected again when approval is next requested.
        </AppText>
      ) : null}
    </Section>
  );
}
