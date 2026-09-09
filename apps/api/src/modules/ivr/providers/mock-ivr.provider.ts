import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { headerValue, verifyHmacSha256 } from '../../../common/crypto/webhook-signature';
import type { IvrReadiness } from '@ashniva/types';

import type {
  IvrCallEvent,
  IvrOutboundCallRequest,
  IvrOutboundCallResult,
  IvrProvider,
  IvrProviderAccount,
  IvrWebhookVerification,
} from '../ivr-provider.interface';
import { parseIvrEvent, readAccountId } from './ivr-payload';

/** One call the mock was asked to place, kept so a test can assert what Desk decided. */
export interface PlacedCall {
  organizationId: string;
  ticketId: string;
  agentUserId: string;
  clientPhoneRef: string;
  recordingConsent: boolean;
  providerCallId: string;
  placedAt: Date;
}

/**
 * An IVR provider that reaches no telephone.
 *
 * Used by the automated tests and the local preview, so neither needs a telephony account and
 * neither can ring a real person by accident. It is a full participant rather than a stub: it
 * returns a call id, verifies webhook signatures with the same scheme the real adapter uses, and
 * keeps what it was asked to do. That is what lets the tests exercise the parts that matter —
 * routing, fallback, the lifecycle, recording visibility — end to end.
 *
 * What it deliberately does not do is succeed unconditionally. `failNext` and `refuse` exist so a
 * test can make a destination unreachable, which is the case the whole fallback ladder is for.
 */
@Injectable()
export class MockIvrProvider implements IvrProvider {
  // 'OTHER' rather than a new key: the interface's union is the vendor list, and a mock is not a
  // vendor. Nothing branches on this beyond recording which adapter placed a historical call.
  readonly key = 'OTHER' as const;

  private readonly placed: PlacedCall[] = [];
  private failure: Error | null = null;

  async startOutboundCall(request: IvrOutboundCallRequest): Promise<IvrOutboundCallResult> {
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      throw error;
    }
    const providerCallId = `mock-call-${randomUUID()}`;
    const placedAt = new Date();
    this.placed.push({
      organizationId: request.organizationId,
      ticketId: request.ticketId,
      agentUserId: request.agentUserId,
      clientPhoneRef: request.clientPhoneRef,
      recordingConsent: request.recordingConsent,
      providerCallId,
      placedAt,
    });
    return { providerCallId, startedAt: placedAt };
  }

  async transferCall(): Promise<void> {
    // Nothing to transfer: the mock holds no live legs.
  }

  async endCall(): Promise<void> {
    // Nothing to hang up.
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    secret: string,
  ): IvrWebhookVerification {
    const signature = headerValue(headers, 'x-ivr-signature');
    if (!verifyHmacSha256(rawBody, signature, secret)) {
      return { valid: false, deliveryId: undefined };
    }
    const delivery = headerValue(headers, 'x-ivr-delivery');
    return {
      valid: true,
      deliveryId: delivery ?? `digest:${createHash('sha256').update(rawBody).digest('hex')}`,
    };
  }

  accountIdFromPayload(payload: unknown): string | null {
    return readAccountId(payload);
  }

  parseWebhookEvent(payload: unknown): IvrCallEvent {
    return parseIvrEvent(payload);
  }

  async recordingUrl(
    recordingRef: string,
    _account: IvrProviderAccount,
    ttlSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    return {
      url: `https://ivr.invalid/recordings/${encodeURIComponent(recordingRef)}`,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  /** Ready by construction: it reaches no telephone, so there is nothing left to configure. */
  async readiness(): Promise<Omit<IvrReadiness, 'provider'>> {
    return {
      healthy: true,
      ready: ['The mock adapter is selected. It answers every call and rings no telephone.'],
      missing: [],
      behaviourWhenUnready: 'Not applicable: the mock adapter is always ready.',
    };
  }

  // -----------------------------------------------------------------------------------------
  // Test helpers
  // -----------------------------------------------------------------------------------------

  calls(): readonly PlacedCall[] {
    return this.placed;
  }

  lastCall(): PlacedCall | undefined {
    return this.placed.at(-1);
  }

  /** Makes the next placement fail, so a test can walk the fallback ladder. */
  failNext(error: Error): void {
    this.failure = error;
  }

  reset(): void {
    this.placed.length = 0;
    this.failure = null;
  }
}
