/**
 * Masks a recipient address for the delivery history.
 *
 * A delivery log is an operational record — did this go out, did it bounce — not a directory.
 * Someone reading it needs to recognise a row they are looking for, not read out an address, so
 * enough is kept to identify a row and no more.
 */

/** Masks an email address: first and last character of the local part, domain intact. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) {
    // Not an address shape. Mask it wholesale rather than guess at its structure.
    return maskAll(address);
  }
  const local = address.slice(0, at);
  const domain = address.slice(at);
  if (local.length <= 2) {
    return `${'•'.repeat(local.length)}${domain}`;
  }
  return `${local[0]}${'•'.repeat(Math.min(local.length - 2, 5))}${local.at(-1)}${domain}`;
}

/** Masks a phone number, keeping the last three digits and any leading plus. */
export function maskPhone(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits.length <= 3) {
    return maskAll(number);
  }
  const plus = number.trim().startsWith('+') ? '+' : '';
  return `${plus}${'•'.repeat(Math.min(digits.length - 3, 9))}${digits.slice(-3)}`;
}

export function maskDestination(channel: 'EMAIL' | 'WHATSAPP', destination: string): string {
  return channel === 'EMAIL' ? maskEmail(destination) : maskPhone(destination);
}

function maskAll(value: string): string {
  return '•'.repeat(Math.min(Math.max(value.length, 1), 8));
}
