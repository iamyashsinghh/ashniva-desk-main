import 'source-map-support/register';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { RedisIoAdapter } from './infrastructure/realtime/redis-io.adapter';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  // rawBody: webhook signatures are HMACs over the exact bytes the provider sent. Re-serialising
  // a parsed body reorders keys and changes whitespace, so every genuine delivery would fail.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  configureApp(app);
  setupSwagger(app);

  // Before listen(): the adapter decides how Socket.IO fans events out, and installing it after
  // the server is up would leave the sockets that connected first on the in-process adapter.
  const realtimeAdapter = new RedisIoAdapter(app);
  realtimeAdapter.connect();
  app.useWebSocketAdapter(realtimeAdapter);

  app.enableShutdownHooks();

  const config = app.get(AppConfigService);
  await app.listen(config.server.port);

  const docs = config.apiDocsEnabled ? 'docs at /api/docs' : 'docs disabled';
  app.get(Logger).log(`API listening on http://localhost:${config.server.port}/api/v1 (${docs})`);
}

void bootstrap();
