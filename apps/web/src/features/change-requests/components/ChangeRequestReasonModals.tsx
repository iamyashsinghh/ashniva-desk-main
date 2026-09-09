import { ReasonModal } from '../../../shared/components/ReasonModal';

/** Workflow steps that ask for a note or a reason before they run. */
export type NoteStep = 'send-to-client' | 'request-changes' | 'reject' | 'cancel' | 'complete';

interface Spec {
  step: NoteStep;
  title: string;
  label: string;
  submitLabel: string;
  required: boolean;
  variant: 'primary' | 'danger' | 'accent';
}

const SPECS: Spec[] = [
  {
    step: 'send-to-client',
    title: 'Send to the client',
    label: 'Message to the client',
    submitLabel: 'Send for approval',
    required: false,
    variant: 'accent',
  },
  {
    step: 'request-changes',
    title: 'Request changes',
    label: 'What needs to change?',
    submitLabel: 'Request changes',
    required: true,
    variant: 'primary',
  },
  {
    step: 'reject',
    title: 'Reject this request',
    label: 'Why?',
    submitLabel: 'Reject',
    required: true,
    variant: 'danger',
  },
  {
    step: 'cancel',
    title: 'Cancel this request',
    label: 'Why?',
    submitLabel: 'Cancel request',
    required: true,
    variant: 'danger',
  },
  {
    step: 'complete',
    title: 'Mark as completed',
    label: 'Closing note',
    submitLabel: 'Complete',
    required: false,
    variant: 'accent',
  },
];

interface ChangeRequestReasonModalsProps {
  /** Which one is open, if any. */
  open: NoteStep | null;
  busy: boolean;
  onSubmit: (step: NoteStep, note: string) => Promise<unknown>;
  onClose: () => void;
}

/** The "explain why" dialogs of the change-request workflow, in one place. */
export function ChangeRequestReasonModals({
  open,
  busy,
  onSubmit,
  onClose,
}: ChangeRequestReasonModalsProps) {
  return (
    <>
      {SPECS.map((spec) => (
        <ReasonModal
          key={spec.step}
          open={open === spec.step}
          title={spec.title}
          label={spec.label}
          submitLabel={spec.submitLabel}
          required={spec.required}
          variant={spec.variant}
          busy={busy}
          onSubmit={(note) => onSubmit(spec.step, note)}
          onClose={onClose}
        />
      ))}
    </>
  );
}
