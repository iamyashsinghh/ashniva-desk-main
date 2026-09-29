import { PERMISSIONS, type TestingAssignmentDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { CheckRow } from './qa-controls';

/**
 * Live verification.
 *
 * After a release goes out somebody has to open production and look. The checklist is the short
 * version of what "look" means, and it is deliberately local to this screen: it guards the button,
 * it is not a record. The record is the assignment moving to Passed, which only
 * `POST /qa/assignments/:id/verify-live` can do, gated by `qa:verify-live`.
 */
export const LIVE_CHECKS = [
  'The change is actually live in production',
  'The main flow around it still works end to end',
  'No new errors or alerts since the deploy',
  'Client data looks right — nothing lost or duplicated',
  'You know how to roll back if it turns out badly',
] as const;

export function LiveVerificationSection({
  assignment,
  onReportFailure,
  onVerified,
}: {
  assignment: TestingAssignmentDetail;
  /** Opens the ordinary pass/fail sheet, which is how a live failure is reported. */
  onReportFailure: () => void;
  onVerified: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const canVerify = can(PERMISSIONS.QA_VERIFY_LIVE);
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const verify = useApiMutation<void, TestingAssignmentDetail>({
    path: `/qa/assignments/${assignment.id}/verify-live`,
    invalidate: [['qa'], ['releases']],
    onSuccess: onVerified,
  });

  const remaining = LIVE_CHECKS.length - ticked.length;
  const reason = canVerify
    ? `${remaining} check${remaining === 1 ? '' : 's'} still to confirm`
    : 'Signing off production needs the qa:verify-live permission';
  const blocked = !canVerify || remaining > 0;

  const toggle = (check: string) =>
    setTicked((current) =>
      current.includes(check) ? current.filter((item) => item !== check) : [...current, check],
    );

  return (
    <Section title="Live verification" icon="pulse-outline">
      <View>
        {LIVE_CHECKS.map((check) => (
          <CheckRow
            key={check}
            label={check}
            checked={ticked.includes(check)}
            onToggle={() => toggle(check)}
          />
        ))}
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label="Verify live"
          icon="checkmark-done-outline"
          loading={verify.busy}
          disabled={blocked}
          accessibilityHint={blocked ? reason : 'Marks the release as verified in production'}
          onPress={() => void verify.run()}
        />
        {blocked ? (
          <AppText size="xs" tone="muted">
            {reason}
          </AppText>
        ) : null}
        <Button
          label="Something is wrong live"
          icon="warning-outline"
          variant="dangerGhost"
          onPress={onReportFailure}
        />
      </View>
      {verify.error ? (
        <Banner tone="danger" role="alert">
          {verify.error}
        </Banner>
      ) : null}
    </Section>
  );
}
