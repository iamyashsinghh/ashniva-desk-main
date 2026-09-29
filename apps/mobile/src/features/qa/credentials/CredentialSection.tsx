import {
  PERMISSIONS,
  type CredentialGrantSummary,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { KeyValueRow, ListRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useSession } from '../../auth/SessionProvider';
import { revealBlockedReason } from '../qa-display';
import { ENVIRONMENT_LABELS, ROTATION_POLICY_LABELS } from '../qa-labels';
import { CredentialReveal } from './CredentialReveal';

/**
 * The test login attached to an assignment, and the timed reveal.
 *
 * A reveal runs against the caller's own grant, and the API hands the grant id back only when the
 * grant is issued — there is no endpoint that lists the grants a person holds. So this can reveal
 * a grant issued here and says plainly what to do when the grant was issued somewhere else,
 * rather than offering a button that would 404.
 */
export function CredentialSection({
  assignment,
  onOpenAccounts,
}: {
  assignment: TestingAssignmentDetail;
  onOpenAccounts: () => void;
}) {
  const { user, can } = useSession();
  const canManage = can(PERMISSIONS.TEST_ACCOUNT_MANAGE);
  const canReveal = can(PERMISSIONS.TEST_CREDENTIAL_REVEAL);
  const [issued, setIssued] = useState<CredentialGrantSummary | null>(null);
  const grant = useApiMutation<{ testAccountId: string }, CredentialGrantSummary>({
    path: (variables) => `/test-accounts/${variables.testAccountId}/grant`,
    body: () => ({
      grantedToUserId: user?.id,
      reason: `${assignment.kind} of ${assignment.subjectLabel}`,
      assignmentId: assignment.id,
    }),
    invalidate: [['qa']],
    onSuccess: setIssued,
  });
  const account = assignment.testAccount;

  if (!account) {
    return (
      <Section title="Test login" icon="key-outline">
        <AppText size="sm" weight="medium">
          No test login attached
        </AppText>
        <AppText size="sm" tone="muted">
          Sign in with your own account, or ask for one to be attached to this assignment.
        </AppText>
        {canManage ? <AccountsLink assignment={assignment} onPress={onOpenAccounts} /> : null}
      </Section>
    );
  }

  const mine = issued && issued.grantedToUserId === user?.id ? issued : null;
  const accessPill = account.hasActiveGrant || mine ? 'You have access' : 'No access yet';

  return (
    <Section title="Test login" icon="key-outline">
      {account.isActive ? (
        <Pill label={accessPill} tone={account.hasActiveGrant || mine ? 'success' : 'neutral'} />
      ) : (
        <Pill label="Retired" tone="warning" />
      )}
      <KeyValueRow label="Account" value={account.label} />
      <KeyValueRow label="Username" value={account.username} />
      <KeyValueRow label="Environment" value={ENVIRONMENT_LABELS[account.environment]} />
      <KeyValueRow
        label="Password changes"
        value={`${ROTATION_POLICY_LABELS[account.rotationPolicy]}${
          account.rotatedAt ? ` · last changed ${formatDateTime(account.rotatedAt)}` : ''
        }`}
      />
      {account.notes ? <KeyValueRow label="Notes" value={account.notes} /> : null}

      <CredentialReveal
        grantId={mine?.id ?? null}
        unavailableReason={revealBlockedReason({
          account,
          hasOwnGrant: mine !== null,
          canReveal,
          canManage,
        })}
      />

      {canManage && !mine ? (
        <Button
          label="Grant myself access"
          icon="key-outline"
          size="sm"
          variant="secondary"
          loading={grant.busy}
          disabled={!account.isActive}
          {...(account.isActive ? {} : { accessibilityHint: 'This login has been retired' })}
          onPress={() => void grant.run({ testAccountId: account.id })}
        />
      ) : null}
      {mine ? (
        <AppText size="xs" tone="muted">
          Access until {formatDateTime(mine.expiresAt)} · granted for “{mine.reason}”
        </AppText>
      ) : null}
      {grant.error ? (
        <Banner tone="danger" role="alert">
          {grant.error}
        </Banner>
      ) : null}
      {canManage ? <AccountsLink assignment={assignment} onPress={onOpenAccounts} /> : null}
    </Section>
  );
}

/**
 * The project's other logins. Listing them needs `test-account:manage` on the API, so the link is
 * drawn only for somebody who holds it rather than opening onto a refusal.
 */
function AccountsLink({
  assignment,
  onPress,
}: {
  assignment: TestingAssignmentDetail;
  onPress: () => void;
}) {
  return (
    <ListRow
      title={`All test logins for ${assignment.projectName}`}
      icon="people-outline"
      iconTone="warning"
      onPress={onPress}
    />
  );
}
