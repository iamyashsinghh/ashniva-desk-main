import type { IconName } from '../../shared/components/Icon';
import { Button } from '../../shared/components/primitives';

/** The pinned footer of a billing sheet: back out, or do it. */
export function SheetActions({
  confirmLabel,
  confirmIcon,
  onConfirm,
  onCancel,
  busy,
  disabled = false,
  danger = false,
}: {
  confirmLabel: string;
  confirmIcon: IconName;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <>
      <Button label="Back" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
      <Button
        label={confirmLabel}
        icon={confirmIcon}
        variant={danger ? 'danger' : 'primary'}
        loading={busy}
        disabled={disabled}
        onPress={onConfirm}
        style={{ flex: 1 }}
      />
    </>
  );
}
