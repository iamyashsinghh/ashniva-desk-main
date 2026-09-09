import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ConnectionTestResult } from '@ashniva/types';

import { approvedTemplateName, readWhatsAppConfig } from './whatsapp-settings';
import type {
  MessageProvider,
  OutboundPayload,
  ResolvedChannelConfig,
  SendOutcome,
} from './message-provider.interface';
import type { CapturedMessage } from './mock-email.provider';

/**
 * A WhatsApp provider that reaches nothing.
 *
 * Used by the automated tests and the local preview, so neither needs a Meta account and
 * neither can message a real number by accident. It enforces the approved-template rule, because
 * a test that passes here and fails against the real API would be worse than no test.
 */
@Injectable()
export class MockWhatsAppProvider implements MessageProvider {
  readonly channel = 'WHATSAPP' as const;

  private readonly captured: CapturedMessage[] = [];
  private failure: Error | null = null;

  isConfigured(config: ResolvedChannelConfig): boolean {
    return readWhatsAppConfig(config.settings) !== null && Boolean(config.secret);
  }

  async verify(config: ResolvedChannelConfig): Promise<ConnectionTestResult> {
    const settings = readWhatsAppConfig(config.settings);
    if (!settings) {
      return { ok: false, message: 'Set the business account and phone number ids first' };
    }
    if (!config.secret) {
      return { ok: false, message: 'Add an access token first' };
    }
    return { ok: true, message: 'Mock WhatsApp provider: no message will leave this deployment' };
  }

  async send(config: ResolvedChannelConfig, payload: OutboundPayload): Promise<SendOutcome> {
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      throw error;
    }

    const settings = readWhatsAppConfig(config.settings);
    if (!settings || !config.secret) {
      throw Object.assign(new Error('WhatsApp is not configured'), { status: 400 });
    }
    if (!approvedTemplateName(settings, payload.template)) {
      // The same refusal the real API gives, so the mock cannot hide a missing mapping.
      throw Object.assign(
        new Error(`No approved WhatsApp template is mapped to ${payload.template}`),
        { status: 400 },
      );
    }

    this.captured.push({ ...payload, organizationId: config.organizationId, sentAt: new Date() });
    return { providerMessageId: `wamid.mock-${randomUUID()}` };
  }

  // ---------------------------------------------------------------------------------------------
  // Test helpers
  // ---------------------------------------------------------------------------------------------

  sent(): readonly CapturedMessage[] {
    return this.captured;
  }

  failNext(error: Error): void {
    this.failure = error;
  }

  reset(): void {
    this.captured.length = 0;
    this.failure = null;
  }
}
