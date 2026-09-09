import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';

import { SecretCipherService } from '../src/common/crypto/secret-cipher.service';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

const WEBHOOK_SECRET = 'phase3-test-webhook-secret';

/**
 * The Git webhook path, which is the only unauthenticated write surface Phase 3 adds.
 *
 * The order the service enforces is what these tests check: an unverified request must not
 * produce a single row, a redelivery must not produce a second, and a payload naming a repository
 * this deployment does not know must be turned away before anything is recorded — otherwise an
 * anonymous caller could write rows by inventing repository ids.
 */
describe('Git integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let developer: Session;
  let clientAdmin: Session;
  let providerOrgId: string;
  let projectId: string;
  let projectCode: string;
  let connectionId: string;
  let linkId: string;
  const externalRepoId = `repo-${Date.now()}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const cipher = app.get(SecretCipherService);
    director = await loginAs(app, DEMO.director);
    developer = await loginAs(app, DEMO.developer);
    clientAdmin = await loginAs(app, DEMO.clientAdmin);

    const org = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = org?.id ?? '';
    const project = await prisma.project.findFirst({
      where: { organizationId: providerOrgId, deletedAt: null },
      select: { id: true, code: true },
    });
    projectId = project?.id ?? '';
    projectCode = project?.code ?? '';
    expect(providerOrgId && projectId).toBeTruthy();

    const connection = await prisma.integrationConnection.create({
      data: {
        organizationId: providerOrgId,
        provider: 'GITHUB',
        status: 'CONNECTED',
        displayName: 'Test GitHub',
        encryptedCredentials: cipher.encrypt('a-test-token'),
        webhookSecretEncrypted: cipher.encrypt(WEBHOOK_SECRET),
        createdById: director.body.user.id,
      },
    });
    connectionId = connection.id;

    const link = await prisma.repositoryLink.create({
      data: {
        organizationId: providerOrgId,
        projectId,
        connectionId,
        provider: 'GITHUB',
        externalRepoId,
        owner: 'ashniva',
        name: 'desk',
        linkedById: director.body.user.id,
      },
    });
    linkId = link.id;
  });

  afterAll(async () => {
    await prisma.codeActivity.deleteMany({ where: { repositoryLinkId: linkId } });
    await prisma.repositoryLink.deleteMany({ where: { id: linkId } });
    await prisma.integrationEvent.deleteMany({ where: { connectionId } });
    await prisma.integrationConnection.deleteMany({ where: { id: connectionId } });
    await app.close();
  });

  const push = (deliveryGuid: string, message: string) => ({
    ref: 'refs/heads/feature/work',
    repository: { id: externalRepoId },
    commits: [
      {
        id: `sha-${deliveryGuid}`,
        message,
        timestamp: '2026-09-06T10:00:00Z',
        author: { name: 'Priya S', username: 'priya' },
      },
    ],
  });

  const send = (body: unknown, guid: string, secret: string | null) => {
    const raw = JSON.stringify(body);
    const call = request(app.getHttpServer())
      .post('/api/v1/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', guid);
    if (secret !== null) {
      call.set(
        'x-hub-signature-256',
        `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
      );
    }
    return call.send(raw);
  };

  describe('signature verification', () => {
    it('accepts a correctly signed delivery and stores the activity', async () => {
      const guid = `ok-${Date.now()}`;
      await send(push(guid, 'TSK-1 first commit'), guid, WEBHOOK_SECRET).expect(202);

      const rows = await prisma.codeActivity.findMany({ where: { repositoryLinkId: linkId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'COMMIT', title: 'TSK-1 first commit' });
    });

    it('rejects a delivery signed with the wrong secret, and writes no activity', async () => {
      const guid = `bad-${Date.now()}`;
      const before = await prisma.codeActivity.count({ where: { repositoryLinkId: linkId } });

      await send(push(guid, 'should not be stored'), guid, 'the-wrong-secret').expect(401);

      expect(await prisma.codeActivity.count({ where: { repositoryLinkId: linkId } })).toBe(before);
      // Nothing is written at all. Recording the attempt would make the event log a place an
      // unauthenticated caller can append to — repository ids are public, and `event_type` comes
      // straight from a header. A rejected delivery goes to the application log instead.
      const event = await prisma.integrationEvent.findFirst({
        where: { externalEventId: guid },
      });
      expect(event).toBeNull();
    });

    it('rejects a delivery with no signature at all', async () => {
      const guid = `none-${Date.now()}`;
      await send(push(guid, 'unsigned'), guid, null).expect(401);
    });

    it('rejects a body altered after signing', async () => {
      const guid = `tamper-${Date.now()}`;
      const signed = push(guid, 'original');
      const raw = JSON.stringify(signed);
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-event', 'push')
        .set('x-github-delivery', guid)
        .set(
          'x-hub-signature-256',
          `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`,
        )
        .send(JSON.stringify(push(guid, 'tampered')))
        .expect(401);
    });

    it('turns away a payload naming a repository it does not know, recording nothing', async () => {
      const guid = `unknown-${Date.now()}`;
      const body = { ...push(guid, 'x'), repository: { id: 'not-a-linked-repo' } };
      await send(body, guid, WEBHOOK_SECRET).expect(401);

      // Nothing is written: without a link there is no tenant to attribute the row to.
      expect(await prisma.integrationEvent.count({ where: { externalEventId: guid } })).toBe(0);
    });
  });

  describe('duplicate protection', () => {
    it('accepts a redelivery without storing it twice', async () => {
      const guid = `dup-${Date.now()}`;
      const body = push(guid, 'TSK-2 only once');

      await send(body, guid, WEBHOOK_SECRET).expect(202);
      const afterFirst = await prisma.codeActivity.count({ where: { repositoryLinkId: linkId } });

      // Same delivery id: 202 again so the provider stops retrying, but no second row.
      await send(body, guid, WEBHOOK_SECRET).expect(202);
      expect(await prisma.codeActivity.count({ where: { repositoryLinkId: linkId } })).toBe(
        afterFirst,
      );
      expect(await prisma.integrationEvent.count({ where: { externalEventId: guid } })).toBe(1);
    });
  });

  describe('task linking', () => {
    it('links a commit to the task its message names', async () => {
      const task = await prisma.task.findFirst({
        where: { organizationId: providerOrgId, projectId, deletedAt: null },
        select: { id: true, number: true },
      });
      expect(task).toBeTruthy();

      const guid = `link-${Date.now()}`;
      await send(
        push(guid, `${projectCode}-${task?.number} wire up the fix`),
        guid,
        WEBHOOK_SECRET,
      ).expect(202);

      const activity = await prisma.codeActivity.findFirst({
        where: { repositoryLinkId: linkId, externalId: `sha-${guid}` },
      });
      expect(activity?.taskId).toBe(task?.id);
    });

    it('stores a commit with no resolvable reference, unlinked', async () => {
      const guid = `noref-${Date.now()}`;
      await send(push(guid, 'chore: tidy imports'), guid, WEBHOOK_SECRET).expect(202);

      const activity = await prisma.codeActivity.findFirst({
        where: { repositoryLinkId: linkId, externalId: `sha-${guid}` },
      });
      expect(activity).toBeTruthy();
      expect(activity?.taskId).toBeNull();
    });
  });

  describe('permissions and isolation', () => {
    it('lets a permitted user read the project’s repositories and activity', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/repositories`)
        .set('Authorization', `Bearer ${director.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/activity`)
        .set('Authorization', `Bearer ${director.accessToken}`)
        .expect(200);
    });

    it('lets a developer read activity but not link a repository', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/activity`)
        .set('Authorization', `Bearer ${developer.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/repositories`)
        .set('Authorization', `Bearer ${developer.accessToken}`)
        .send({ provider: 'GITHUB', externalRepoId: 'x', owner: 'o', name: 'n' })
        .expect(403);
    });

    it('keeps development activity away from client users entirely', async () => {
      // Commit messages, branch names and reviewer names are internal; there is no portal route
      // for them and the internal one refuses a client outright.
      await request(app.getHttpServer())
        .get(`/api/v1/projects/${projectId}/activity`)
        .set('Authorization', `Bearer ${clientAdmin.accessToken}`)
        .expect(403);
    });
  });
});
