import type { PortalChangeRequestDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { portalKeys } from '../portal-keys';

type Existing = Pick<
  PortalChangeRequestDetail,
  'id' | 'number' | 'title' | 'description' | 'businessReason' | 'scope' | 'impact'
>;

interface Draft {
  title: string;
  description: string;
  businessReason: string;
  scope: string;
  impact: string;
}

function draftOf(existing: Existing | undefined): Draft {
  return {
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    businessReason: existing?.businessReason ?? '',
    scope: existing?.scope ?? '',
    impact: existing?.impact ?? '',
  };
}

/** The API's own limits (`CreateChangeRequestDto`), checked before sending. */
export function changeRequestFormError(draft: Pick<Draft, 'title' | 'description'>): string | null {
  if (draft.title.trim().length < 3) {
    return 'Give it a title of at least three characters.';
  }
  if (draft.description.trim().length < 10) {
    return 'Describe the change in at least ten characters.';
  }
  return null;
}

/**
 * Raise a change request, or edit one that is still a draft or was sent back for changes.
 *
 * The portal raises for the caller's own organization, so there is no client or contact to pick —
 * the same fields the web portal form has. A new request is saved as a draft; submitting it to the
 * provider is a separate, deliberate step on the detail screen.
 */
export function ChangeRequestFormSheet({
  visible,
  existing,
  onClose,
  onSaved,
}: {
  visible: boolean;
  existing?: Existing;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const theme = useTheme();
  const tall = { minHeight: theme.spacing.xxl * 3 };
  const medium = { minHeight: theme.spacing.xxl * 2 + theme.spacing.sm };
  const [draft, setDraft] = useState<Draft>(() => draftOf(existing));
  const [wasVisible, setWasVisible] = useState(visible);
  const set = (field: keyof Draft) => (value: string) => setDraft({ ...draft, [field]: value });

  // Start from the record each time the sheet opens, not from whatever was typed and abandoned —
  // and only then: a refetch while the sheet is open must not wipe what is being typed.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(draftOf(existing));
    }
  }

  const save = useApiMutation<Draft, PortalChangeRequestDetail>({
    path: existing ? `/portal/change-requests/${existing.id}` : '/portal/change-requests',
    method: existing ? 'PATCH' : 'POST',
    body: (values) => {
      const optional = (text: string) => text.trim() || (existing ? null : undefined);
      return {
        title: values.title.trim(),
        description: values.description.trim(),
        businessReason: optional(values.businessReason),
        scope: optional(values.scope),
        impact: optional(values.impact),
      };
    },
    invalidate: [portalKeys.changeRequests],
    onSuccess: (saved) => {
      onClose();
      onSaved?.(saved.id);
    },
  });

  const problem = changeRequestFormError(draft);

  return (
    <Sheet
      visible={visible}
      title={existing ? 'Edit change request' : 'Raise a change request'}
      subtitle={existing ? existing.number : 'Saved as a draft until you submit it.'}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={existing ? 'Save' : 'Save draft'}
            icon="checkmark"
            loading={save.busy}
            disabled={problem !== null}
            onPress={() => void save.run(draft)}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field label="Title" required>
        <Input
          accessibilityLabel="Title"
          value={draft.title}
          onChangeText={set('title')}
          maxLength={200}
          placeholder="What should change, in a few words"
        />
      </Field>
      <Field label="What should change" required hint="At least ten characters.">
        <Input
          accessibilityLabel="What should change"
          value={draft.description}
          onChangeText={set('description')}
          multiline
          numberOfLines={4}
          maxLength={10000}
          style={tall}
        />
      </Field>
      <Field label="Business reason">
        <Input
          accessibilityLabel="Business reason"
          value={draft.businessReason}
          onChangeText={set('businessReason')}
          multiline
          maxLength={5000}
          style={medium}
        />
      </Field>
      <Field label="Scope">
        <Input
          accessibilityLabel="Scope"
          value={draft.scope}
          onChangeText={set('scope')}
          multiline
          maxLength={10000}
          style={medium}
        />
      </Field>
      <Field label="Impact">
        <Input
          accessibilityLabel="Impact"
          value={draft.impact}
          onChangeText={set('impact')}
          multiline
          maxLength={5000}
          style={medium}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
