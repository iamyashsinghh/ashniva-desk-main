import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_BRANDING, healthResponseSchema } from '@ashniva/types';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { setupSwagger } from '../src/swagger';

describe('API foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live answers without dependencies', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect({ status: 'up' });
  });

  it('GET /api/v1/health reports every component as up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    const body = healthResponseSchema.parse(response.body);
    expect(body.status).toBe('up');
    expect(body.components.database.status).toBe('up');
    expect(body.components.redis.status).toBe('up');
    expect(body.components.storage.status).toBe('up');
    // The background work and the websocket layer: a deployment can serve every request
    // correctly with neither of them running. See production-readiness.e2e-spec.ts.
    expect(body.components.queues.status).toBe('up');
    expect(body.components.realtime.status).toBe('up');
  });

  it('GET /api/v1/branding returns the seeded default branding', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/branding').expect(200);
    expect(response.body).toEqual(DEFAULT_BRANDING);
  });

  it('rejects invalid query parameters with structured details', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/branding?organization=Not%20A%20Slug')
      .expect(400);
    expect(response.body.statusCode).toBe(400);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.details[0].message).toMatch(/lowercase slug/);
    expect(response.body.requestId).toBeDefined();
  });

  it('returns the standard error shape for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: '/api/v1/does-not-exist',
    });
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('echoes the incoming request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', 'test-request-1');
    expect(response.headers['x-request-id']).toBe('test-request-1');
  });

  it('serves the OpenAPI document', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs/json').expect(200);
    expect(response.body.info.title).toBe('Ashniva Desk API');
    expect(response.body.paths['/api/v1/health']).toBeDefined();
  });
});
