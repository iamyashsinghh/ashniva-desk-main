import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Outbound account e-mails. Phase 2 ships no real e-mail provider (Phase 3): the only
 * implementation logs the link outside production so developers can complete the flows locally.
 * The notifications module's e-mail channel will implement this port when a provider arrives.
 */
export interface AuthMailer {
  sendInvitation(input: {
    email: string;
    name: string;
    link: string;
    expiresAt: Date;
  }): Promise<void>;
  sendPasswordReset(input: { email: string; link: string; expiresAt: Date }): Promise<void>;
}

export const AUTH_MAILER = Symbol('AUTH_MAILER');

@Injectable()
export class LoggingAuthMailer implements AuthMailer {
  constructor(
    private readonly logger: PinoLogger,
    private readonly config: AppConfigService,
  ) {
    this.logger.setContext(LoggingAuthMailer.name);
  }

  async sendInvitation(input: { email: string; name: string; link: string; expiresAt: Date }) {
    this.log('invitation', input.email, input.link, input.expiresAt);
  }

  async sendPasswordReset(input: { email: string; link: string; expiresAt: Date }) {
    this.log('password reset', input.email, input.link, input.expiresAt);
  }

  private log(kind: string, email: string, link: string, expiresAt: Date): void {
    if (this.config.isProduction) {
      // Never print a live link in production logs; without a provider the mail is simply not sent.
      this.logger.warn(
        { kind, email },
        'No e-mail provider configured; account link not delivered',
      );
      return;
    }
    this.logger.info({ kind, email, link, expiresAt }, 'Account link (development only)');
  }
}
