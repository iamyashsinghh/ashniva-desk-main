import { TEST_ENVIRONMENT, type ReleaseDetail, type TestEnvironment } from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReleaseMutations } from '../api';
import { ENVIRONMENT_LABELS } from '../release-display';

/**
 * Version, title, notes and target environment, while the release is still a draft.
 *
 * The version is offered here and nowhere else: from the moment approval is requested it is what
 * the approvers signed, what the operator types back at publish time, and what the client will be
 * told shipped.
 */
export function ReleaseEditModal({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const { update } = useReleaseMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    version: release.version,
    title: release.title,
    notes: release.notes ?? '',
    environment: release.environment,
  });

  const valid = form.version.trim().length > 0 && form.title.trim().length >= 3;

  return (
    <Modal
      open
      title={`Edit ${release.version}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={update.isPending}
            disabled={!valid}
            disabledReason="A version and a title of at least three characters are required"
            onClick={() =>
              void wrap(() =>
                update.mutateAsync({
                  id: release.id,
                  input: {
                    version: form.version.trim(),
                    title: form.title.trim(),
                    notes: form.notes.trim() || null,
                    environment: form.environment,
                  },
                }),
              )()
            }
          >
            Save
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField
          label="Version"
          required
          hint="Letters, digits, . _ + and - — it is typed back to confirm the publish"
        >
          <Input
            value={form.version}
            onChange={(event) => setForm({ ...form, version: event.target.value })}
          />
        </FormField>
        <FormField label="Environment">
          <Select
            value={form.environment}
            onChange={(event) =>
              setForm({ ...form, environment: event.target.value as TestEnvironment })
            }
            options={Object.values(TEST_ENVIRONMENT).map((value) => ({
              value,
              label: ENVIRONMENT_LABELS[value],
            }))}
          />
        </FormField>
        <FormGridFull>
          <FormField label="Title" required>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField
            label="Notes"
            hint="Internal: the plan, and what to watch after it goes out. Never shown to a client."
          >
            <Textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </FormField>
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
