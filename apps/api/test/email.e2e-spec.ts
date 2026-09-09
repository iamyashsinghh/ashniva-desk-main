import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { MockEmailProvider } from '../src/modules/messaging/providers/mock-email.provider';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

const SMTP_PASSWORD = 'e2e-smtp-password-not-real';

/**
 * Email settings and delivery.
 *
 * The two things worth proving end to end: the stored password never comes back out of any
 * endpoint, and the same business event cannot email the same person twice.
 *
 * No real mail server is contacted. `MESSAGING_PROVIDER=mock` is set by the e2e environment, so
 * every send is captured in memory.
 */
describe('Email integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: MockEmailProvider;
  let director: Session;
  let developer: Session;
  let clientAdmin: Session;
  let providerOrgId: string;

  const api = () => request(app.getHttpServer());

  const settings = {
    senderName: 'Ashniva Desk',
    senderEmail: 'noreply@ashniva.example',
    host: 'smtp.example.com',
    port: 587,
    encryption: 'STARTTLS' as const,
    username: 'ashniva',
    password: SMTP_PASSWORD,
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    provider = app.get(MockEmailProvider);
    [director, developer, clientAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
    ]);
    const org = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = org?.id ?? '';
    expect(providerOrgId).toBeTruthy();
  });

  beforeEach(() => provider.reset());

  afterAll(async () => {
    await prisma.outboundMessage.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.integrationConnection.deleteMany({
      where: { organizationId: providerOrgId, provider: 'EMAIL' },
    });
    await app.close();
  });

  async function saveSettings(overrides: Record<string, unknown> = {}) {
    return api()
      .put('/api/v1/settings/email')
      .set('Authorization', bearer(director))
      .send({ ...settings, ...overrides })
      .expect(200);
  }

  describe('settings', () => {
    it('saves and reads back the non-secret fields', async () => {
      const saved = await saveSettings();
      expect(saved.body).toMatchObject({
        senderEmail: 'noreply@ashniva.example',
        host: 'smtp.example.com',
        port: 587,
        encryption: 'STARTTLS',
        enabled: true,
      });
    });

    it('never returns the password, only whether one is stored', async () => {
      const saved = await saveSettings();
      expect(saved.body.hasPassword).toBe(true);
      expect(JSON.stringify(saved.body)).not.toContain(SMTP_PASSWORD);

      const read = await api()
        .get('/api/v1/settings/email')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(JSON.stringify(read.body)).not.toContain(SMTP_PASSWORD);
      expect(read.body).not.toHaveProperty('password');
      expect(read.body).not.toHaveProperty('encryptedCredentials');
    });

    it('stores the password encrypted, not in the clear', async () => {
      await saveSettings();
      const row = await prisma.integrationConnection.findFirst({
        where: { organizationId: providerOrgId, provider: 'EMAIL' },
      });
      expect(row?.encryptedCredentials).toBeTruthy();
      expect(row?.encryptedCredentials).not.toContain(SMTP_PASSWORD);
      // And it is not hiding in the non-secret settings blob either.
      expect(JSON.stringify(row?.settings)).not.toContain(SMTP_PASSWORD);
    });

    it('keeps the stored password when a later save omits it', async () => {
      await saveSettings();
      const updated = await api()
        .put('/api/v1/settings/email')
        .set('Authorization', bearer(director))
        .send({ ...settings, password: undefined, port: 465, encryption: 'TLS' })
        .expect(200);

      expect(updated.body.port).toBe(465);
      expect(updated.body.hasPassword).toBe(true);
    });

    it('rejects a port outside the valid range', async () => {
      await api()
        .put('/api/v1/settings/email')
        .set('Authorization', bearer(director))
        .send({ ...settings, port: 70_000 })
        .expect(400);
    });

    it('rejects an unknown encryption mode rather than storing a typo', async () => {
      await api()
        .put('/api/v1/settings/email')
        .set('Authorization', bearer(director))
        .send({ ...settings, encryption: 'SSLv3' })
        .expect(400);
    });
  });

  describe('permissions', () => {
    it('does not let a developer read or change the settings', async () => {
      await api().get('/api/v1/settings/email').set('Authorization', bearer(developer)).expect(403);
      await api()
        .put('/api/v1/settings/email')
        .set('Authorization', bearer(developer))
        .send(settings)
        .expect(403);
    });

    it('keeps a client out entirely', async () => {
      await api()
        .get('/api/v1/settings/email')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .get('/api/v1/settings/email/history')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });

    it('rejects an unauthenticated caller', async () => {
      await api().get('/api/v1/settings/email').expect(401);
    });
  });

  describe('sending', () => {
    it('sends a test to the caller’s own address and records it', async () => {
      await saveSettings();
      const response = await api()
        .post('/api/v1/settings/email/test-message')
        .set('Authorization', bearer(director))
        .expect(201);
      expect(response.body.queued).toBe(true);

      const history = await api()
        .get('/api/v1/settings/email/history')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(history.body.items[0]).toMatchObject({ channel: 'EMAIL', template: 'TEST' });
    });

    it('masks the recipient in the history', async () => {
      await saveSettings();
      await api()
        .post('/api/v1/settings/email/test-message')
        .set('Authorization', bearer(director))
        .expect(201);

      const history = await api()
        .get('/api/v1/settings/email/history')
        .set('Authorization', bearer(director))
        .expect(200);
      const row = history.body.items[0];
      expect(row.destination).toContain('•');
      expect(row.destination).not.toBe(DEMO.director);
      expect(row.destination).toContain('@example.com');
    });

    it('refuses a test before the settings are saved', async () => {
      await prisma.integrationConnection.deleteMany({
        where: { organizationId: providerOrgId, provider: 'EMAIL' },
      });
      await api()
        .post('/api/v1/settings/email/test-message')
        .set('Authorization', bearer(director))
        .expect(400);
    });

    it('reports the mock provider as reachable without sending anything', async () => {
      await saveSettings();
      const result = await api()
        .post('/api/v1/settings/email/test-connection')
        .set('Authorization', bearer(director))
        .expect(201);
      expect(result.body.ok).toBe(true);
      expect(provider.sent()).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('will not send the same event to the same person twice', async () => {
      await saveSettings();
      const row = await prisma.integrationConnection.findFirst({
        where: { organizationId: providerOrgId, provider: 'EMAIL' },
      });
      expect(row).toBeTruthy();

      // Two claims with the same key: the unique index must let exactly one through.
      const key = `e2e-duplicate-${Date.now()}`;
      const first = await prisma.outboundMessage.create({
        data: {
          organizationId: providerOrgId,
          channel: 'EMAIL',
          destination: 'priya@example.com',
          template: 'TASK_ASSIGNED',
          idempotencyKey: key,
        },
      });
      expect(first.id).toBeTruthy();

      await expect(
        prisma.outboundMessage.create({
          data: {
            organizationId: providerOrgId,
            channel: 'EMAIL',
            destination: 'priya@example.com',
            template: 'TASK_ASSIGNED',
            idempotencyKey: key,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('lets the same key through on a different channel', async () => {
      // A task assignment may legitimately go out by both email and WhatsApp.
      const key = `e2e-cross-channel-${Date.now()}`;
      const rows = await Promise.all(
        (['EMAIL', 'WHATSAPP'] as const).map((channel) =>
          prisma.outboundMessage.create({
            data: {
              organizationId: providerOrgId,
              channel,
              destination: 'priya@example.com',
              template: 'TASK_ASSIGNED',
              idempotencyKey: key,
            },
          }),
        ),
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe('tenant scope', () => {
    it('does not show another organization’s messages', async () => {
      await saveSettings();
      const other = await prisma.organization.findFirst({
        where: { isServiceProvider: false },
        select: { id: true },
      });
      expect(other).toBeTruthy();

      const foreign = await prisma.outboundMessage.create({
        data: {
          organizationId: other?.id ?? '',
          channel: 'EMAIL',
          destination: 'someone@zenith.example',
          template: 'TICKET_REPLY',
          idempotencyKey: `e2e-foreign-${Date.now()}`,
        },
      });

      const history = await api()
        .get('/api/v1/settings/email/history?limit=100')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(history.body.items.map((row: { id: string }) => row.id)).not.toContain(foreign.id);

      await prisma.outboundMessage.delete({ where: { id: foreign.id } });
    });
  });
});
