import { BadRequestException } from '@nestjs/common';
import { IVR_CALL_EVENT_TYPES, type IvrCallEventName } from '@ashniva/types';

import type { IvrCallEvent } from '../ivr-provider.interface';

/**
 * Reading an inbound IVR delivery.
 *
 * Shared by every adapter because the *shape* Desk works in is Desk's, not a vendor's: an adapter
 * translates whatever its provider sends into this, and only the translation differs. Keeping the
 * reader in one place means the validation — which is the part that faces an unauthenticated
 * caller — is written once and hardened once.
 *
 * Everything here treats the payload as hostile. It is parsed before any signature check has
 * necessarily passed, so it may not throw on unexpected shapes in a way that leaks, may not
 * coerce, and above all may not carry an organization, project or ticket id into anything that
 * gets written. The only field with authority is the provider's call id, and even that is used
 * as a lookup key against rows Desk created itself.
 */

const EVENT_NAMES = new Set<string>(IVR_CALL_EVENT_TYPES);

function record(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.length > max ? null : trimmed;
}

/** The account a delivery claims to belong to. A claim: the signature is what proves it. */
export function readAccountId(payload: unknown): string | null {
  const body = record(payload);
  return body ? text(body.accountId) : null;
}

/**
 * Turns one delivery into the event Desk acts on.
 *
 * Rejects rather than guesses. An event type nobody recognises, a missing call id or a timestamp
 * that is not a timestamp all end here, because a half-understood telephony event applied to a
 * call record is worse than a rejected delivery the provider will retry.
 */
export function parseIvrEvent(payload: unknown): IvrCallEvent {
  const body = record(payload);
  if (!body) {
    throw new BadRequestException('Unrecognised IVR payload');
  }

  const type = text(body.type, 40);
  if (!type || !EVENT_NAMES.has(type)) {
    throw new BadRequestException('Unrecognised IVR event type');
  }

  const providerCallId = text(body.callId, 120);
  if (!providerCallId) {
    throw new BadRequestException('IVR event has no call id');
  }

  const occurredAt = readDate(body.occurredAt);
  const duration = readDuration(body.durationSeconds);

  return {
    type: type as IvrCallEventName,
    providerCallId,
    occurredAt,
    ...(duration === null ? {} : { durationSeconds: duration }),
    ...(text(body.recordingRef, 500) === null
      ? {}
      : { recordingRef: text(body.recordingRef, 500) as string }),
    ...(text(body.disposition, 60) === null
      ? {}
      : { disposition: text(body.disposition, 60) as string }),
    // The raw payload is not kept: it is the provider's, it may name a phone number, and the
    // digest recorded against the delivery is enough to recognise a redelivery later.
    raw: null,
  };
}

function readDate(value: unknown): Date {
  if (typeof value !== 'string') {
    // A provider that sends no timestamp is saying "now". That is a fact Desk can supply.
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function readDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  // A day is longer than any support call, and a nonsense duration in a report is worse than
  // none: it would sit in the totals as if somebody had really been on the phone for a week.
  return Math.min(Math.floor(value), 86_400);
}
