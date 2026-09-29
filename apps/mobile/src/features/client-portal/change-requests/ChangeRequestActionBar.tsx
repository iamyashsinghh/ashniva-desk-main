import type { PortalChangeRequestDetail } from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { Grow, StickyActionBar } from '../../../shared/components/layout';
import { Button } from '../../../shared/components/primitives';
import { useSession } from '../../auth/SessionProvider';
import { portalKeys } from '../portal-keys';
import {
  portalChangeRequestActions,
  type PortalChangeRequestAction,
} from './change-request-actions';
import { ChangeRequestFormSheet } from './ChangeRequestFormSheet';
import { NoteSheet } from './NoteSheet';

type Step = 'submit' | 'approve' | 'request-changes' | 'reject' | 'cancel';
type NoteStep = Exclude<Step, 'submit'>;

const NOTE_SHEETS: Record<
  NoteStep,
  { title: string; label: string; confirm: string; required: boolean; danger: boolean }
> = {
  approve: {
    title: 'Approve this change',
    label: 'Note for the provider',
    confirm: 'Approve',
    required: false,
    danger: false,
  },
  'request-changes': {
    title: 'Ask for changes',
    label: 'What should be different?',
    confirm: 'Send back',
    required: true,
    danger: false,
  },
  reject: {
    title: 'Reject this change',
    label: 'Why?',
    confirm: 'Reject',
    required: true,
    danger: true,
  },
  cancel: {
    title: 'Cancel this request',
    label: 'Why?',
    confirm: 'Cancel request',
    required: true,
    danger: true,
  },
};

const BUTTONS: Record<
  PortalChangeRequestAction,
  { label: string; variant: 'primary' | 'secondary' | 'danger' | 'ghost' }
> = {
  submit: { label: 'Submit to the provider', variant: 'primary' },
  edit: { label: 'Edit', variant: 'secondary' },
  approve: { label: 'Approve', variant: 'primary' },
  'request-changes': { label: 'Ask for changes', variant: 'secondary' },
  reject: { label: 'Reject', variant: 'danger' },
  cancel: { label: 'Cancel request', variant: 'ghost' },
};

/**
 * What the client can do next, pinned under the request.
 *
 * Every decision opens a note sheet first — the provider reads the note, and the API wants one
 * for everything except approving. Submitting sends straight away: the draft is already written.
 */
export function ChangeRequestActionBar({ cr }: { cr: PortalChangeRequestDetail }) {
  const { user, can } = useSession();
  const [sheet, setSheet] = useState<NoteStep | 'edit' | null>(null);
  const actions = portalChangeRequestActions(cr, user?.id ?? null, can);

  const step = useApiMutation<{ step: Step; note?: string }, unknown>({
    path: ({ step: name }) => `/portal/change-requests/${cr.id}/${name}`,
    body: ({ note }) => (note ? { note } : {}),
    invalidate: [portalKeys.all, ['approvals']],
    onSuccess: () => setSheet(null),
  });

  if (actions.length === 0) {
    return null;
  }

  const press = (action: PortalChangeRequestAction) => {
    step.reset();
    if (action === 'submit') {
      void step.run({ step: 'submit' });
    } else {
      setSheet(action);
    }
  };
  const noteStep = sheet && sheet !== 'edit' ? sheet : null;
  const config = noteStep ? NOTE_SHEETS[noteStep] : null;

  return (
    <>
      <StickyActionBar
        note={
          step.error && !sheet ? (
            <Banner tone="danger" role="alert">
              {step.error}
            </Banner>
          ) : undefined
        }
      >
        {actions.map((action) => (
          <Grow key={action}>
            <Button
              label={BUTTONS[action].label}
              variant={BUTTONS[action].variant}
              loading={action === 'submit' && step.busy}
              disabled={step.busy}
              onPress={() => press(action)}
            />
          </Grow>
        ))}
      </StickyActionBar>
      <NoteSheet
        visible={config !== null}
        title={config?.title ?? ''}
        subtitle={`${cr.number} · ${cr.title}`}
        label={config?.label ?? ''}
        confirmLabel={config?.confirm ?? ''}
        confirmIcon={config?.danger ? 'close' : 'checkmark'}
        required={config?.required ?? true}
        danger={config?.danger ?? false}
        busy={step.busy}
        error={step.error}
        onConfirm={(note) => {
          if (noteStep) {
            void step.run({ step: noteStep, ...(note ? { note } : {}) });
          }
        }}
        onClose={() => setSheet(null)}
      />
      <ChangeRequestFormSheet
        visible={sheet === 'edit'}
        existing={cr}
        onClose={() => setSheet(null)}
      />
    </>
  );
}
