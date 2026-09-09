import { Injectable, NotImplementedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { headerValue, verifyHmacSha256 } from '../../../common/crypto/webhook-signature';
import type { IvrMissingRequirement, IvrReadiness } from '@ashniva/types';

import type {
  IvrCallEvent,
  IvrOutboundCallRequest,
  IvrOutboundCallResult,
  IvrProvider,
  IvrProviderAccount,
  IvrWebhookVerification,
} from '../ivr-provider.interface';
import { parseIvrEvent, readAccountId } from './ivr-payload';

/**
 * Tata IVR adapter.
 *
 * Placing a call is still unimplemented, and deliberately so: Desk has no vendor API contract to
 * write against, and a guess at one would be worse than an honest refusal — it would look like an
 * integration and fail in production. Every *other* part of the adapter is real, because those
 * parts are Desk's own responsibility rather than the vendor's: the signature scheme is the
 * standard `sha256=<hex>` HMAC over the raw body, and the payload shape is the one documented in
 * this module's README, which a vendor-specific translation would map onto.
 *
 * What this file is for is the seam. Nothing above it changes when the real endpoints land.
 *
 * The four unimplemented methods are `async` deliberately. They are declared to return promises, so
 * a caller is entitled to write `.catch()` — and a synchronous throw from a promise-returning method
 * escapes that entirely and takes the process with it. Rejecting is what the signature promises.
 */
@Injectable()
export class TataIvrProvider implements IvrProvider {
  readonly key = 'TATA' as const;

  async startOutboundCall(_request: IvrOutboundCallRequest): Promise<IvrOutboundCallResult> {
    throw new NotImplementedException(
      'The Tata IVR click-to-call endpoint is not configured. Set IVR_PROVIDER=mock for a ' +
        'deployment without telephony.',
    );
  }

  async transferCall(_providerCallId: string, _toAgentUserId: string): Promise<void> {
    throw new NotImplementedException('The Tata IVR transfer endpoint is not configured');
  }

  async endCall(_providerCallId: string): Promise<void> {
    throw new NotImplementedException('The Tata IVR hangup endpoint is not configured');
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
      // No delivery header means the body's own digest is the idempotency key: a genuine
      // redelivery is byte-identical and so collides exactly as a repeated id would.
      deliveryId: delivery ?? `digest:${createHash('sha256').update(rawBody).digest('hex')}`,
    };
  }

  accountIdFromPayload(payload: unknown): string | null {
    return readAccountId(payload);
  }

  parseWebhookEvent(payload: unknown): IvrCallEvent {
    return parseIvrEvent(payload);
  }

  async recordingUrl(): Promise<{ url: string; expiresAt: Date }> {
    throw new NotImplementedException('The Tata IVR recording endpoint is not configured');
  }

  /**
   * What is in place, what is not, and what happens meanwhile.
   *
   * Everything Desk owns is done: the signature scheme, the delivery-id rule, the payload reader
   * and the account attribution are all real and tested. What is missing is entirely the vendor's
   * half, and this lists it item by item so that whoever can obtain it knows exactly what to ask
   * for. `docs/ivr-provider-contract.md` is the same list with the reasoning.
   */
  async readiness(account: IvrProviderAccount | null): Promise<Omit<IvrReadiness, 'provider'>> {
    const ready = [
      'Inbound webhook signature verification (sha256 HMAC over the raw body).',
      'Delivery de-duplication, falling back to the body digest when no delivery id is sent.',
      'Account attribution from the payload, proved by whichever tenant secret verifies.',
      'Event parsing, which refuses an unknown event rather than guessing at it.',
      'Per-tenant credential storage, encrypted at rest.',
    ];

    const missing = [...VENDOR_REQUIREMENTS];
    if (!account) {
      missing.unshift({
        key: 'connection',
        what: 'Your organization has no enabled IVR integration connection.',
        needs: ['An IVR integration connected with its account id, credential and webhook secret.'],
      });
    } else if (!account.baseUrl) {
      missing.unshift({
        key: 'base-url',
        what: 'The connection has no API base URL in its settings.',
        needs: ["The vendor's API host for this account's region."],
      });
    }

    return {
      healthy: false,
      ready,
      missing,
      behaviourWhenUnready: BEHAVIOUR_WHEN_UNREADY,
    };
  }
}

/**
 * What a call placed right now actually does.
 *
 * Worth stating on the screen, because the failure is quiet by design and reads like a bug. The
 * adapter refuses, `CallPlacementService` catches, marks the attempt failed, tries the next
 * destination, exhausts the ladder and ends the call in the support queue with a person notified.
 * Nothing is lost and nobody is left waiting on a phone that never rings — but no telephone rings
 * either.
 */
const BEHAVIOUR_WHEN_UNREADY =
  'A call requested now is accepted, every destination on the fallback ladder is attempted and ' +
  'refused, and the call ends in the support queue with the reason recorded and the on-call ' +
  'person notified. No telephone rings.';

/**
 * The vendor's half, as specific as it can honestly be made without the documentation.
 *
 * Deliberately not guessed at. An endpoint invented from a plausible-looking pattern would make
 * this adapter *look* finished and fail in production against a real client, which is strictly
 * worse than refusing. Each entry below names what has to be supplied, not what we suppose it is.
 */
const VENDOR_REQUIREMENTS: readonly IvrMissingRequirement[] = [
  {
    key: 'outbound-call-endpoint',
    what: 'There is no click-to-call endpoint to place the two-leg bridged call.',
    needs: [
      'The URL path and HTTP method that places an outbound call.',
      'How the two legs are expressed: the agent is rung first, then the client.',
      'The field names for the destination, the caller ID or DID to present, and the ring timeout.',
      'How recording consent is expressed — a request flag, a separate endpoint, or a prompt id.',
      'Whether the status callback URL is set per request or configured once on the account.',
      'The success response, and specifically which field is the provider call id.',
    ],
  },
  {
    key: 'authentication',
    what: 'The authentication scheme is unknown, so one opaque credential may not be enough.',
    needs: [
      'The scheme: a static API key header, HTTP Basic, or OAuth2 client credentials.',
      'If OAuth2: the token endpoint, the scopes, and the refresh and expiry behaviour. ' +
        '`IvrProviderAccount` holds one credential today and would need client id, client ' +
        'secret and an expiry.',
      'The exact header name and value format.',
    ],
  },
  {
    key: 'directory-mapping',
    what:
      'Nothing maps a Desk user id or a masked client reference to a telephone number, and Desk ' +
      'transmits no numbers by design.',
    needs: [
      'How an agent is registered with the provider so `agentUserId` resolves to an extension or DID.',
      'How a client contact is registered so `clientPhoneRef` resolves to their number.',
      'Whether that provisioning is an API, a portal, or a file — and who owns keeping it current.',
    ],
  },
  {
    key: 'transfer-and-hangup',
    what: 'There are no transfer or hangup endpoints.',
    needs: [
      'The transfer endpoint, and whether a transfer is warm or blind.',
      'What identifies the destination agent on a transfer.',
      'The hangup endpoint, and which leg it ends.',
    ],
  },
  {
    key: 'recording-retrieval',
    what: 'There is no way to turn a stored recording reference into something playable.',
    needs: [
      'The endpoint that resolves a recording reference to a URL.',
      'Whether the provider issues time-bounded URLs at all. If it does not, the design that ' +
        'keeps exactly one copy of a recording in the world has to change, and ' +
        '`IVR_RECORDING_URL_TTL_SECONDS` becomes unenforceable.',
      'The retention period the provider applies to recordings.',
    ],
  },
  {
    key: 'webhook-contract',
    what:
      "Desk's canonical event shape is its own; the vendor's callback JSON is unknown, so there " +
      'is no translation layer.',
    needs: [
      'A sample of every callback body the vendor sends.',
      "The vendor's event vocabulary, mapped onto started / answered / no_answer / ended / " +
        'recording.ready.',
      'Whether callbacks are signed, with which header and which algorithm — Desk currently ' +
        'assumes `X-IVR-Signature: sha256=<hex>`, which is its own convention, not a documented ' +
        'vendor one.',
      "Whether a delivery id header is sent, and the vendor's retry policy.",
    ],
  },
  {
    key: 'operational-limits',
    what: 'No rate limits, concurrency ceiling or sandbox are known.',
    needs: [
      'Request rate limits and the concurrent-call ceiling.',
      'Sandbox or test credentials that ring nothing.',
      'The source IP ranges callbacks arrive from, if an allow-list is offered.',
    ],
  },
];
