import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { CryptoModule } from './common/crypto/crypto.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { ErrorsModule } from './common/errors/errors.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { TenantContextMiddleware } from './common/tenant/tenant-context.middleware';
import { TenantContextModule } from './common/tenant/tenant-context.module';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './database/prisma.module';
import { SafeHttpModule } from './infrastructure/http/safe-http.module';
import { SafeNetModule } from './infrastructure/net/safe-net.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { LoggingModule } from './logging/logging.module';
import { DomainModules } from './modules/domain-modules';
import { MetricsMiddleware } from './modules/metrics/metrics.middleware';
import { AuditInterceptor } from './modules/audit-logs/audit.interceptor';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';
import { RecentAuthGuard } from './modules/auth/guards/recent-auth.guard';

@Module({
  imports: [
    // Cross-cutting foundations
    AppConfigModule,
    LoggingModule,
    TenantContextModule,
    ErrorsModule,
    CryptoModule,
    RateLimitModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    SafeNetModule,
    SafeHttpModule,
    RealtimeModule,
    // Business modules (one folder per feature under src/modules)
    ...DomainModules,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: rate limit → authentication → permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RecentAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Express 5 syntax for "every route". Metrics first, so the timer starts before anything
    // else can reject the request and still stops when the response is written.
    consumer.apply(MetricsMiddleware, TenantContextMiddleware).forRoutes('{*path}');
  }
}
