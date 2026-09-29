import { INVOICE_STATUS_TONES } from '@ashniva/ui/status-tone';
import type { InvoiceStatus } from '@ashniva/types';

import type { IconTone } from '../../shared/components/Icon';
import type { PillTone } from '../../shared/components/primitives';

/** Status colour, from the same table the web app uses. */
export function invoiceTone(status: InvoiceStatus): PillTone {
  const tone = INVOICE_STATUS_TONES[status];
  return tone === 'review' ? 'info' : tone;
}

const ICON_TONES: Record<PillTone, IconTone> = {
  neutral: 'neutral',
  info: 'info',
  progress: 'primary',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
};

/** The colour of an invoice's leading tile. Overdue wins, because it is the one to act on. */
export function invoiceIconTone(status: InvoiceStatus, isOverdue: boolean): IconTone {
  return isOverdue ? 'danger' : ICON_TONES[invoiceTone(status)];
}
