import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { IvrConnectionService } from './ivr-connection.service';
import { IvrController } from './ivr.controller';
import { IVR_PROVIDER, type IvrProvider } from './ivr-provider.interface';
import { IvrPolicyRepository } from './ivr-policy.repository';
import { IvrPolicyService } from './ivr-policy.service';
import { MockIvrProvider } from './providers/mock-ivr.provider';
import { TataIvrProvider } from './providers/tata-ivr.provider';

/**
 * The IVR boundary: which adapter is in use, and what each product's calls are allowed to do.
 *
 * Deliberately a leaf. It knows nothing about call records, tickets or routing, so the module
 * that owns those can import this one without a cycle — and, more importantly, so that swapping
 * telephony vendors touches this folder and nothing else.
 *
 * `IVR_PROVIDER` resolves from `IVR_PROVIDER=tata|mock`, the same shape the messaging module uses
 * for email and WhatsApp. The real adapter is the default, so a deployment cannot end up on the
 * mock by forgetting to set the variable.
 */
@Module({
  imports: [IntegrationsModule],
  controllers: [IvrController],
  providers: [
    IvrPolicyRepository,
    IvrPolicyService,
    IvrConnectionService,
    TataIvrProvider,
    MockIvrProvider,
    {
      provide: IVR_PROVIDER,
      inject: [AppConfigService, TataIvrProvider, MockIvrProvider],
      useFactory: (
        config: AppConfigService,
        tata: TataIvrProvider,
        mock: MockIvrProvider,
      ): IvrProvider => (config.ivr.useMockProvider ? mock : tata),
    },
  ],
  exports: [IVR_PROVIDER, IvrPolicyService, IvrConnectionService, MockIvrProvider],
})
export class IvrModule {}
