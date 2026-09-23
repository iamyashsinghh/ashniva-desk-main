import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';

import { AppConfigService } from './config/app-config.service';
import { WidgetOriginRegistry } from './modules/products/widget-origin.registry';
import { widgetAwareCors } from './widget-cors';

export const API_GLOBAL_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';
 
/**
 * Applies the middleware, prefix, versioning and validation used by the running server
 * AND by the e2e tests, so both behave identically.
 */
export function configureApp(app: INestApplication<Express>): void {
  const config = app.get(AppConfigService);

  // Two things read the client's address and scheme, and both are wrong behind a load balancer
  // until Express is told how many proxies to believe: the throttler counts per IP (one shared
  // address means the global limit throttles every user at once and the login limit stops telling
  // people apart), and the refresh cookie's `Secure` flag follows `req.secure`, which is false on
  // the plain-HTTP hop from the balancer unless `X-Forwarded-Proto` is trusted.
  //
  // A hop count, never `true`: see TRUST_PROXY in env.schema.ts.
  app.getHttpAdapter().getInstance().set('trust proxy', config.server.trustProxy);

  app.use(helmet({ crossOriginResourcePolicy: false }));
  // Only the refresh-token cookie is read (auth routes); nothing else uses cookies.
  app.use(cookieParser());
  // Per request, because the embedded support widget answers to origins that live in the database
  // rather than in the environment. See `widget-cors.ts` for why the two rulesets stay separate.
  app.enableCors(widgetAwareCors(app.get(WidgetOriginRegistry), config.cors.origins));

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
