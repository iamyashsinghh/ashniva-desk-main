import type { ReactNode } from 'react';

import { Banner } from '../../../shared/components/feedback';
import type { IconName } from '../../../shared/components/Icon';
import { AppText, Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';

/**
 * "Are you sure?" for a change that is hard to take back and needs no password — suspending or
 * removing a person. The consequence is spelled out, and the confirming button says the verb
 * rather than "OK", so the last tap is an informed one.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  confirmIcon,
  destructive = true,
  busy = false,
  error = null,
  onClose,
  onConfirm,
  children,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button label="Keep" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={confirmLabel}
            {...(confirmIcon ? { icon: confirmIcon } : {})}
            variant={destructive ? 'danger' : 'primary'}
            loading={busy}
            onPress={onConfirm}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <AppText tone="muted">{message}</AppText>
      {children}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
