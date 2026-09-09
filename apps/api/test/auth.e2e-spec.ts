import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PERMISSIONS, ROLE_KEYS } from '@ashniva/types';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import { TokenService } from '../src/modules/auth/token.service';

/**
 * Exercises the guard chain against the seeded database: a token minted for the seeded
 * developer resolves the membership and its permissions; anything else is rejected.
 */
describe('Authentication guards (e2e)', () => {
  let app: INestApplication;
  let tokenService: TokenService;
  let developerUserId: string;
  let organizationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();

    tokenService = app.get(TokenService);
    const prisma = app.get(PrismaService);
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { user: { email: 'developer@example.com' } },
    });
    developerUserId = membership.userId;
    organizationId = membership.organizationId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
    });
  });

  it('rejects a tampered token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.token')
      .expect(401);
  });

  it('rejects a valid token for an organization the user does not belong to', async () => {
    const token = await tokenService.signAccessToken({
      sub: developerUserId,
      organizationId: '00000000-0000-7000-8000-000000000000',
      roleKey: ROLE_KEYS.DEVELOPER,
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('returns the user with permissions resolved from the seeded role', async () => {
    const token = await tokenService.signAccessToken({
      sub: developerUserId,
      organizationId,
      roleKey: ROLE_KEYS.DEVELOPER,
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(developerUserId);
    expect(response.body.organization.id).toBe(organizationId);
    expect(response.body.roleKey).toBe(ROLE_KEYS.DEVELOPER);
    expect(response.body.permissions).toContain(PERMISSIONS.TASK_WORK);
    expect(response.body.permissions).not.toContain(PERMISSIONS.RELEASE_PUBLISH);
  });
});
