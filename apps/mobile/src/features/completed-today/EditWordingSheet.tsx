import type { ClientUpdateSummary } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Button, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { CLIENT_UPDATE_INVALIDATE, validateWording, type WordingErrors } from './completed-today';

interface WordingBody {
  title: string;
  body: string;
}

/**
 * Seniors tidy the client-facing wording before it is published (`PATCH /client-updates/:id`).
 *
 * A refusal keeps the sheet open with every word still in it; only a save closes it.
 */
export function EditWordingSheet({
  update,
  onClose,
}: {
  update: ClientUpdateSummary;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(update.title);
  const [body, setBody] = useState(update.body);
  const [errors, setErrors] = useState<WordingErrors>({});
  const edit = useApiMutation<WordingBody, ClientUpdateSummary>({
    path: `/client-updates/${update.id}`,
    method: 'PATCH',
    body: (wording) => wording,
    invalidate: CLIENT_UPDATE_INVALIDATE,
    onSuccess: onClose,
  });

  const save = () => {
    const found = validateWording(title, body);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      void edit.run({ title: title.trim(), body: body.trim() });
    }
  };

  return (
    <Sheet
      visible
      title="Edit client wording"
      subtitle="What the client reads once it is published"
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save"
            icon="checkmark"
            loading={edit.busy}
            onPress={save}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Title" {...(errors.title ? { error: errors.title } : {})}>
        <Input
          accessibilityLabel="Title"
          maxLength={200}
          value={title}
          onChangeText={setTitle}
          invalid={Boolean(errors.title)}
        />
      </Field>
      <Field
        label="Client will read"
        hint="Plain language, no internal details"
        {...(errors.body ? { error: errors.body } : {})}
      >
        <Input
          accessibilityLabel="Client will read"
          multiline
          numberOfLines={4}
          maxLength={2000}
          style={{ minHeight: 110 }}
          value={body}
          onChangeText={setBody}
          invalid={Boolean(errors.body)}
        />
      </Field>
      {edit.error ? (
        <Banner tone="danger" role="alert" title="Not saved">
          {edit.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
