import {
  CREDENTIAL_ROTATION_POLICY,
  TEST_ENVIRONMENT,
  type CredentialRotationPolicy,
  type TestAccountSummary,
  type TestEnvironment,
  type TestEnvironmentRow,
} from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTestAccountMutations } from '../api';
import { ENVIRONMENT_LABELS, ROTATION_POLICY_LABELS } from '../qa-labels';

interface TestAccountPanelProps {
  projectId: string;
  environments: TestEnvironmentRow[];
  /** Editing an existing login; its password is changed by rotating, never here. */
  existing?: TestAccountSummary;
  onClose: () => void;
}

/**
 * Record or edit one reusable test login (design map 2n).
 *
 * The password is write-only: it is typed here once, sent, and never comes back — no read
 * endpoint returns it and no field on this panel can show it. Changing it later is a rotation,
 * because the grants handed out against the old one have to be revoked with it.
 */
export function TestAccountPanel({
  projectId,
  environments,
  existing,
  onClose,
}: TestAccountPanelProps) {
  const { create, update } = useTestAccountMutations(projectId);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    environment: existing?.environment ?? TEST_ENVIRONMENT.STAGING,
    environmentId: existing?.environmentId ?? '',
    label: existing?.label ?? '',
    username: existing?.username ?? '',
    secret: '',
    notes: existing?.notes ?? '',
    rotationPolicy: existing?.rotationPolicy ?? CREDENTIAL_ROTATION_POLICY.AFTER_TEST,
    isActive: existing?.isActive ?? true,
  });

  const missing = missingAccountFields(form, Boolean(existing));

  const save = () =>
    existing
      ? update.mutateAsync({
          id: existing.id,
          input: {
            environmentId: form.environmentId || undefined,
            label: form.label.trim(),
            username: form.username.trim(),
            notes: form.notes.trim(),
            rotationPolicy: form.rotationPolicy,
            isActive: form.isActive,
          },
        })
      : create.mutateAsync({
          environment: form.environment,
          environmentId: form.environmentId || undefined,
          label: form.label.trim(),
          username: form.username.trim(),
          secret: form.secret,
          notes: form.notes.trim() || undefined,
          rotationPolicy: form.rotationPolicy,
        });

  return (
    <Modal
      open
      size="lg"
      title={existing ? `Edit ${existing.label}` : 'New test login'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={missing.length > 0}
            disabledReason={`Still needed: ${missing.join(', ')}`}
            onClick={() => void wrap(save)()}
          >
            Save
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Label" required hint="How testers refer to it, e.g. Test Admin">
          <Input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
          />
        </FormField>
        <FormField label="Username" required>
          <Input
            autoComplete="off"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
          />
        </FormField>
        {existing ? null : (
          <>
            <FormField
              label="Password"
              required
              hint="Encrypted at rest. Revealing it later is timed and logged."
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={form.secret}
                onChange={(event) => setForm({ ...form, secret: event.target.value })}
              />
            </FormField>
            <FormField label="Environment" required>
              <Select
                value={form.environment}
                onChange={(event) =>
                  setForm({ ...form, environment: event.target.value as TestEnvironment })
                }
                options={Object.values(TEST_ENVIRONMENT).map((kind) => ({
                  value: kind,
                  label: ENVIRONMENT_LABELS[kind],
                }))}
              />
            </FormField>
          </>
        )}
        <FormField
          label="Deployed environment"
          hint="Optional: the exact deployment this login is for"
        >
          <Select
            value={form.environmentId}
            placeholder="Not tied to one"
            onChange={(event) => setForm({ ...form, environmentId: event.target.value })}
            options={environments.map((environment) => ({
              value: environment.id,
              label: `${ENVIRONMENT_LABELS[environment.kind]} — ${environment.url}`,
            }))}
          />
        </FormField>
        <FormField label="Password changes">
          <Select
            value={form.rotationPolicy}
            onChange={(event) =>
              setForm({ ...form, rotationPolicy: event.target.value as CredentialRotationPolicy })
            }
            options={Object.values(CREDENTIAL_ROTATION_POLICY).map((policy) => ({
              value: policy,
              label: ROTATION_POLICY_LABELS[policy],
            }))}
          />
        </FormField>
        <FormGridFull>
          <FormField label="Notes" hint="OTP route, fixed test card, anything a tester needs">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        {existing ? (
          <FormGridFull>
            <Switch
              checked={form.isActive}
              onChange={(isActive) => setForm({ ...form, isActive })}
              label="In use"
              description="Retiring a login stops new grants against it."
            />
          </FormGridFull>
        ) : null}
        {error ? (
          <FormGridFull>
            <Alert tone="danger">{error}</Alert>
          </FormGridFull>
        ) : null}
      </FormGrid>
    </Modal>
  );
}

function missingAccountFields(
  form: { label: string; username: string; secret: string },
  editing: boolean,
): string[] {
  const missing: string[] = [];
  if (form.label.trim().length < 2) {
    missing.push('a label');
  }
  if (form.username.trim().length < 1) {
    missing.push('a username');
  }
  if (!editing && form.secret.length < 8) {
    missing.push('a password of at least 8 characters');
  }
  return missing;
}
