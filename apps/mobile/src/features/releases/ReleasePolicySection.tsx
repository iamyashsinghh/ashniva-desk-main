import {
  RELEASE_APPROVER_ROLE,
  type ProjectReleasePolicySummary,
  type ReleaseApproverRole,
} from '@ashniva/types';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Chip } from '../../shared/components/chips';
import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ToggleRow } from '../tasks/ToggleRow';
import { useReleasePolicy } from './release-api';
import { APPROVER_ROLE_LABELS } from './release-display';

type PolicyInput = Omit<ProjectReleasePolicySummary, 'projectId'>;
type GateKey = Exclude<keyof PolicyInput, 'approverRoles'>;

const APPROVER_ROLES: readonly ReleaseApproverRole[] = [
  RELEASE_APPROVER_ROLE.SENIOR,
  RELEASE_APPROVER_ROLE.PROJECT_MANAGER,
  RELEASE_APPROVER_ROLE.QA_LEAD,
  RELEASE_APPROVER_ROLE.CLIENT,
  RELEASE_APPROVER_ROLE.DIRECTOR,
];

const GATES: readonly { key: GateKey; label: string; description: string }[] = [
  {
    key: 'requiresQaPass',
    label: 'Every QA check must have passed',
    description: 'And there must be at least one — a release nobody tested does not satisfy it.',
  },
  {
    key: 'requiresClientUat',
    label: 'The client must sign off',
    description: 'Ask for the sign-off from the release; the client answers it in the portal.',
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
 * What the project insists on before a release may go out — the web's policy card.
 *
 * Each change saves at once, as on the web, and the PUT carries every field: the endpoint replaces
 * the policy rather than patching it, so sending one switch would reset the rest. A release already
 * waiting for approval keeps the sign-offs it was sent out under.
 */
export function ReleasePolicySection({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const theme = useTheme();
  const query = useReleasePolicy(projectId);
  const save = useApiMutation<PolicyInput, ProjectReleasePolicySummary>({
    path: `/projects/${projectId}/release-policy`,
    method: 'PUT',
    body: (input) => input,
    invalidate: [['releases']],
  });

  const policy = query.data;
  if (!policy) {
    return null;
  }

  const update = (changes: Partial<PolicyInput>) =>
    void save.run({ ...toInput(policy), ...changes });
  const locked = !canManage || save.busy;

  return (
    <Section
      title="What this project requires"
      icon="options-outline"
      collapsible
      initiallyOpen={false}
    >
      {GATES.map((gate) => (
        <ToggleRow
          key={gate.key}
          icon="shield-outline"
          label={gate.label}
          description={gate.description}
          value={policy[gate.key]}
          disabled={locked}
          onChange={(value) => update({ [gate.key]: value })}
        />
      ))}

      <AppText size="sm" weight="medium">
        Sign-offs required
      </AppText>
      <AppText size="xs" tone="muted">
        Nobody signs off a release they asked for approval on.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {APPROVER_ROLES.map((role) => {
          const required = policy.approverRoles.includes(role);
          return (
            <Chip
              key={role}
              label={APPROVER_ROLE_LABELS[role]}
              selected={required}
              role="checkbox"
              onPress={() => {
                if (locked) {
                  return;
                }
                update({
                  approverRoles: required
                    ? policy.approverRoles.filter((entry) => entry !== role)
                    : [...policy.approverRoles, role],
                });
              }}
            />
          );
        })}
      </View>
      {policy.approverRoles.length === 0 ? (
        <AppText size="xs" tone="muted">
          No sign-off is required, so a release is approved as soon as it is submitted.
        </AppText>
      ) : null}
      <AppText size="xs" tone="faint">
        {canManage
          ? 'A release already waiting for approval keeps its sign-offs; changes apply to the next one.'
          : 'Changing these needs the release:manage permission.'}
      </AppText>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Section>
  );
}

function toInput(policy: ProjectReleasePolicySummary): PolicyInput {
  return {
    approverRoles: policy.approverRoles,
    requiresQaPass: policy.requiresQaPass,
    requiresClientUat: policy.requiresClientUat,
    requiresLiveVerification: policy.requiresLiveVerification,
    requiresTypedConfirmation: policy.requiresTypedConfirmation,
  };
}
