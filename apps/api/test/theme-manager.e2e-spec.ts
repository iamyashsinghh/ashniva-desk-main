import type { INestApplication } from '@nestjs/common';
import {
  DEFAULT_BRANDING,
  DEFAULT_THEME_DOCUMENT,
  INTEGRATION_PROVIDER,
  THEME_DOCUMENT_VERSION,
} from '@ashniva/types';
import request from 'supertest';

import { SecretCipherService } from '../src/common/crypto/secret-cipher.service';
import { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/generated/prisma/client';
import { SafeHttpService } from '../src/infrastructure/http/safe-http.service';
import { RemoteThemeSource } from '../src/modules/branding/theme/remote-theme.source';
import type * as TestApp from './helpers/test-app';
import type { Session } from './helpers/test-app';

/**
 * Desk with `THEME_PROVIDER=remote` and no Theme Manager on the other end.
 *
 * This is the failure behaviour, and the failure behaviour is the requirement. There is no
 * Ashniva Theme Manager in this repository and no contract for one, so the state this suite runs
 * in — configured, pointed at something that does not answer — is not an edge case. It is what
 * every deployment that turns the switch on will be in until the vendor half of
 * `docs/theme-manager-integration.md` is supplied.
 *
 * What must hold in that state: the API starts, the sign-in endpoint works, `GET /branding` works
 * and returns a complete theme, and the readiness report says in as many words what is missing.
 */
describe('Theme Manager source, unreachable (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cipher: SecretCipherService;
  let remote: RemoteThemeSource;

  let director: Session;
  let providerOrgId: string;
  let providerSlug: string;

  /**
   * Loaded by hand rather than imported at the top of the file, and that is the whole trick here.
   *
   * `ConfigModule.forRoot()` runs when `app.module.ts` is *imported*, not when the test app is
   * built, so a static import of the helper would read `THEME_PROVIDER` before this suite has had
   * a chance to set it — and the suite would quietly test the local source while claiming to test
   * the remote one.
   */
  let helpers: typeof TestApp;
  const api = () => request(app.getHttpServer());
  const bearer = (session: Session) => helpers.bearer(session);

  beforeAll(async () => {
    process.env.THEME_PROVIDER = 'remote';
    helpers = await import('./helpers/test-app');
    app = await helpers.createTestApp();
    prisma = app.get(PrismaService);
    cipher = app.get(SecretCipherService);
    remote = app.get(RemoteThemeSource);

    director = await helpers.loginAs(app, helpers.DEMO.director);
    const provider = await prisma.organization.findFirstOrThrow({
      where: { isServiceProvider: true },
    });
    providerOrgId = provider.id;
    providerSlug = provider.slug;
  });

  afterAll(async () => {
    await prisma.integrationConnection.deleteMany({
      where: { organizationId: providerOrgId, provider: INTEGRATION_PROVIDER.THEME_MANAGER },
    });
    await prisma.organization.update({ where: { id: providerOrgId }, data: { settings: {} } });
    await app.close();
    process.env.THEME_PROVIDER = 'local';
  });

  /** A Theme Manager connection pointing wherever the test needs it to. */
  async function connect(settings: Prisma.InputJsonObject): Promise<void> {
    await prisma.integrationConnection.deleteMany({
      where: { organizationId: providerOrgId, provider: INTEGRATION_PROVIDER.THEME_MANAGER },
    });
    await prisma.integrationConnection.create({
      data: {
        organizationId: providerOrgId,
        provider: INTEGRATION_PROVIDER.THEME_MANAGER,
        enabled: true,
        status: 'CONNECTED',
        encryptedCredentials: cipher.encrypt('a-theme-manager-token'),
        settings,
        createdById: director.body.user.id,
      },
    });
  }

  describe('With no connection at all', () => {
    it('signs a person in and serves a complete theme', async () => {
      const session = await helpers.loginAs(app, helpers.DEMO.pm);
      expect(session.accessToken).toBeTruthy();

      const branding = await api()
        .get('/api/v1/branding')
        .query({ organization: providerSlug })
        .expect(200);
      expect(branding.body.theme.version).toBe(THEME_DOCUMENT_VERSION);
      expect(branding.body.colors.primary).toBe(DEFAULT_BRANDING.colors.primary);
    });

    it('says what is missing rather than pretending to be ready', async () => {
      const readiness = await api()
        .get('/api/v1/admin/branding/theme-source')
        .set('Authorization', bearer(director))
        .expect(200);

      expect(readiness.body.source).toBe('remote');
      expect(readiness.body.healthy).toBe(false);
      const keys = readiness.body.missing.map((item: { key: string }) => item.key);
      expect(keys).toContain('connection');
      expect(keys).toContain('document-endpoint');
      expect(keys).toContain('integration-direction');
    });
  });

  describe('With a connection that cannot be reached', () => {
    it('falls back to the stored branding rather than failing or hanging', async () => {
      await connect({ baseUrl: 'https://theme-manager.invalid', documentPath: '/v1/theme' });
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({
          productName: 'Stored fallback',
          theme: { version: THEME_DOCUMENT_VERSION, colors: { brandPrimary: '#654321' } },
        })
        .expect(200);

      const started = Date.now();
      const branding = await api()
        .get('/api/v1/branding')
        .query({ organization: providerSlug })
        .expect(200);

      expect(branding.body.productName).toBe('Stored fallback');
      expect(branding.body.colors.primary).toBe('#654321');
      // Nothing on this path waits for the network; the refresh runs behind the response.
      expect(Date.now() - started).toBeLessThan(3_000);

      await helpers.loginAs(app, helpers.DEMO.support);
    });

    /**
     * A Theme Manager on a private address is exactly what the destination guard exists for: an
     * operator who can save a base URL should not thereby be able to make the server issue
     * requests inside its own network.
     */
    it('is refused by the destination guard for a loopback host, and still serves a theme', async () => {
      await connect({ baseUrl: 'https://localhost:9443', documentPath: '/v1/theme' });

      await expect(
        remote.refresh({ organizationId: providerOrgId, organizationSlug: providerSlug }),
      ).resolves.toBeNull();

      const branding = await api()
        .get('/api/v1/branding')
        .query({ organization: providerSlug })
        .expect(200);
      expect(branding.body.productName).toBe('Stored fallback');
    });

    it('makes no request at all while nothing names a document path', async () => {
      await connect({ baseUrl: 'https://theme-manager.invalid' });

      const readiness = await api()
        .get('/api/v1/admin/branding/theme-source')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(readiness.body.missing[0].key).toBe('document-path');
      expect(readiness.body.healthy).toBe(false);
    });
  });

  describe('The whole fallback ladder, in order', () => {
    it('falls all the way through to the built-in theme when nothing is stored', async () => {
      await connect({ baseUrl: 'https://theme-manager.invalid', documentPath: '/v1/theme' });
      await prisma.organization.update({ where: { id: providerOrgId }, data: { settings: {} } });

      const branding = await api()
        .get('/api/v1/branding')
        .query({ organization: providerSlug })
        .expect(200);
      expect(branding.body).toMatchObject({
        productName: DEFAULT_BRANDING.productName,
        colors: DEFAULT_BRANDING.colors,
      });
      expect(branding.body.theme.radius).toEqual(DEFAULT_THEME_DOCUMENT.radius);
    });

    it('serves the stored branding when there is one, over the built-in theme', async () => {
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({ theme: { version: THEME_DOCUMENT_VERSION, radius: { md: '1px' } } })
        .expect(200);

      const branding = await api()
        .get('/api/v1/branding')
        .query({ organization: providerSlug })
        .expect(200);
      expect(branding.body.theme.radius.md).toBe('1px');
      expect(branding.body.theme.radius.lg).toBe(DEFAULT_THEME_DOCUMENT.radius.lg);
    });
  });

  /**
   * The top rung of the ladder, through the real endpoint.
   *
   * `SafeHttpService.fetch` is stubbed rather than a server being started, because the guard is
   * doing its job: it refuses loopback, and a self-signed certificate on anything else would fail
   * verification — both correctly. What is being proved here is not the guard (that is asserted
   * above and in `safe-http.service.spec`) but that a document which *did* arrive is cached and
   * then outranks the stored branding, including after the Theme Manager stops answering.
   */
  describe('With a Theme Manager that answered once and then stopped', () => {
    it('serves the cached document, and keeps serving it through the outage', async () => {
      await connect({ baseUrl: 'https://theme-manager.invalid', documentPath: '/v1/theme' });
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({ theme: { version: THEME_DOCUMENT_VERSION, radius: { md: '3px' } } })
        .expect(200);

      // Drain the refresh an earlier `GET /branding` started behind its response: while one is
      // in flight the source joins it rather than issuing a second call, and a test that raced it
      // would be asserting on whichever finished first.
      await remote.refresh({ organizationId: providerOrgId, organizationSlug: providerSlug });

      const http = app.get(SafeHttpService);
      const fetch = jest.spyOn(http, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ version: THEME_DOCUMENT_VERSION, radius: { md: '9px' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      try {
        await remote.refresh({ organizationId: providerOrgId, organizationSlug: providerSlug });
        const served = await api()
          .get('/api/v1/branding')
          .query({ organization: providerSlug })
          .expect(200);
        // The published document wins over the tenant's stored one.
        expect(served.body.theme.radius.md).toBe('9px');

        fetch.mockRejectedValue(new Error('connect ECONNREFUSED'));
        const duringOutage = await api()
          .get('/api/v1/branding')
          .query({ organization: providerSlug })
          .expect(200);
        expect(duringOutage.body.theme.radius.md).toBe('9px');
      } finally {
        fetch.mockRestore();
      }
    });
  });
});
