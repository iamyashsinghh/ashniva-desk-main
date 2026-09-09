import type { INestApplication } from '@nestjs/common';
import { PERMISSIONS, REFRESH_TOKEN_COOKIE, ROLE_KEYS } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { LOGIN_ATTEMPTS_PER_MINUTE } from '../src/modules/auth/auth.controller';
import { DEMO, SEED_PASSWORD, bearer, createTestApp, loginAs } from './helpers/test-app';

describe('Authentication flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a wrong password with a generic 401 and audits the attempt', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEMO.developer, password: 'definitely-wrong' })
      .expect(401);
    expect(response.body.message).toBe('Invalid email or password');
    expect(response.headers['set-cookie']).toBeUndefined();

    const prisma = app.get(PrismaService);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'auth.login_failed', requestId: { not: 'seed' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects an unknown email with the same message', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: SEED_PASSWORD })
      .expect(401);
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('validates the body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
  });

  it('signs in: access token in the body, refresh token only in an httpOnly cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEMO.developer, password: SEED_PASSWORD })
      .expect(200);

    expect(typeof response.body.accessToken).toBe('string');
    expect(response.body.accessTokenExpiresInSeconds).toBeGreaterThan(0);
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.user).toMatchObject({
      email: DEMO.developer,
      roleKey: ROLE_KEYS.DEVELOPER,
      showDevelopmentSection: true,
    });
    expect(response.body.user.organization.isServiceProvider).toBe(true);
    expect(response.body.user.permissions).toContain(PERMISSIONS.TASK_WORK);
    expect(response.body.user.permissions).not.toContain(PERMISSIONS.USER_MANAGE);

    const cookie = String(response.headers['set-cookie']?.[0] ?? '');
    expect(cookie.startsWith(`${REFRESH_TOKEN_COOKIE}=`)).toBe(true);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('returns the session user from /auth/me', async () => {
    const session = await loginAs(app, DEMO.clientAdmin);
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', bearer(session))
      .expect(200);
    expect(response.body).toMatchObject({
      email: DEMO.clientAdmin,
      roleKey: ROLE_KEYS.CLIENT_ADMIN,
      organization: { slug: 'acme-retail', isServiceProvider: false },
    });
  });

  it('rotates the refresh token and revokes the family when an old token is reused', async () => {
    const session = await loginAs(app, DEMO.tester);

    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(200);
    expect(first.body.accessToken).toBeDefined();
    expect(first.body.user.email).toBe(DEMO.tester);
    const rotatedCookie = String(first.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';
    expect(rotatedCookie).not.toBe(session.cookie);

    // Presenting the already-rotated token is treated as theft: the whole family dies.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });

  it('refresh without a cookie is rejected', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const session = await loginAs(app, DEMO.support);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', session.cookie)
      .set('Authorization', bearer(session))
      .expect(204);
    expect(String(response.headers['set-cookie']?.[0] ?? '')).toMatch(
      new RegExp(`${REFRESH_TOKEN_COOKIE}=;`),
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.cookie)
      .expect(401);
  });

  it('refuses to switch to an organization the user does not belong to', async () => {
    const session = await loginAs(app, DEMO.developer);
    await request(app.getHttpServer())
      .post('/api/v1/auth/switch-organization')
      .set('Authorization', bearer(session))
      .send({ organizationId: '00000000-0000-7000-8000-000000000000' })
      .expect(401);
  });

  it('a suspended user cannot sign in', async () => {
    const prisma = app.get(PrismaService);
    await prisma.user.update({ where: { email: DEMO.employee }, data: { status: 'SUSPENDED' } });
    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: DEMO.employee, password: SEED_PASSWORD })
        .expect(401);
    } finally {
      await prisma.user.update({ where: { email: DEMO.employee }, data: { status: 'ACTIVE' } });
    }
  });

  it('changing the password signs out other sessions', async () => {
    const session = await loginAs(app, DEMO.zenithEmployee);
    const other = await loginAs(app, DEMO.zenithEmployee);
    const newPassword = 'Temporary-Pass-123';
    await request(app.getHttpServer())
      .post('/api/v1/users/me/change-password')
      .set('Authorization', bearer(session))
      .send({ currentPassword: SEED_PASSWORD, newPassword })
      .expect(204);
    try {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', other.cookie)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: DEMO.zenithEmployee, password: SEED_PASSWORD })
        .expect(401);
      const again = await loginAs(app, DEMO.zenithEmployee, newPassword);
      // Restore the demo password so the seed stays usable without re-running it.
      await request(app.getHttpServer())
        .post('/api/v1/users/me/change-password')
        .set('Authorization', bearer(again))
        .send({ currentPassword: newPassword, newPassword: SEED_PASSWORD })
        .expect(204);
    } catch (error) {
      const prisma = app.get(PrismaService);
      const argon2 = await import('argon2');
      await prisma.user.update({
        where: { email: DEMO.zenithEmployee },
        data: { passwordHash: await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id }) },
      });
      throw error;
    }
  });

  it('rate-limits repeated login attempts', async () => {
    let limited = false;
    for (let attempt = 0; attempt < LOGIN_ATTEMPTS_PER_MINUTE + 2; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ratelimit@example.com', password: 'wrong-password' });
      if (response.status === 429) {
        limited = true;
        break;
      }
      expect(response.status).toBe(401);
    }
    expect(limited).toBe(true);
  });
});
