import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';

import {
  IntegrationsRepository,
  type IntegrationConnectionRow,
} from '../integrations/integrations.repository';
import { IvrConnectionService } from '../ivr/ivr-connection.service';
import { IVR_PROVIDER, type IvrCallEvent, type IvrProvider } from '../ivr/ivr-provider.interface';
import { CallEventsService } from './call-events.service';

export type WebhookOutcome =
  | { status: 'accepted' }
  | { status: 'duplicate' }
  | { status: 'ignored' }
  | { status: 'rejected'; reason: string };

/**
 * Letting a telephony provider tell Desk what happened, without letting anybody else.
 *
 * The order of the four checks is the whole security of this path, and each one exists because
 * skipping it opens a specific hole:
 *
 *  1. **Which account does this claim to be for?** A claim only — it selects which secrets to
 *     try. A payload naming no account is refused rather than guessed at.
 *  2. **Whose secret verifies the signature?** That decides the tenant. `external_account_id`
 *     carries no unique constraint, so two tenants may claim the same account id; only the one
 *     holding the provider's secret for it can produce a matching HMAC.
 *  3. **Have we seen this delivery?** The unique index on (organization, provider, event id) is
 *     the idempotency, and a rejected insert *is* the duplicate detection — no read-then-write
 *     race can slip a second copy through.
 *  4. **Does the call id belong to that tenant?** A verified delivery from one tenant naming
 *     another tenant's call is a spoof. The organization, product, project and ticket all come
 *     from the call row Desk created itself; nothing is ever read out of the payload.
 */
@Injectable()
export class IvrWebhookService {
  constructor(
    private readonly connections: IvrConnectionService,
    private readonly integrations: IntegrationsRepository,
    private readonly events: CallEventsService,
    private readonly logger: PinoLogger,
    @Inject(IVR_PROVIDER) private readonly provider: IvrProvider,
  ) {
    this.logger.setContext(IvrWebhookService.name);
  }

  async handle(
    providerSlug: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    payload: unknown,
  ): Promise<WebhookOutcome> {
    if (providerSlug.toUpperCase() !== this.provider.key) {
      return { status: 'rejected', reason: 'provider' };
    }

    const accountId = this.provider.accountIdFromPayload(payload);
    if (!accountId) {
      return { status: 'rejected', reason: 'account' };
    }

    const candidates = await this.connections.candidatesFor(accountId);
    for (const candidate of candidates) {
      const secret = this.connections.secretOf(candidate);
      if (!secret) {
        continue;
      }
      const verification = this.provider.verifyWebhook(rawBody, headers, secret);
      if (!verification.valid) {
        continue;
      }
      return this.accept(candidate, verification.deliveryId, rawBody, payload);
    }

    this.logger.warn(
      { accountId, candidates: candidates.length },
      'Rejected an IVR webhook with a bad or missing signature',
    );
    return { status: 'rejected', reason: 'signature' };
  }

  private async accept(
    connection: IntegrationConnectionRow,
    deliveryId: string | undefined,
    rawBody: Buffer,
    payload: unknown,
  ): Promise<WebhookOutcome> {
    let event: IvrCallEvent;
    try {
      event = this.provider.parseWebhookEvent(payload);
    } catch {
      // A signed delivery Desk cannot read. Refused without consuming the idempotency key, so a
      // corrected redelivery of the same event is still accepted.
      return { status: 'rejected', reason: 'payload' };
    }

    const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
    const recorded = await this.integrations.recordEvent({
      organizationId: connection.organizationId,
      connectionId: connection.id,
      provider: connection.provider,
      status: 'RECEIVED',
      externalEventId: deliveryId ?? `digest:${payloadDigest}`,
      eventType: `ivr.${event.type}`,
      signatureVerified: true,
      payloadDigest,
    });
    if (!recorded) {
      // The unique index caught a redelivery. Answering successfully stops the provider retrying.
      return { status: 'duplicate' };
    }

    const call = await this.events.correlate(connection.organizationId, event.providerCallId);
    if (!call) {
      // Signed by a real tenant, but naming a call that is not theirs or does not exist. The
      // delivery is recorded — it happened — and nothing is written against any call.
      await this.integrations.markEventFailed(recorded.id, 'Unknown call');
      return { status: 'ignored' };
    }

    await this.events.apply(call, event);
    await this.integrations.markEventProcessed(recorded.id);
    return { status: 'accepted' };
  }
}
