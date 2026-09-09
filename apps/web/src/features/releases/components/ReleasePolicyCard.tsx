import {
  PERMISSIONS,
  RELEASE_APPROVER_ROLE,
  type ProjectReleasePolicySummary,
  type ReleaseApproverRole,
} from '@ashniva/types';
import { Alert, Button, Card, Switch } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { usePermission } from '../../auth/session-context';
import { useReleasePolicyMutation, useReleasePolicyQuery, type ReleasePolicyInput } from '../api';
import { APPROVER_ROLE_LABELS } from '../release-display';

const APPROVER_ROLES: ReleaseApproverRole[] = [
  RELEASE_APPROVER_ROLE.SENIOR,
  RELEASE_APPROVER_ROLE.PROJECT_MANAGER,
  RELEASE_APPROVER_ROLE.QA_LEAD,
  RELEASE_APPROVER_ROLE.CLIENT,
  RELEASE_APPROVER_ROLE.DIRECTOR,
];

const GATES: Array<{
  key: keyof Omit<ReleasePolicyInput, 'approverRoles'>;
  label: string;
  description: string;
}> = [
  {
    key: 'requiresQaPass',
    label: 'Every QA check must have passed',
    description:
      'And there must be at least one. The absence of testing does not satisfy this — that is the release nobody looked at.',
  },
  {
    key: 'requiresClientUat',
    label: 'The client must sign off',
    description: 'Ask for the sign-off from the release, and the client answers it in the portal.',
  },
  {
    key: 'requiresLiveVerification',
    label: 'A tester must verify it live',
    description: 'Before the release counts as verified, rather than merely published.',
  },
  {
    key: 'requiresTypedConfirmation',
    label: 'Type the version back to publish',
    description: 'The last thing between an operator and production.',
  },
];

/**
 * What this project insists on before a release may go out.
 *
 * These gates decide whether the Publish button works, and they used to be settable only by
 * editing the database: the endpoint existed, nothing called it, and both `requiresQaPass` and
 * `requiresLiveVerification` default on. So a project that did not want them was stuck with them,
 * and — with no way to file a QA assignment either — could never publish at all.
 *
 * Changing the policy does not change a release already in flight. The sign-offs a release needs
 * were frozen onto it when approval was requested, which is what the note at the bottom says.
 */
export function ReleasePolicyCard({ projectId }: { projectId: string }) {
  const mayEdit = usePermission(PERMISSIONS.RELEASE_MANAGE);
  const query = useReleasePolicyQuery(projectId);
  const save = useReleasePolicyMutation(projectId);
  const [error, setError] = useState<string | undefined>();

  const policy = query.data;
  if (!policy) {
    return null;
  }

  const update = async (changes: Partial<ReleasePolicyInput>) => {
    setError(undefined);
    try {
      await save.mutateAsync({ ...toInput(policy), ...changes });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const toggleRole = (role: ReleaseApproverRole) =>
    update({
      approverRoles: policy.approverRoles.includes(role)
        ? policy.approverRoles.filter((entry) => entry !== role)
        : [...policy.approverRoles, role],
    });

  return (
    <Card title="What this project requires">
      {GATES.map((gate) => (
        <Switch
          key={gate.key}
          checked={policy[gate.key]}
          disabled={!mayEdit || save.isPending}
          label={gate.label}
          description={gate.description}
          onChange={(checked) => void update({ [gate.key]: checked })}
        />
      ))}

      <p className="muted" style={{ marginTop: 12 }}>
        Sign-offs required. Nobody signs off a release they asked for approval on.
      </p>
      <div className="actions-card">
        {APPROVER_ROLES.map((role) => {
          const required = policy.approverRoles.includes(role);
          return (
            <Button
              key={role}
              variant={required ? 'primary' : 'ghost'}
              disabled={!mayEdit || save.isPending}
              disabledReason="Changing the gates needs the release:manage permission"
              aria-pressed={required}
              onClick={() => void toggleRole(role)}
            >
              {APPROVER_ROLE_LABELS[role]}
            </Button>
          );
        })}
      </div>
      {policy.approverRoles.length === 0 ? (
        <p className="muted">
          No sign-off is required, so a release is approved as soon as it is submitted.
        </p>
      ) : null}
      <p className="muted">
        A release already waiting for approval keeps the sign-offs it was sent out under; changes
        here apply to the next one.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Card>
  );
}

function toInput(policy: ProjectReleasePolicySummary): ReleasePolicyInput {
  return {
    approverRoles: policy.approverRoles,
    requiresQaPass: policy.requiresQaPass,
    requiresClientUat: policy.requiresClientUat,
    requiresLiveVerification: policy.requiresLiveVerification,
    requiresTypedConfirmation: policy.requiresTypedConfirmation,
  };
}
