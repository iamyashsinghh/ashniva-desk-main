import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AppConfigService } from '../config/app-config.service';
import { buildPinoHttpOptions } from './pino-options';

/**
 * Structured JSON logging with pino. Every request gets a request id (reused from the incoming
 * X-Request-Id header when present) that is echoed in the response and in the error payload.
 *
 * The options themselves live in `pino-options.ts` so a test can drive a real request through
 * them and prove that a credential in a URL never reaches the log.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({ pinoHttp: buildPinoHttpOptions(config) }),
    }),
  ],
})
export class LoggingModule {}
