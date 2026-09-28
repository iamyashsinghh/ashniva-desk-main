import { formatDate } from '../../shared/format/format';

/**
 * An invoice date in the device's own format when it parses, and the API's string when it does
 * not — an unreadable date shown as sent is better than a blank where the due date was.
 */
export function invoiceDate(value: string): string {
  return formatDate(value) ?? value;
}
