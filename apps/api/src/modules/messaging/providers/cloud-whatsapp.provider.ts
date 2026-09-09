import { Injectable } from '@nestjs/common';
import type { ConnectionTestResult } from '@ashniva/types';

import { SafeHttpService } from '../../../infrastructure/http/safe-http.service';
import { redactMessage } from '../../integrations/redact';
import { approvedTemplateName, readWhatsAppConfig } from './whatsapp-settings';
import type {
  MessageProvider,
  OutboundPayload,
  ResolvedChannelConfig,
  SendOutcome,
} from './message-provider.interface';

const GRAPH_HOST = 'https://graph.facebook.com';
const TIMEOUT_MS = 15_000;

/**
 * The Meta WhatsApp Cloud API.
 *
 * WhatsApp will not deliver free-form text to someone who has not messaged the business
 * recently, so every message is one of the templates the business had approved in advance. A
 * template with no approved name mapped to it cannot be sent at all — that is a permanent
 * failure, not something to retry.
 */
@Injectable()
export class CloudWhatsAppProvider implements MessageProvider {
  readonly channel = 'WHATSAPP' as const;

  constructor(private readonly http: SafeHttpService) {}

  isConfigured(config: ResolvedChannelConfig): boolean {
    return readWhatsAppConfig(config.settings) !== null && Boolean(config.secret);
  }

  /**
   * Reads the configured phone number back from the Graph API.
   *
   * A read rather than a send: it proves the token, the id and the permission are all right
   * without messaging anybody.
   */
  async verify(config: ResolvedChannelConfig): Promise<ConnectionTestResult> {
    const settings = readWhatsAppConfig(config.settings);
    if (!settings) {
      return { ok: false, message: 'Set the business account and phone number ids first' };
    }
    if (!config.secret) {
      return { ok: false, message: 'Add an access token first' };
    }

    try {
      const response = await this.call(
        `${GRAPH_HOST}/${settings.apiVersion}/${settings.phoneNumberId}?fields=display_phone_number,verified_name`,
        { method: 'GET' },
        config.secret,
      );
      const body = (await response.json()) as {
        display_phone_number?: string;
        verified_name?: string;
        error?: { message?: string; code?: number };
      };

      if (!response.ok) {
        // The Graph error message can quote the token back; redact before it is stored or shown.
        return { ok: false, message: redactMessage(body.error?.message ?? response.statusText) };
      }
      const name = body.verified_name ?? 'this account';
      return { ok: true, message: `Connected to ${name} (${body.display_phone_number ?? '—'})` };
    } catch (error) {
      return { ok: false, message: redactMessage(error) };
    }
  }

  async send(config: ResolvedChannelConfig, payload: OutboundPayload): Promise<SendOutcome> {
    const settings = readWhatsAppConfig(config.settings);
    if (!settings || !config.secret) {
      throw permanent('WhatsApp is not configured for this organization');
    }

    const templateName = approvedTemplateName(settings, payload.template);
    if (!templateName) {
      // No amount of retrying will make an unmapped template deliverable.
      throw permanent(`No approved WhatsApp template is mapped to ${payload.template}`);
    }

    const response = await this.call(
      `${GRAPH_HOST}/${settings.apiVersion}/${settings.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: payload.destination,
          type: 'template',
          template: {
            name: templateName,
            language: { code: settings.templateLanguage },
            // Positional parameters, in the order the approved template declares them. Only the
            // headline and the link are passed: a WhatsApp message is a nudge to open the app,
            // never the content itself.
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: payload.title },
                  { type: 'text', text: payload.organizationName },
                ],
              },
            ],
          },
        }),
      },
      config.secret,
    );

    const body = (await response.json()) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      throw Object.assign(new Error(redactMessage(body.error?.message ?? response.statusText)), {
        // The HTTP status drives the retry decision: 429 and 5xx are retried, 4xx is not.
        status: response.status,
        retryAfterMs: retryAfterOf(response),
      });
    }

    return { providerMessageId: body.messages?.[0]?.id ?? null };
  }

  /**
   * One place that attaches the token and the timeout, so neither can be forgotten.
   *
   * `GRAPH_HOST` is a constant rather than a setting, so this is not an SSRF vector today. It
   * goes through the shared guard anyway: the rule for outbound calls should not have an
   * exception whose safety depends on a constant staying constant.
   */
  private async call(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
    token: string,
  ): Promise<Response> {
    return this.http.fetch(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}` },
      timeoutMs: TIMEOUT_MS,
    });
  }
}

/** Marked so `classifyError` reads it as permanent rather than retrying it four times. */
function permanent(message: string): Error {
  return Object.assign(new Error(message), { status: 400 });
}

function retryAfterOf(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
