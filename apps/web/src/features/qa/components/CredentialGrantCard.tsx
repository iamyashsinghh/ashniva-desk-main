import {
  PERMISSIONS,
  type CredentialGrantSummary,
  type TestAccountSummary,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  type DescriptionItem,
} from '@ashniva/ui';
import { useState } from 'react';
import { Link } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useCurrentUser, usePermission } from '../../auth/session-context';
import { useQaMutations } from '../api';
import { ENVIRONMENT_LABELS, ROTATION_POLICY_LABELS } from '../qa-labels';
import { CredentialReveal } from './CredentialReveal';

/**
 * The test login attached to an assignment, and the timed reveal.
 *
 * A reveal runs against the caller's own grant, and the API hands the grant id back only when the
 * grant is issued (`POST /test-accounts/:id/grant`) — there is no endpoint that lists the grants a
 * person holds. So the card can reveal a grant issued here and says plainly what to do when the
 * grant was issued somewhere else, rather than offering a button that would 404.
 */
export function CredentialGrantCard({ assignment }: { assignment: TestingAssignmentDetail }) {
  const account = assignment.testAccount;
  const me = useCurrentUser();
  const canManage = usePermission(PERMISSIONS.TEST_ACCOUNT_MANAGE);
  const canReveal = usePermission(PERMISSIONS.TEST_CREDENTIAL_REVEAL);
  const { grant } = useQaMutations();
  const [issued, setIssued] = useState<CredentialGrantSummary | null>(null);
  const [error, setError] = useState<string | undefined>();

  if (!account) {
    return (
      <Card title="Test login">
        <EmptyState
          title="No test login attached"
          description="Sign in with your own account, or ask for one to be attached to this assignment."
        />
      </Card>
    );
  }

  const mine = issued && issued.grantedToUserId === me.id ? issued : null;

  async function issueToMe(target: TestAccountSummary) {
    setError(undefined);
    try {
      setIssued(
        await grant.mutateAsync({
          testAccountId: target.id,
          grantedToUserId: me.id,
          reason: `${assignment.kind} of ${assignment.subjectLabel}`,
          assignmentId: assignment.id,
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card
      title="Test login"
      headerAddon={
        account.isActive ? (
          <Badge tone={account.hasActiveGrant ? 'success' : 'neutral'}>
            {account.hasActiveGrant ? 'You have access' : 'No access yet'}
          </Badge>
        ) : (
          <Badge tone="warning">Retired</Badge>
        )
      }
    >
      <DescriptionList items={accountItems(account)} />

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
        <div className="qa-card__actions">
          <Button
            size="sm"
            loading={grant.isPending}
            disabled={!account.isActive}
            disabledReason="This login has been retired"
            onClick={() => void issueToMe(account)}
          >
            Grant myself access
          </Button>
        </div>
      ) : null}
      {mine ? (
        <p className="muted">
          Access until {formatDateTime(mine.expiresAt)} · granted for “{mine.reason}”
        </p>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="muted">
        <Link to={`/projects/${assignment.projectId}/test-accounts`}>
          All test logins for {assignment.projectName}
        </Link>
      </p>
    </Card>
  );
}

interface RevealBlockInput {
  account: TestAccountSummary;
  hasOwnGrant: boolean;
  canReveal: boolean;
  canManage: boolean;
}

/** Why the reveal button is off. Never "you cannot" alone — always what would turn it on. */
function revealBlockedReason({
  account,
  hasOwnGrant,
  canReveal,
  canManage,
}: RevealBlockInput): string | undefined {
  if (!canReveal) {
    return 'Reading a test password needs the test-credential:reveal permission';
  }
  if (!account.isActive) {
    return 'This login has been retired';
  }
  if (hasOwnGrant) {
    return undefined;
  }
  if (account.hasActiveGrant) {
    return canManage
      ? 'Your grant was issued elsewhere — grant yourself access here to read it'
      : 'Your grant was issued elsewhere — ask for it to be granted again from this screen';
  }
  return canManage
    ? 'Grant yourself access first; every reveal is logged against that grant'
    : 'Ask whoever looks after this login to grant you access';
}

/** One test login's rows. Notes are optional and most accounts have none. */
function accountItems(account: TestAccountSummary): DescriptionItem[] {
  const items: DescriptionItem[] = [
    { key: 'account', term: 'Account', description: account.label },
    { key: 'username', term: 'Username', description: <code>{account.username}</code> },
    {
      key: 'environment',
      term: 'Environment',
      description: ENVIRONMENT_LABELS[account.environment],
    },
    {
      key: 'password-changes',
      term: 'Password changes',
      description: `${ROTATION_POLICY_LABELS[account.rotationPolicy]}${
        account.rotatedAt ? ` · last changed ${formatDateTime(account.rotatedAt)}` : ''
      }`,
    },
  ];
  if (account.notes) {
    items.push({ key: 'notes', term: 'Notes', description: account.notes });
  }
  return items;
}
