import {
  TEST_ENVIRONMENT,
  TEST_ENVIRONMENT_STATUS,
  type TestEnvironment,
  type TestEnvironmentRow,
  type TestEnvironmentStatus,
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
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTestEnvironmentMutations } from '../api';
import { ENVIRONMENT_LABELS, ENVIRONMENT_STATUS_LABELS } from '../qa-labels';

interface EnvironmentFormProps {
  projectId: string;
  /** Editing an existing environment; its kind is fixed once it exists. */
  existing?: TestEnvironmentRow;
  onClose: () => void;
}

/** Record or update one deployed environment a tester can reach. */
export function EnvironmentForm({ projectId, existing, onClose }: EnvironmentFormProps) {
  const { create, update } = useTestEnvironmentMutations(projectId);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    kind: existing?.kind ?? TEST_ENVIRONMENT.STAGING,
    url: existing?.url ?? '',
    status: existing?.status ?? TEST_ENVIRONMENT_STATUS.UNKNOWN,
    deployedVersion: existing?.deployedVersion ?? '',
    deployedAt: toLocalInput(existing?.deployedAt ?? null),
    githubEnvironmentName: existing?.githubEnvironmentName ?? '',
  });

  const valid = form.url.trim().length > 0;

  const save = () => {
    const body = {
      url: form.url.trim(),
      status: form.status,
      deployedVersion: form.deployedVersion.trim() || undefined,
      deployedAt: form.deployedAt ? new Date(form.deployedAt).toISOString() : undefined,
      githubEnvironmentName: form.githubEnvironmentName.trim() || undefined,
    };
    return existing
      ? update.mutateAsync({ id: existing.id, input: body })
      : create.mutateAsync({ ...body, kind: form.kind });
  };

  return (
    <Modal
      open
      title={existing ? `Edit ${ENVIRONMENT_LABELS[existing.kind]}` : 'Add an environment'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending || update.isPending}
            disabled={!valid}
            disabledReason="An environment needs the URL a tester actually opens"
            onClick={() => void wrap(save)()}
          >
            Save
          </Button>
        </>
      }
    >
      <FormGrid>
        {existing ? null : (
          <FormField label="Environment" required>
            <Select
              value={form.kind}
              onChange={(event) =>
                setForm({ ...form, kind: event.target.value as TestEnvironment })
              }
              options={Object.values(TEST_ENVIRONMENT).map((kind) => ({
                value: kind,
                label: ENVIRONMENT_LABELS[kind],
              }))}
            />
          </FormField>
        )}
        <FormField label="Status">
          <Select
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as TestEnvironmentStatus })
            }
            options={Object.values(TEST_ENVIRONMENT_STATUS).map((status) => ({
              value: status,
              label: ENVIRONMENT_STATUS_LABELS[status],
            }))}
          />
        </FormField>
        <FormGridFull>
          <FormField
            label="URL"
            required
            hint="Where a tester goes, e.g. https://staging.acme.test"
          >
            <Input
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormField label="Deployed version">
          <Input
            value={form.deployedVersion}
            onChange={(event) => setForm({ ...form, deployedVersion: event.target.value })}
          />
        </FormField>
        <FormField label="Deployed at">
          <Input
            type="datetime-local"
            value={form.deployedAt}
            onChange={(event) => setForm({ ...form, deployedAt: event.target.value })}
          />
        </FormField>
        <FormGridFull>
          <FormField
            label="GitHub environment"
            hint="The matching GitHub environment name, so deploy webhooks land here"
          >
            <Input
              value={form.githubEnvironmentName}
              onChange={(event) => setForm({ ...form, githubEnvironmentName: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        {error ? (
          <FormGridFull>
            <Alert tone="danger">{error}</Alert>
          </FormGridFull>
        ) : null}
      </FormGrid>
    </Modal>
  );
}

/** ISO → the value a `datetime-local` input wants, in the reader's own timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
