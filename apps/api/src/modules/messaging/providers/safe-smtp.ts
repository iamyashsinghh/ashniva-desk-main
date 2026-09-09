import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { AppConfigService } from '../../../config/app-config.service';
import { SafeDestinationService } from '../../../infrastructure/net/safe-destination.service';
import { transportSecurity, type EmailConfig } from './email-settings';

/** Give up on a hung server rather than hold a worker for the queue's whole timeout. */
const TIMEOUT_MS = 15_000;

/**
 * Opening an SMTP connection to a host a tenant configured, safely.
 *
 * **Why this is not `SafeHttpService`.** SMTP is not HTTP. There is no URL, no scheme, no
 * redirect chain and no response body to cap; there is a socket, an EHLO, an optional STARTTLS
 * upgrade and an AUTH exchange, all of which nodemailer already implements correctly. Forcing mail
 * through an HTTP client would mean reimplementing a mail client, which is a far larger risk than
 * the one being fixed. What is genuinely shared between the two protocols is the question *may I
 * open a socket to this address* — and that is `SafeDestinationService`, which both use.
 *
 * **What the guard does here.** The host is resolved and every answer checked *before* the socket
 * is opened, and nodemailer is then handed the approved literal address rather than the name.
 * That closes the rebinding window: nodemailer's own resolver short-circuits when `host` is
 * already an IP, so there is no second lookup that could answer differently.
 *
 * **Why `servername` is set explicitly and is not optional.** nodemailer derives SNI from the host
 * unless told otherwise, and when the host is a literal address it disables SNI altogether. Pinning
 * without restoring the name would therefore either break TLS or verify the certificate against an
 * IP. The original hostname is passed as `servername`, so the certificate is still validated
 * against the name the operator configured — the address decides where the packet goes, the name
 * decides which certificate is acceptable.
 */
@Injectable()
export class SafeSmtpTransportFactory {
  constructor(
    private readonly destinations: SafeDestinationService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Builds a transport pointed at a validated address.
   *
   * @throws BlockedDestinationError when the host is not one this deployment may reach.
   */
  async create(settings: EmailConfig, secret: string | null): Promise<Transporter> {
    const pinned = await this.destinations.resolve(settings.host, this.config.smtp.allowedHosts);
    const { secure, requireTLS } = transportSecurity(settings.encryption);

    return createTransport({
      // The approved address, never the name: this is what makes the check and the connection
      // refer to the same machine.
      host: pinned.address,
      port: settings.port,
      secure,
      requireTLS,
      // The name, so the certificate is checked against what was configured rather than against
      // the address the socket went to. Kept for STARTTLS as well, where the upgrade happens on a
      // connection that opened in the clear.
      servername: pinned.hostname,
      tls: { servername: pinned.hostname },
      ...(settings.username && secret ? { auth: { user: settings.username, pass: secret } } : {}),
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  }
}
