import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue-names';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiGenerationService } from './ai-generation.service';
import { AiSourceCollectorService } from './ai-source-collector.service';
import { AiSummariesController } from './ai-summaries.controller';
import { AiSummariesProcessor } from './ai-summaries.processor';
import { AiSummariesQueue } from './ai-summaries.queue';
import { AiSummariesRepository } from './ai-summaries.repository';
import { AiSummariesService } from './ai-summaries.service';
import { ClientTextGuard } from './client-text.guard';
import { SummaryScopeService } from './summary-scope.service';
import { LeakageBaselineService } from './leakage-baseline.service';
import { PortalAiSummariesController } from './portal-ai-summaries.controller';
import { AI_PROVIDERS, type AiCompletionProvider } from './providers/ai-provider.interface';
import { HttpAiProvider } from './providers/http-ai.provider';
import { MockAiProvider } from './providers/mock-ai.provider';

/**
 * AI-generated progress summaries: generation, review, approval and client publication.
 *
 * `AI_PROVIDER=mock` registers the in-memory provider that reaches nothing, for the automated
 * tests and the local preview. Anything else registers the configurable HTTP adapter, whose
 * endpoint, model and credential come from the tenant's AI integration connection.
 *
 * The default is `mock`, unlike messaging, whose default is live. A deployment that has not been
 * given a provider should produce nothing rather than fail every generation against a
 * half-configured endpoint — and unlike email, nobody is waiting on a summary that never arrives.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.AI_SUMMARIES }), IntegrationsModule],
  controllers: [AiSummariesController, PortalAiSummariesController],
  providers: [
    AiSummariesRepository,
    AiSourceCollectorService,
    LeakageBaselineService,
    ClientTextGuard,
    AiGenerationService,
    SummaryScopeService,
    AiSummariesService,
    AiSummariesQueue,
    AiSummariesProcessor,
    HttpAiProvider,
    MockAiProvider,
    {
      provide: AI_PROVIDERS,
      inject: [AppConfigService, HttpAiProvider, MockAiProvider],
      useFactory: (
        config: AppConfigService,
        http: HttpAiProvider,
        mock: MockAiProvider,
      ): AiCompletionProvider[] => (config.ai.useMockProvider ? [mock] : [http]),
    },
  ],
  exports: [AiSummariesService, AiSummariesQueue],
})
export class AiSummariesModule {}
