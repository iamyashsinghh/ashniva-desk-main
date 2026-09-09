import { Inject, Injectable } from '@nestjs/common';
import { SUPPORT_CALLBACK_EVENTS, type SupportCallbackEvent } from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import { nextRetry } from '../integrations/integration-retry';
import { redactMessage } from '../integrations/redact';
import { CallbackEndpointsRepository } from './callback-endpoints.repository';
import { signCallback } from './callback-signature';
import { CALLBACK_TRANSPORT, type CallbackTransport } from './callback-transport';
import { SupportCallbacksRepository } from './support-callbacks.repository';

/** What the processor needs to know: try again, or stop. */
export interface DeliveryOutcome {
  retry: boolean;
}

/**
 * One delivery attempt, from claiming the row to settling it.
 *
 * Failures are classified exactly as `integrations/integration-retry.ts` classifies a provider
 * call, because the distinction is the same one: 5xx, 408, 429 and a transport error are the
 * receiver having a bad moment, so try again; any other 4xx is us posting something the receiver
 * will reject just as firmly next time. Retrying a 401 from a misconfigured endpoint forever
 * would burn attempts that the working endpoints need and fill the log with the same line.
 */
@Injectable()
export class CallbackSenderService {
  constructor(
    private readonly deliveries: SupportCallbacksRepository,
    private readonly endpoints: CallbackEndpointsRepository,
    private readonly cipher: SecretCipherService,
    @Inject(CALLBACK_TRANSPORT) private readonly transport: CallbackTransport,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CallbackSenderService.name);
  }

  async deliver(organizationId: string, deliveryId: string): Promise<DeliveryOutcome> {
    const settled = await this.settleIfClosed(organizationId, deliveryId);
    if (settled) {
      return { retry: false };
    }

    const row = await this.deliveries.claimForSending(organizationId, deliveryId);
    if (!row) {
      // Not claimable: another worker holds it, or it has already reached a terminal state. Both
      // mean this job has nothing to do, and neither is worth a retry.
      return { retry: false };
    }

    const endpoint = await this.endpoints.find(organizationId, row.productId);
    if (!endpoint) {
      await this.deliveries.markFailed(row.id, 'The callback endpoint was removed', false, null);
      return { retry: false };
    }

    const signed = signCallback({
      payload: row.payload,
      secret: this.cipher.decrypt(endpoint.signingSecretEncrypted),
      deliveryId: row.id,
      event: row.event as SupportCallbackEvent,
    });

    try {
      const response = await this.transport.deliver({
        // The URL from the row, not from the endpoint: a delivery is sent where it was addressed
        // when it was queued, so a redelivery cannot quietly go somewhere else.
        url: row.url,
        body: signed.body,
        headers: signed.headers,
      });
      if (response.status >= 200 && response.status < 300) {
        await this.deliveries.markSent(row.id, response.status);
        return { retry: false };
      }
      return this.fail(row.id, row.attempts, { status: response.status }, response.status);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : 'The callback could not be sent';
      return this.fail(row.id, row.attempts, { code }, null, message);
    }
  }

  /**
   * Settles a delivery whose endpoint has since been switched off or unsubscribed.
   *
   * Before the claim, so a queued delivery for an event the operator has since unsubscribed from
   * is recorded as SKIPPED rather than posted. Returns true when it settled the row.
   */
  private async settleIfClosed(organizationId: string, deliveryId: string): Promise<boolean> {
    const row = await this.deliveries.findById(organizationId, deliveryId);
    if (!row) {
      return true;
    }
    const endpoint = await this.endpoints.find(organizationId, row.productId);
    if (!endpoint || !endpoint.enabled) {
      await this.deliveries.markSkipped(organizationId, deliveryId, 'Callbacks are switched off');
      return true;
    }
    if (!subscribes(endpoint.events, row.event)) {
      await this.deliveries.markSkipped(
        organizationId,
        deliveryId,
        'This endpoint no longer subscribes to that event',
      );
      return true;
    }
    return false;
  }

  private async fail(
    id: string,
    attemptsSoFar: number,
    error: { status?: number; code?: string },
    responseStatus: number | null,
    message?: string,
  ): Promise<DeliveryOutcome> {
    // `attempts` on the row was incremented by the claim, so it already counts the attempt that
    // has just failed — which is exactly what `nextRetry` means by `attemptsSoFar`.
    const verdict = nextRetry(error, attemptsSoFar);
    const reason = redactMessage(
      message ?? `The endpoint answered ${error.status ?? error.code ?? 'nothing'}`,
    );
    await this.deliveries.markFailed(id, reason, verdict.retry, responseStatus);
    if (!verdict.retry) {
      this.logger.warn({ deliveryId: id, reason: verdict.reason }, 'A support callback gave up');
    }
    return { retry: verdict.retry };
  }
}

/**
 * Whether an endpoint takes this event.
 *
 * Empty means every event, following `ProductIvrPolicy.allowedTiers`. An endpoint configured with
 * no explicit subscription is one nobody has narrowed, and reading that as "nothing" would leave
 * an operator with a configured endpoint that silently receives nothing at all.
 */
export function subscribes(events: readonly string[], event: string): boolean {
  if (events.length === 0) {
    return SUPPORT_CALLBACK_EVENTS.includes(event as SupportCallbackEvent);
  }
  return events.includes(event);
}
