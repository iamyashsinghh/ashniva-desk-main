import { Injectable } from '@nestjs/common';
import type { ConnectionTestResult } from '@ashniva/types';

import { BlockedDestinationError } from '../../../infrastructure/net/safe-destination.service';
import { redactMessage } from '../../integrations/redact';
import { readEmailConfig } from './email-settings';
import { SafeSmtpTransportFactory } from './safe-smtp';
import type {
  MessageProvider,
  OutboundPayload,
  ResolvedChannelConfig,
  SendOutcome,
} from './message-provider.interface';

/**
 * SMTP delivery through nodemailer.
 *
 * A transporter is built per send rather than pooled. Pooling would be faster, but the settings
 * are per tenant and can be changed at any moment from the settings screen — a cached transport
 * would keep using the old host or the old password until the process restarted. Building it per
 * send also means the address check runs per send, so a host that was fine yesterday is still
 * checked today.
 *
 * The host is never handed to nodemailer as a name: `SafeSmtpTransportFactory` resolves it,
 * judges every address it answers with, and pins the connection to an approved one. See that file
 * for why this is not routed through `SafeHttpService`.
 */
@Injectable()
export class SmtpEmailProvider implements MessageProvider {
  readonly channel = 'EMAIL' as const;

  constructor(private readonly transports: SafeSmtpTransportFactory) {}

  isConfigured(config: ResolvedChannelConfig): boolean {
    return readEmailConfig(config.settings) !== null;
  }

  async verify(config: ResolvedChannelConfig): Promise<ConnectionTestResult> {
    const settings = readEmailConfig(config.settings);
    if (!settings) {
      return { ok: false, message: 'Set the server, port and sender address first' };
    }
    try {
      const transport = await this.transports.create(settings, config.secret);
      await transport.verify();
      transport.close();
      return { ok: true, message: `Connected to ${settings.host}:${settings.port}` };
    } catch (error) {
      if (error instanceof BlockedDestinationError) {
        // Named plainly, because this one is the operator's to fix: the address is out of bounds
        // and no retry will change that. The message carries the host and the rule, never the
        // credential.
        return { ok: false, message: `${settings.host} cannot be used: it is ${error.detail}` };
      }
      // redactMessage strips anything that looks like a credential before this is stored or
      // shown; a nodemailer error can quote the AUTH line back at you.
      return { ok: false, message: redactMessage(error) };
    }
  }

  async send(config: ResolvedChannelConfig, payload: OutboundPayload): Promise<SendOutcome> {
    const settings = readEmailConfig(config.settings);
    if (!settings) {
      throw Object.assign(new Error('Email is not configured for this organization'), {
        // Permanent: no number of retries will conjure a server address.
        code: 'EENVELOPE',
      });
    }

    let transport;
    try {
      transport = await this.transports.create(settings, config.secret);
    } catch (error) {
      if (error instanceof BlockedDestinationError) {
        // Permanent, like a missing host: the queue must not retry a destination that policy
        // forbids. `detail` names the rule, not the mail server's credentials.
        throw Object.assign(new Error(`Refused to connect to ${settings.host}: ${error.detail}`), {
          code: 'EENVELOPE',
        });
      }
      throw error;
    }

    try {
      const info = await transport.sendMail({
        from: { name: settings.senderName, address: settings.senderEmail },
        ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
        to: payload.destination,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      return { providerMessageId: info.messageId ?? null };
    } finally {
      transport.close();
    }
  }
}
