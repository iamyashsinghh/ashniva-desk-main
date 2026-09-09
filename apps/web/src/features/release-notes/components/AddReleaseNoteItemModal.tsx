import { RELEASE_NOTE_ITEM_KIND_LABELS, type ReleaseNoteItemKind } from '@ashniva/types';
import { Alert, Button, FormField, FormGrid, Input, Modal, Select, Switch } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReleaseNoteMutations } from '../api';

const KINDS = Object.keys(RELEASE_NOTE_ITEM_KIND_LABELS) as ReleaseNoteItemKind[];

/** Add a line the generator did not find, or one written from scratch. */
export function AddReleaseNoteItemModal({
  releaseNoteId,
  onClose,
}: {
  releaseNoteId: string;
  onClose: () => void;
}) {
  const { addItem } = useReleaseNoteMutations(releaseNoteId);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    kind: 'MANUAL' as ReleaseNoteItemKind,
    label: '',
    clientVisible: true,
  });

  return (
    <Modal
      open
      title="Add a line"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={addItem.isPending}
            disabled={form.label.trim().length === 0}
            disabledReason="Write what the line should say"
            onClick={() =>
              void wrap(() =>
                addItem.mutateAsync({
                  kind: form.kind,
                  label: form.label.trim(),
                  clientVisible: form.clientVisible,
                }),
              )()
            }
          >
            Add
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Kind">
          <Select
            value={form.kind}
            onChange={(event) =>
              setForm({ ...form, kind: event.target.value as ReleaseNoteItemKind })
            }
            options={KINDS.map((kind) => ({
              value: kind,
              label: RELEASE_NOTE_ITEM_KIND_LABELS[kind],
            }))}
          />
        </FormField>
        <FormField label="What changed" required hint="Write it the way the client would say it">
          <Input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
          />
        </FormField>
        <Switch
          label="Show this line to the client"
          checked={form.clientVisible}
          onChange={(checked) => setForm({ ...form, clientVisible: checked })}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </FormGrid>
    </Modal>
  );
}
