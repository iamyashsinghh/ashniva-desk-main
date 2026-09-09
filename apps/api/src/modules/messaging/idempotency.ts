import { createHash } from 'node:crypto';
import type { MessageTemplate } from '@ashniva/types';

/**
 * The key that stops one business event being sent twice to the same person.
 *
 * The unique index on (organization, channel, key) is what actually enforces it; this function
 * only has to produce the same string for the same event. That is why the entity id is part of
 * it and the timestamp is not: a job retried a minute later must produce the same key, or the
 * retry becomes a second email.
 */
export function messageIdempotencyKey(input: {
  template: MessageTemplate;
  recipient: string;
  entityType?: string | null;
  entityId?: string | null;
  /**
   * Distinguishes repeat events about the same entity that *should* each send — a second reply
   * on a ticket, a second SLA warning at a later threshold. Leave unset when the event can only
   * meaningfully happen once.
   */
  occurrence?: string | null;
}): string {
  const parts = [
    input.template,
    input.recipient.trim().toLowerCase(),
    input.entityType ?? '',
    input.entityId ?? '',
    input.occurrence ?? '',
  ];
  // Hashed rather than concatenated: the parts can contain an address, and the key is stored,
  // indexed and logged.
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

/** A test send is always allowed through, so an administrator can press the button twice. */
export function testIdempotencyKey(recipient: string, at: Date): string {
  return messageIdempotencyKey({
    template: 'TEST',
    recipient,
    occurrence: at.toISOString(),
  });
}
