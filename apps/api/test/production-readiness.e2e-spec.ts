import type { INestApplication } from '@nestjs/common';
import { REFRESH_TOKEN_COOKIE, healthResponseSchema } from '@ashniva/types';
import type { Express } from 'express';
import request from 'supertest';

import { QueueSchedulerRegistrar } from '../src/infrastructure/queue/scheduled-jobs';
import { QUEUE_NAMES } from '../src/infrastructure/queue/queue-names';
import { StorageService } from '../src/infrastructure/storage/storage.service';
import { DEMO, SEED_PASSWORD, bearer, createTestApp, loginAs } from './helpers/test-app';

/**
 * The production-readiness fixes, exercised through the real Express stack.
 *
 * Each of these is a property that only exists end to end: whether Express believed a forwarded
 * header, whether a route is registered at all, whether the readiness probe changes its answer.
 * The units are tested next to their code; this is the part that needs a running application.
 */
describe('Production readiness (e2e)', () => {
  /**
   * Builds an application with particular environment variables.
   *
   * `ConfigModule.forRoot` reads and validates the environment when the module file is first
   * imported, not when an application is instantiated — so every app in one Jest module registry
   * shares whatever `process.env` held at that first import. An isolated registry per case is the
   * only way to test a *setting*, rather than testing the first value the file happened to see.
   */
  async function withApp(
    env: Record<string, string | undefined>,
    run: (app: INestApplication<Express>) => Promise<void>,
  ): Promise<void> {
    const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]] as const));
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    try {
      await jest.isolateModulesAsync(async () => {
        const { Test } = await import('@nestjs/testing');
        const { AppModule } = await import('../src/app.module');
        const { configureApp } = await import('../src/app.setup');
        const { setupSwagger } = await import('../src/swagger');

        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        const app = moduleRef.createNestApplication<INestApplication<Express>>({ logger: false });
        configureApp(app);
        setupSwagger(app);
        await app.init();
        try {
          await run(app);
        } finally {
          await app.close();
        }
      });
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  /**
   * Everything else production insists on, so each case is about the one setting it names.
   *
   * Every production requirement in `env.schema.ts` has to be named here, including the ones a
   * developer's `.env` happens to carry. `CORS_ORIGINS` was missing and these cases still passed
   * locally for exactly that reason — the file supplied it — and then failed on CI, which sets
   * only the variables the workflow lists. A fixture that borrows from the ambient environment is
   * not testing the setting it names.
   *
   * The list is the production `superRefine` blocks of `env.schema.ts`, in order: the two JWT
   * secrets (real-looking and different from each other), the encryption key, `CORS_ORIGINS`,
   * `APP_WEB_URL`, `TRUST_PROXY` and `STORAGE_AUTO_CREATE_BUCKET`. Adding a production requirement
   * there without adding it here turns these cases red on CI and green on a developer's machine.
   */
  const PRODUCTION_ENV = {
    NODE_ENV: 'production',
    // Production refuses to guess the hop count; these cases are about the documentation route,
    // so they state the no-proxy answer explicitly.
    TRUST_PROXY: 'false',
    JWT_ACCESS_SECRET: 'Kx7mQz2Vb9Ld4Rn6Ty1Wp3Hs5Jf8Gc0Ae2Ui4Oy6Bq8Zn',
    JWT_REFRESH_SECRET: 'Rv3Nq8Dj5Xw1Pc7Ml2Kb9Th4Sg6Fz0Ya8Ue3Iw5Oq7Cn',
    // Exactly 32 bytes, which is what the schema checks the base64 decodes to.
    APP_ENCRYPTION_KEY: Buffer.from('ashniva-e2e-production-fixture-k').toString('base64'),
    APP_WEB_URL: 'https://desk.example.test',
    CORS_ORIGINS: 'https://desk.example.test',
    STORAGE_AUTO_CREATE_BUCKET: 'false',
  };

  async function loginCookie(
    app: INestApplication<Express>,
    headers: Record<string, string>,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set(headers)
      .send({ email: DEMO.director, password: SEED_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'];
    const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
    const refresh = list.find((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE}=`));
    expect(refresh).toBeDefined();
    return refresh ?? '';
  }

  describe('trust proxy', () => {
    it('drops Secure from the refresh cookie when no proxy is trusted', async () => {
      // The header is present and deliberately ignored: an untrusted X-Forwarded-Proto is a
      // claim by whoever sent it, and believing it would let a plain-http client mark the
      // refresh cookie Secure.
      await withApp({ TRUST_PROXY: undefined }, async (app) => {
        const cookie = await loginCookie(app, { 'X-Forwarded-Proto': 'https' });
        expect(cookie).not.toMatch(/;\s*Secure/i);
        expect(cookie).toMatch(/HttpOnly/i);
      });
    }, 60000);

    it('sets Secure when one proxy is trusted and it forwarded https', async () => {
      // The bug this closes: behind a load balancer the API sees plain http on the last hop, so
      // the refresh token went out without Secure however the browser had connected.
      await withApp({ TRUST_PROXY: '1' }, async (app) => {
        const cookie = await loginCookie(app, { 'X-Forwarded-Proto': 'https' });
        expect(cookie).toMatch(/;\s*Secure/i);
      });
    }, 60000);

    /**
     * Exhausts the login throttle from one forwarded address, then tries another.
     *
     * Sign-in is limited to 20 attempts per minute per IP. A non-existent account is used so no
     * argon2 verification happens and the loop is fast; the throttler runs in a guard, before the
     * handler, so it counts either way.
     */
    async function loginThrottleShared(
      app: INestApplication<Express>,
      first: string,
      second: string,
    ): Promise<{ firstBlocked: boolean; secondBlocked: boolean }> {
      const attempt = (address: string): request.Test =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', address)
          .send({ email: `nobody-${Date.now()}@example.com`, password: 'not-the-password' });

      let firstBlocked = false;
      for (let index = 0; index < 25 && !firstBlocked; index += 1) {
        firstBlocked = (await attempt(first)).status === 429;
      }
      return { firstBlocked, secondBlocked: (await attempt(second)).status === 429 };
    }

    it('keys the login throttle per client when a proxy is trusted', async () => {
      await withApp({ TRUST_PROXY: '1' }, async (app) => {
        expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(1);

        const { firstBlocked, secondBlocked } = await loginThrottleShared(
          app,
          '203.0.113.7',
          '203.0.113.8',
        );
        expect(firstBlocked).toBe(true);
        // A different client is unaffected: the throttle is doing what it exists to do.
        expect(secondBlocked).toBe(false);
      });
    }, 90000);

    it('shares one throttle bucket between every client when no proxy is trusted', async () => {
      // This is the self-inflicted denial of service. Behind a load balancer with no trusted
      // proxy, every request carries the balancer's address, so one client exhausting the login
      // limit locks out everybody else — and the same is true of the global limit.
      await withApp({ TRUST_PROXY: undefined }, async (app) => {
        const { firstBlocked, secondBlocked } = await loginThrottleShared(
          app,
          '203.0.113.7',
          '203.0.113.8',
        );
        expect(firstBlocked).toBe(true);
        expect(secondBlocked).toBe(true);
      });
    }, 90000);

    // TRUST_PROXY=true is refused at startup, and that case is asserted in env.validation.spec.ts
    // rather than here: an AppModule whose environment fails validation hangs
    // `Test.createTestingModule().compile()` instead of rejecting, and a test that hangs is worse
    // than no test.
  });

  describe('API documentation', () => {
    async function docsStatus(env: Record<string, string | undefined>): Promise<number> {
      let status = 0;
      await withApp(env, async (app) => {
        status = (await request(app.getHttpServer()).get('/api/docs/json')).status;
      });
      return status;
    }

    it('serves the document outside production', async () => {
      expect(await docsStatus({ NODE_ENV: 'development' })).toBe(200);
    }, 60000);

    it('does not serve it in production', async () => {
      // The document is a complete map of every endpoint and every DTO shape.
      expect(await docsStatus(PRODUCTION_ENV)).toBe(404);
    }, 60000);

    it('serves it in production only when somebody asks for it in writing', async () => {
      expect(await docsStatus({ ...PRODUCTION_ENV, API_DOCS_ENABLED: 'true' })).toBe(200);
    }, 60000);
  });

  describe('/metrics', () => {
    const token = 'metrics-token-for-the-e2e-suite';

    it('serves the registry to a scraper holding the token, and to nobody else', async () => {
      await withApp({ METRICS_TOKEN: token }, async (app) => {
        // Something to count, so the HTTP histogram is not empty.
        await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

        // And something whose URL differs from its route. Unauthenticated on purpose: the
        // middleware counts requests the guards reject, which is when a metric matters most, and
        // Express has still matched the route so the pattern is there to be read.
        const ticketId = '018f2a3b-0000-7000-8000-000000000000';
        await request(app.getHttpServer()).get(`/api/v1/tickets/${ticketId}`).expect(401);

        const response = await request(app.getHttpServer())
          .get('/api/metrics')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(response.text).toContain('ashniva_queue_jobs');
        expect(response.text).toContain('ashniva_db_pool_connections');
        expect(response.text).toContain('ashniva_queue_schedulers_missing');
        // The label is the route *pattern*, so one series covers every ticket rather than one per
        // ticket id — and no id reaches the monitoring system. Asserted on a parameterised route,
        // because `/api/v1/health/live` proves nothing: its resolved URL contains "health" too,
        // so that assertion passed just as well with the label taken from `request.originalUrl`.
        expect(response.text).toMatch(
          /ashniva_http_request_duration_seconds_count\{[^}]*route="\/api\/v1\/tickets\/:id"/,
        );
        expect(response.text).not.toContain(ticketId);

        // 404 rather than 401: a wrong token learns nothing the right one would not have told it.
        await request(app.getHttpServer()).get('/api/metrics').expect(404);
        await request(app.getHttpServer())
          .get('/api/metrics')
          .set('Authorization', 'Bearer not-the-configured-token')
          .expect(404);
      });
    }, 60000);

    it('answers 404 to everyone when no token is configured', async () => {
      // Unset means "nobody may read this", never "everybody may". The module is registered
      // either way and the guard is what refuses, so absent and wrong look the same from outside.
      await withApp({ METRICS_TOKEN: undefined }, async (app) => {
        await request(app.getHttpServer())
          .get('/api/metrics')
          .set('Authorization', `Bearer ${token}`)
          .expect(404);
      });
    }, 60000);
  });

  describe('readiness and the background work', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('reports every component, including queues and realtime', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      const body = healthResponseSchema.parse(response.body);
      expect(body.status).toBe('up');
      expect(body.components.queues.status).toBe('up');
      expect(body.components.realtime.status).toBe('up');
    });

    it('answers 503 when a scheduled job is not running, and says only that', async () => {
      // The cost of the old behaviour: a deployment whose schedulers failed to register reported
      // "ready" for as long as the process lived, with no SLA monitor and no notification
      // delivery.
      const registrar = app.get(QueueSchedulerRegistrar);
      const declared = registrar.declared();
      const victim = declared.find((state) => state.queue === QUEUE_NAMES.SLA_MONITOR);
      expect(victim).toBeDefined();
      const wasRegistered = victim?.registered ?? true;
      if (victim) {
        victim.registered = false;
        victim.lastError = 'Redis is not reachable';
      }

      try {
        const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
        const body = healthResponseSchema.parse(response.body);
        expect(body.status).toBe('down');
        expect(body.components.queues.status).toBe('down');
        expect(body.components.queues.message).toBeUndefined();
        // The rest still reports honestly; a missing schedule is not a database problem.
        expect(body.components.database.status).toBe('up');
      } finally {
        if (victim) {
          victim.registered = wasRegistered;
          delete victim.lastError;
        }
      }
    });

    /**
     * Readiness is `@Public()` — a load balancer carries no credentials — so everything in this
     * body is readable by anyone who can reach the deployment. The text a failing component hands
     * us is written by a driver, not by us, and it names hosts, buckets and accounts. This is the
     * shape a real outage produces, and none of it may come back over the wire.
     */
    it('never publishes a component’s own failure text to an anonymous caller', async () => {
      const storage = app.get(StorageService);
      const leak =
        'NoSuchBucket: ashniva-desk-prod at storage.internal.example:9000 — ' +
        'password authentication failed for user "ashniva"';
      const spy = jest.spyOn(storage, 'checkBucket').mockRejectedValue(new Error(leak));
      try {
        const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
        const body = healthResponseSchema.parse(response.body);
        expect(body.components.storage.status).toBe('down');
        expect(body.components.storage.message).toBeUndefined();
        const raw = JSON.stringify(body);
        expect(raw).not.toContain('storage.internal.example');
        expect(raw).not.toContain('ashniva-desk-prod');
        expect(raw).not.toContain('password authentication failed');
        expect(raw).not.toContain('NoSuchBucket');
        // Still a usable answer: which component is down, and how long it took to say so.
        expect(body.components.storage.latencyMs).toBeGreaterThanOrEqual(0);
        expect(body.components.database.status).toBe('up');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('uploads', () => {
    let app: INestApplication;
    let token = '';

    beforeAll(async () => {
      app = await createTestApp();
      token = bearer(await loginAs(app, DEMO.director));
    });

    afterAll(async () => {
      await app.close();
    });

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);

    it('accepts a file whose bytes match the type it declares', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/files')
        .set('Authorization', token)
        .attach('file', png, { filename: 'shot.png', contentType: 'image/png' })
        .expect(201);
      expect(response.body.contentType).toBe('image/png');
    });

    it('refuses HTML declaring itself a PNG', async () => {
      // `image/png` is on the allow-list, so before the magic-byte check this was stored and
      // served back with the content type the uploader chose.
      const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
      const response = await request(app.getHttpServer())
        .post('/api/v1/files')
        .set('Authorization', token)
        .attach('file', html, { filename: 'shot.png', contentType: 'image/png' })
        .expect(400);
      expect(response.body.message).toMatch(/not image\/png/);
    });

    it('refuses an executable declaring itself plain text', async () => {
      const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00]);
      await request(app.getHttpServer())
        .post('/api/v1/files')
        .set('Authorization', token)
        .attach('file', elf, { filename: 'notes.txt', contentType: 'text/plain' })
        .expect(400);
    });

    it('serves a download as an attachment rather than inline', async () => {
      const uploaded = await request(app.getHttpServer())
        .post('/api/v1/files')
        .set('Authorization', token)
        .attach('file', png, { filename: 'inline-me.png', contentType: 'image/png' })
        .expect(201);

      const download = await request(app.getHttpServer())
        .get(`/api/v1/files/${uploaded.body.id}/download`)
        .set('Authorization', token)
        .expect(200);

      expect(download.headers['content-disposition']).toMatch(/^attachment;/);
      expect(download.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
