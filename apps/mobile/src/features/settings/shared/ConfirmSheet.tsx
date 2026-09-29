import { Banner } from '../../../shared/components/feedback';
import { AppText, Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';

/**
 * "Are you sure?" for a change that cannot be taken back by pressing Save again — deleting a
 * policy, revoking a credential. The consequence is stated in the body, not implied by red.
 */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button label={cancelLabel} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={confirmLabel}
            variant="danger"
            loading={busy}
            onPress={onConfirm}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <AppText>{message}</AppText>
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
