import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

const ACCESS_TOKEN = 'e2e-whatsapp-access-token-not-real';
const APP_SECRET = 'e2e-whatsapp-app-secret-not-real';
const VERIFY_TOKEN = 'e2e-whatsapp-verify-token';
const WABA_ID = `9${Date.now().toString().slice(-12)}`;
const PHONE_ID = '106540352242922';

/**
 * WhatsApp settings and the inbound webhook.
 *
 * The webhook is the only unauthenticated write surface this slice adds, so most of what is
 * proved here is about what it refuses: an invented business account, a missing signature, a
 * forged one, and a redelivery.
 *
 * No Meta account is contacted; `MESSAGING_PROVIDER=mock` is forced by the e2e environment.
 */
describe('WhatsApp integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let developer: Session;
  let clientAdmin: Session;
  let providerOrgId: string;

  const api = () => request(app.getHttpServer());

  const settings = {
    businessAccountId: WABA_ID,
    phoneNumberId: PHONE_ID,
    displayPhoneNumber: '+441234567890',
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET,
    accessToken: ACCESS_TOKEN,
    templateNames: { TASK_ASSIGNED: 'task_assigned_v1', TEST: 'test_message_v1' },
  };

  /** A well-formed delivery-status payload for the configured account. */
  const payloadFor = (providerMessageId: string, status = 'delivered') => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_ID },
              statuses: [{ id: providerMessageId, status, timestamp: '1788700000' }],
            },
          },
        ],
      },
    ],
  });

  const sign = (body: unknown, secret = APP_SECRET) =>
    `sha256=${createHmac('sha256', secret)
      .update(Buffer.from(JSON.stringify(body), 'utf8'))
      .digest('hex')}`;

  /** Posts a payload with a signature over exactly the bytes supertest will send. */
  const postWebhook = (body: unknown, signature: string | null) => {
    const raw = JSON.stringify(body);
    const call = api().post('/api/v1/webhooks/whatsapp').set('content-type', 'application/json');
    if (signature) {
      call.set('x-hub-signature-256', signature);
    }
    return call.send(raw);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, developer, clientAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
    ]);
    const org = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = org?.id ?? '';
    expect(providerOrgId).toBeTruthy();

    await api()
      .put('/api/v1/settings/whatsapp')
      .set('Authorization', bearer(director))
      .send(settings)
      .expect(200);
  });

  afterAll(async () => {
    await prisma.outboundMessage.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.integrationEvent.deleteMany({
      where: { organizationId: providerOrgId, provider: 'WHATSAPP' },
    });
    await prisma.integrationConnection.deleteMany({
      where: { organizationId: providerOrgId, provider: 'WHATSAPP' },
    });
    await app.close();
  });

  describe('settings', () => {
    it('reads back the non-secret fields', async () => {
      const read = await api()
        .get('/api/v1/settings/whatsapp')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(read.body).toMatchObject({
        businessAccountId: WABA_ID,
        phoneNumberId: PHONE_ID,
        enabled: true,
      });
    });

    it('never returns the access token, app secret or verify token', async () => {
      const read = await api()
        .get('/api/v1/settings/whatsapp')
        .set('Authorization', bearer(director))
        .expect(200);
      const body = JSON.stringify(read.body);
      expect(body).not.toContain(ACCESS_TOKEN);
      expect(body).not.toContain(APP_SECRET);
      expect(body).not.toContain(VERIFY_TOKEN);
      expect(read.body).toMatchObject({
        hasAccessToken: true,
        hasAppSecret: true,
        hasVerifyToken: true,
      });
    });

    it('does not leak the verify token through the generic integrations endpoint', async () => {
      // `/settings/whatsapp` has its own mapper and reports three booleans. `/integrations/:p`
      // returns the raw settings blob, which is where the verify token lives — Meta echoes it
      // back during the handshake, so it cannot be a write-only field, but it is still a secret.
      const read = await api()
        .get('/api/v1/integrations/WHATSAPP')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(JSON.stringify(read.body)).not.toContain(VERIFY_TOKEN);
      expect(read.body.settings.verifyToken).toBe(true);
      // The non-secret settings still come through as themselves.
      expect(read.body.settings.phoneNumberId).toBe(PHONE_ID);
    });

    it('stores both secrets encrypted', async () => {
      const row = await prisma.integrationConnection.findFirst({
        where: { organizationId: providerOrgId, provider: 'WHATSAPP' },
      });
      expect(row?.encryptedCredentials).toBeTruthy();
      expect(row?.encryptedCredentials).not.toContain(ACCESS_TOKEN);
      expect(row?.webhookSecretEncrypted).not.toContain(APP_SECRET);
      // And neither is hiding in the non-secret settings blob.
      expect(JSON.stringify(row?.settings)).not.toContain(ACCESS_TOKEN);
      expect(JSON.stringify(row?.settings)).not.toContain(APP_SECRET);
    });

    it('rejects a business account id that is not a Meta id', async () => {
      await api()
        .put('/api/v1/settings/whatsapp')
        .set('Authorization', bearer(director))
        .send({ ...settings, businessAccountId: '../../etc/passwd' })
        .expect(400);
    });

    it('rejects an api version that is not a version', async () => {
      await api()
        .put('/api/v1/settings/whatsapp')
        .set('Authorization', bearer(director))
        .send({ ...settings, apiVersion: '../v1.0' })
        .expect(400);
    });

    it('keeps a client and a developer out', async () => {
      await api()
        .get('/api/v1/settings/whatsapp')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .put('/api/v1/settings/whatsapp')
        .set('Authorization', bearer(developer))
        .send(settings)
        .expect(403);
    });
  });

  describe('the subscription handshake', () => {
    it('echoes the challenge for the right token', async () => {
      const response = await api()
        .get('/api/v1/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '1158201444',
          waba: WABA_ID,
        })
        .expect(200);
      expect(response.text).toContain('1158201444');
    });

    it('refuses a wrong token', async () => {
      await api()
        .get('/api/v1/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'not-the-token',
          'hub.challenge': '1158201444',
          waba: WABA_ID,
        })
        .expect(403);
    });

    it('refuses a business account this deployment does not know', async () => {
      // Otherwise the endpoint would confirm any challenge to anybody.
      await api()
        .get('/api/v1/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '1158201444',
          waba: '999999999999999',
        })
        .expect(403);
    });

    it('refuses a mode other than subscribe', async () => {
      await api()
        .get('/api/v1/webhooks/whatsapp')
        .query({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, waba: WABA_ID })
        .expect(403);
    });
  });

  describe('webhook security', () => {
    it('rejects a delivery with no signature', async () => {
      await postWebhook(payloadFor('wamid.unsigned'), null).expect(401);
    });

    it('rejects a forged signature', async () => {
      const body = payloadFor('wamid.forged');
      await postWebhook(body, sign(body, 'the-wrong-secret')).expect(401);
    });

    it('rejects a signature over different bytes', async () => {
      // A replayed signature from another payload must not validate this one.
      const signed = payloadFor('wamid.a');
      const sent = payloadFor('wamid.b');
      await postWebhook(sent, sign(signed)).expect(401);
    });

    it('rejects an invented business account, writing nothing', async () => {
      const before = await prisma.integrationEvent.count();
      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '111111111111111',
            changes: [
              { field: 'messages', value: { statuses: [{ id: 'wamid.x', status: 'sent' }] } },
            ],
          },
        ],
      };
      await postWebhook(body, sign(body)).expect(401);

      // The point of the ordering: an anonymous caller cannot create rows by guessing at ids.
      expect(await prisma.integrationEvent.count()).toBe(before);
    });

    it('rejects a payload that is not a WhatsApp delivery', async () => {
      const body = { object: 'page', entry: [] };
      await postWebhook(body, sign(body)).expect(401);
    });

    it('does not fall over on a malformed but correctly signed payload', async () => {
      const body = { object: 'whatsapp_business_account', entry: [{ id: WABA_ID, changes: 'x' }] };
      // Signed by a real tenant, so it gets past verification — and must still not 500.
      await postWebhook(body, sign(body)).expect(200);
    });
  });

  describe('delivery receipts', () => {
    it('marks a message delivered and ignores the redelivery', async () => {
      const providerMessageId = `wamid.${Date.now()}`;
      const message = await prisma.outboundMessage.create({
        data: {
          organizationId: providerOrgId,
          channel: 'WHATSAPP',
          destination: '+441234567890',
          template: 'TASK_ASSIGNED',
          idempotencyKey: `e2e-receipt-${Date.now()}`,
          status: 'SENDING',
          providerMessageId,
        },
      });

      const body = payloadFor(providerMessageId);
      const first = await postWebhook(body, sign(body)).expect(200);
      expect(first.body.status).toBe('accepted');

      expect(await prisma.outboundMessage.findUnique({ where: { id: message.id } })).toMatchObject({
        status: 'SENT',
      });

      // Meta retries; the unique index on the event turns the second one into a no-op.
      const second = await postWebhook(body, sign(body)).expect(200);
      expect(second.body.status).toBe('duplicate');
    });

    it('records a failure with the provider’s reason', async () => {
      const providerMessageId = `wamid.fail-${Date.now()}`;
      const message = await prisma.outboundMessage.create({
        data: {
          organizationId: providerOrgId,
          channel: 'WHATSAPP',
          destination: '+441234567890',
          template: 'TASK_ASSIGNED',
          idempotencyKey: `e2e-fail-${Date.now()}`,
          status: 'SENDING',
          providerMessageId,
        },
      });

      const body = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: WABA_ID,
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: providerMessageId,
                      status: 'failed',
                      errors: [{ code: 131_047, title: 'Re-engagement message' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      await postWebhook(body, sign(body)).expect(200);

      const updated = await prisma.outboundMessage.findUnique({ where: { id: message.id } });
      expect(updated).toMatchObject({ status: 'FAILED' });
      expect(updated?.lastError).toContain('131047');
    });

    it('does not let a receipt reach another organization’s message', async () => {
      const other = await prisma.organization.findFirst({
        where: { isServiceProvider: false },
        select: { id: true },
      });
      const providerMessageId = `wamid.foreign-${Date.now()}`;
      const foreign = await prisma.outboundMessage.create({
        data: {
          organizationId: other?.id ?? '',
          channel: 'WHATSAPP',
          destination: '+441234567890',
          template: 'TASK_ASSIGNED',
          idempotencyKey: `e2e-foreign-wa-${Date.now()}`,
          status: 'SENDING',
          providerMessageId,
        },
      });

      // A verified webhook for our tenant, naming a message id that belongs to another one.
      const body = payloadFor(providerMessageId);
      await postWebhook(body, sign(body)).expect(200);

      expect(await prisma.outboundMessage.findUnique({ where: { id: foreign.id } })).toMatchObject({
        status: 'SENDING',
      });
      await prisma.outboundMessage.delete({ where: { id: foreign.id } });
    });
  });

  describe('sending', () => {
    it('sends a mapped template', async () => {
      const response = await api()
        .post('/api/v1/settings/whatsapp/test-message')
        .set('Authorization', bearer(director))
        .send({ template: 'TEST', toPhone: '+441234567890' })
        .expect(201);
      expect(response.body.queued).toBe(true);
    });

    it('rejects a phone number that is not a number', async () => {
      await api()
        .post('/api/v1/settings/whatsapp/test-message')
        .set('Authorization', bearer(director))
        .send({ template: 'TEST', toPhone: 'not-a-number' })
        .expect(400);
    });

    it('masks the number in the history', async () => {
      await api()
        .post('/api/v1/settings/whatsapp/test-message')
        .set('Authorization', bearer(director))
        .send({ template: 'TEST', toPhone: '+441234567890' })
        .expect(201);

      const history = await api()
        .get('/api/v1/settings/whatsapp/history')
        .set('Authorization', bearer(director))
        .expect(200);
      const row = history.body.items[0];
      expect(row.destination).toContain('•');
      expect(row.destination).not.toContain('1234567');
      expect(row.destination).toMatch(/890$/);
    });
  });
});
