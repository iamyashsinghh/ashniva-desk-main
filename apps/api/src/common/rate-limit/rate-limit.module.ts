import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Per-IP rate limiting foundation. The ThrottlerGuard is registered globally in AppModule;
 * sensitive endpoints (login, password reset) will add stricter @Throttle() limits in Phase 1.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            ttl: config.rateLimit.ttlSeconds * 1000,
            limit: config.rateLimit.maxRequests,
          },
        ],
      }),
    }),
  ],
})
export class RateLimitModule {}
