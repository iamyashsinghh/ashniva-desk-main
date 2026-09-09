import { INVOICE_STATUS_TONES } from '@ashniva/ui/status-tone';
import type { InvoiceStatus } from '@ashniva/types';

import type { PillTone } from '../../shared/components/primitives';

/** Status colour, from the same table the web app uses. */
export function invoiceTone(status: InvoiceStatus): PillTone {
  const tone = INVOICE_STATUS_TONES[status];
  return tone === 'review' ? 'info' : tone;
}
