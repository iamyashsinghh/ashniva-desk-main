import type { INestApplication } from '@nestjs/common';
import { INTEGRATION_PROVIDER } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * The integration framework: permissions, credential handling and tenant isolation.
 *
 * The assertion that matters most is the negative one — no response, on any route, ever contains
 * the stored credential or the webhook secret. The mappers are allow-lists precisely so that stays
 * true when the model grows, and this suite is what proves it.
 */
describe('Integrations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let developer: Session;
  let clientAdmin: Session;
  let providerOrgId: string;
  let acmeOrgId: string;
  let directorUserId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    director = await loginAs(app, DEMO.director);
    developer = await loginAs(app, DEMO.developer);
    clientAdmin = await loginAs(app, DEMO.clientAdmin);

    const organizations = await prisma.organization.findMany({
      where: { slug: { in: ['ashniva', 'acme-retail'] } },
      select: { id: true, slug: true },
    });
    providerOrgId = organizations.find((row) => row.slug === 'ashniva')?.id ?? '';
    acmeOrgId = organizations.find((row) => row.slug === 'acme-retail')?.id ?? '';
    directorUserId = director.body.user.id;
    expect(providerOrgId && acmeOrgId).toBeTruthy();
  });

  afterAll(async () => {
    // Only rows this suite created.
    if (createdIds.length > 0) {
      await prisma.integrationEvent.deleteMany({ where: { connectionId: { in: createdIds } } });
      await prisma.integrationConnection.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  const get = (session: Session, path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${session.accessToken}`);

  /** Seeds a connection directly, so the tests do not depend on a configured provider adapter. */
  async function seedConnection(organizationId: string, displayName: string) {
    const row = await prisma.integrationConnection.create({
      data: {
        organizationId,
        provider: 'GITHUB',
        status: 'CONNECTED',
        displayName,
        // Not a real credential — a marker this suite can search every response body for.
        encryptedCredentials: 'ENCRYPTED-CREDENTIAL-MARKER',
        webhookSecretEncrypted: 'ENCRYPTED-WEBHOOK-SECRET-MARKER',
        externalAccountId: 'acct-1',
        scopes: ['repo'],
        createdById: directorUserId,
      },
    });
    createdIds.push(row.id);
    return row;
  }

  describe('permissions', () => {
    it('lets a permitted user list connections', async () => {
      await get(director, '/api/v1/integrations').expect(200);
    });

    it('refuses a user without integration:read', async () => {
      // The developer role deliberately has no integration permissions.
      await get(developer, '/api/v1/integrations').expect(403);
    });

    it('refuses a client user outright', async () => {
      await get(clientAdmin, '/api/v1/integrations').expect(403);
    });

    it('refuses connecting without a fresh password check', async () => {
      // RecentAuthGuard answers 403, the same as every other re-auth-protected route in Phase 2.
      await request(app.getHttpServer())
        .post('/api/v1/integrations/GITHUB/connect')
        .set('Authorization', `Bearer ${director.accessToken}`)
        .send({ credential: 'a-token-value' })
        .expect(403);
    });

    it('rejects an unknown provider before any work happens', async () => {
      await get(director, '/api/v1/integrations/NOT_A_PROVIDER').expect(400);
    });
  });

  describe('credentials never leave the server', () => {
    it('omits the credential and the webhook secret from every response', async () => {
      await seedConnection(providerOrgId, 'Ashniva GitHub');

      const list = await get(director, '/api/v1/integrations').expect(200);
      const detail = await get(director, '/api/v1/integrations/GITHUB').expect(200);

      for (const body of [list.body, detail.body]) {
        const serialised = JSON.stringify(body);
        expect(serialised).not.toContain('ENCRYPTED-CREDENTIAL-MARKER');
        expect(serialised).not.toContain('ENCRYPTED-WEBHOOK-SECRET-MARKER');
        expect(serialised).not.toContain('encryptedCredentials');
        expect(serialised).not.toContain('webhookSecretEncrypted');
      }
    });

    it('reports only whether credentials exist', async () => {
      const detail = await get(director, '/api/v1/integrations/GITHUB').expect(200);
      expect(detail.body.hasCredentials).toBe(true);
      expect(detail.body.webhookConfigured).toBe(true);
      expect(detail.body.status).toBe('CONNECTED');
    });
  });

  describe('tenant isolation', () => {
    it('does not list another tenant’s connection', async () => {
      const foreign = await seedConnection(acmeOrgId, 'Acme GitHub');

      const list = await get(director, '/api/v1/integrations').expect(200);
      const ids = (list.body as { id: string }[]).map((row) => row.id);

      // The director's own organization is the provider; Acme's row belongs to another tenant.
      expect(ids).not.toContain(foreign.id);
    });

    it('scopes webhook events to the caller’s organization', async () => {
      const own = await prisma.integrationConnection.findFirst({
        where: { organizationId: providerOrgId, provider: 'GITHUB' },
      });
      const foreign = await prisma.integrationConnection.findFirst({
        where: { organizationId: acmeOrgId, provider: 'GITHUB' },
      });
      expect(own && foreign).toBeTruthy();

      await prisma.integrationEvent.createMany({
        data: [
          {
            organizationId: providerOrgId,
            connectionId: own?.id,
            provider: 'GITHUB',
            externalEventId: `own-${Date.now()}`,
            eventType: 'push',
            payloadDigest: 'digest-own',
          },
          {
            organizationId: acmeOrgId,
            connectionId: foreign?.id,
            provider: 'GITHUB',
            externalEventId: `foreign-${Date.now()}`,
            eventType: 'push',
            payloadDigest: 'digest-foreign',
          },
        ],
      });

      const events = await get(director, '/api/v1/integrations/events').expect(200);
      const rows = events.body as { id: string }[];
      const ids = rows.map((row) => row.id);

      const foreignEvent = await prisma.integrationEvent.findFirst({
        where: { organizationId: acmeOrgId },
      });
      expect(foreignEvent).toBeTruthy();
      expect(ids).not.toContain(foreignEvent?.id);
    });

    it('never returns a payload, only a digest', async () => {
      const events = await get(director, '/api/v1/integrations/events').expect(200);
      const serialised = JSON.stringify(events.body);
      expect(serialised).not.toContain('payloadDigest');
      expect(serialised).not.toContain('payload');
    });
  });

  describe('duplicate webhook protection', () => {
    it('rejects a second event with the same provider delivery id', async () => {
      const externalEventId = `dup-${Date.now()}`;
      const base = {
        organizationId: providerOrgId,
        provider: INTEGRATION_PROVIDER.GITHUB,
        externalEventId,
        eventType: 'push',
        payloadDigest: 'digest',
      } as const;

      await prisma.integrationEvent.create({ data: base });

      // The unique index is the protection, not a read-then-write check: a concurrent duplicate
      // hits the constraint rather than slipping through a gap between the read and the write.
      await expect(prisma.integrationEvent.create({ data: base })).rejects.toMatchObject({
        code: 'P2002',
      });
    });
  });
});
