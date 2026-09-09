import { Module } from '@nestjs/common';

import { CryptoModule } from '../../common/crypto/crypto.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { INTEGRATION_PROVIDERS } from './integration-provider.interface';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService } from './integrations.service';

/**
 * The shared integration framework: connections, encrypted credentials, status, webhook intake
 * and the retry and redaction helpers. It owns nothing provider-specific.
 *
 * Provider adapters are contributed by their own modules through the INTEGRATION_PROVIDERS token.
 * The array starts empty so the framework stands on its own and each slice can add to it without
 * touching this file's logic.
 */
@Module({
  imports: [CryptoModule, AuditLogsModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsRepository,
    IntegrationsService,
    { provide: INTEGRATION_PROVIDERS, useValue: [] },
  ],
  exports: [IntegrationsService, IntegrationsRepository],
})
export class IntegrationsModule {}
