import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ConnectionTestResult } from '@ashniva/types';

import { readEmailConfig } from './email-settings';
import type {
  MessageProvider,
  OutboundPayload,
  ResolvedChannelConfig,
  SendOutcome,
} from './message-provider.interface';

export interface CapturedMessage extends OutboundPayload {
  organizationId: string;
  sentAt: Date;
}

/**
 * An email provider that reaches nothing.
 *
 * Used by the automated tests and by the local Docker preview, so neither needs a real mailbox
 * and neither can send to a real person by accident. Sent messages are kept in memory so a test
 * can assert on what would have gone out.
 *
 * Selected by `MESSAGING_PROVIDER=mock`. In any other configuration the SMTP provider is used,
 * so a deployment cannot fall into this one by forgetting a variable.
 */
@Injectable()
export class MockEmailProvider implements MessageProvider {
  readonly channel = 'EMAIL' as const;

  private readonly captured: CapturedMessage[] = [];
  /** Set by a test to make the next send fail in a chosen way. */
  private failure: Error | null = null;

  isConfigured(config: ResolvedChannelConfig): boolean {
    return readEmailConfig(config.settings) !== null;
  }

  async verify(config: ResolvedChannelConfig): Promise<ConnectionTestResult> {
    return readEmailConfig(config.settings)
      ? { ok: true, message: 'Mock email provider: no message will leave this deployment' }
      : { ok: false, message: 'Set the server, port and sender address first' };
  }

  async send(config: ResolvedChannelConfig, payload: OutboundPayload): Promise<SendOutcome> {
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      throw error;
    }
    this.captured.push({
      ...payload,
      organizationId: config.organizationId,
      sentAt: new Date(),
    });
    return { providerMessageId: `mock-${randomUUID()}` };
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
