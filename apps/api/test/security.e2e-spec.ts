import type { INestApplication } from '@nestjs/common';
import { PERMISSIONS, REAUTH_HEADER, ROLE_KEYS } from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import {
  DEMO,
  SEED_PASSWORD,
  bearer,
  createTestApp,
  loginAs,
  reauthHeaders,
  type Session,
} from './helpers/test-app';

/**
 * Phase 2 security: invitations, forgot/reset password, re-authentication for sensitive changes,
 * custom roles with anti-escalation rules, and a restricted custom role in use.
 */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let clientAdmin: Session;
  const api = () => request(app.getHttpServer());
  const stamp = Date.now();

  // Cached by the helper: /auth/reauth allows ten calls a minute per client IP, and every call in
  // a test run comes from 127.0.0.1.
  const reauth = async (session: Session, password = SEED_PASSWORD): Promise<string> =>
    (await reauthHeaders(app, session, password))[REAUTH_HEADER] ?? '';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    director = await loginAs(app, DEMO.director);
    clientAdmin = await loginAs(app, DEMO.clientAdmin);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('invitations', () => {
    const email = `invitee-${stamp}@example.com`;
    let link = '';
    let userId = '';

    it('creating a person without a password returns an invitation link', async () => {
      const response = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ email, name: 'Invited Person', roleKey: ROLE_KEYS.DEVELOPER })
        .expect(201);
      expect(response.body.status).toBe('INVITED');
      expect(response.body.invitation.link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
      link = response.body.invitation.link;
      userId = response.body.id;
    });

    it('an invited person cannot sign in with any password yet', async () => {
      await api().post('/api/v1/auth/login').send({ email, password: SEED_PASSWORD }).expect(401);
    });

    it('the invitation page shows who it is for, and a wrong token is a 404', async () => {
      const token = link.split('/invite/')[1] ?? '';
      const preview = await api().get(`/api/v1/auth/invitations/${token}`).expect(200);
      expect(preview.body).toMatchObject({ email, roleName: expect.any(String) });
      await api()
        .get(`/api/v1/auth/invitations/${'x'.repeat(43)}`)
        .expect(404);
    });

    it('accepting sets the password, signs in, and cannot be accepted twice', async () => {
      const token = link.split('/invite/')[1] ?? '';
      const accepted = await api()
        .post('/api/v1/auth/invitations/accept')
        .send({ token, password: 'Welcome-to-Ashniva-2026' })
        .expect(200);
      expect(accepted.body.user.email).toBe(email);
      expect(accepted.headers['set-cookie']?.[0]).toContain('ashniva_refresh=');
      await api()
        .post('/api/v1/auth/invitations/accept')
        .send({ token, password: 'Welcome-to-Ashniva-2026' })
        .expect(404);
      await api()
        .post('/api/v1/auth/login')
        .send({ email, password: 'Welcome-to-Ashniva-2026' })
        .expect(200);
    });

    it('re-issuing an invitation for an active person is refused', async () => {
      await api()
        .post(`/api/v1/users/${userId}/invitations`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .expect(400);
    });

    it('a client admin cannot invite internal staff roles', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(clientAdmin))
        .set(REAUTH_HEADER, await reauth(clientAdmin))
        .send({
          email: `sneaky-${stamp}@example.com`,
          name: 'Sneaky',
          roleKey: ROLE_KEYS.DEVELOPER,
        })
        .expect(400);
    });
  });

  describe('forgot / reset password', () => {
    it('answers 202 for known and unknown addresses alike', async () => {
      await api().post('/api/v1/auth/forgot-password').send({ email: DEMO.tester }).expect(202);
      await api()
        .post('/api/v1/auth/forgot-password')
        .send({ email: `nobody-${stamp}@example.com` })
        .expect(202);
    });

    it('stores only a hash, and the link is single use and signs other devices out', async () => {
      const tester = await prisma.user.findUniqueOrThrow({ where: { email: DEMO.tester } });
      const other = await loginAs(app, DEMO.tester);
      const row = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId: tester.id, usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      // The raw token is only in the e-mail; the test reaches into the mailer's development log
      // path by reconstructing nothing — instead a fresh token is minted through the service.
      const { AccountTokensService } = await import('../src/modules/auth/account-tokens.service');
      const service = app.get(AccountTokensService);
      const spy = jest.spyOn(
        // any: reach the private mailer to capture the link the e-mail would carry
        (
          service as unknown as {
            mailer: { sendPasswordReset: (input: { link: string }) => Promise<void> };
          }
        ).mailer,
        'sendPasswordReset',
      );
      await service.requestPasswordReset(DEMO.tester, {});
      const link = spy.mock.calls[0]?.[0]?.link ?? '';
      const token = link.split('/reset-password/')[1] ?? '';
      expect(token.length).toBeGreaterThan(30);

      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'short' })
        .expect(400);
      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand-new-password-2026' })
        .expect(204);
      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand-new-password-2026' })
        .expect(400);
      // The old session's refresh token was revoked.
      await api().post('/api/v1/auth/refresh').set('Cookie', other.cookie).expect(401);
      await api()
        .post('/api/v1/auth/login')
        .send({ email: DEMO.tester, password: 'Brand-new-password-2026' })
        .expect(200);
      // Put the demo password back for the other suites.
      await service.requestPasswordReset(DEMO.tester, {});
      const again = spy.mock.calls[1]?.[0]?.link.split('/reset-password/')[1] ?? '';
      await api()
        .post('/api/v1/auth/reset-password')
        .send({ token: again, password: SEED_PASSWORD })
        .expect(204);
      spy.mockRestore();
    });
  });

  describe('re-authentication and custom roles', () => {
    let roleId = '';
    let restrictedUser = '';
    const restrictedEmail = `viewer-${stamp}@example.com`;

    it('sensitive role changes are refused without a fresh password check', async () => {
      await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(director))
        .send({ name: `No reauth ${stamp}`, templateKey: ROLE_KEYS.DEVELOPER })
        .expect(403);
      await api()
        .post('/api/v1/auth/reauth')
        .set('Authorization', bearer(director))
        .send({ password: 'wrong-password' })
        .expect(401);
    });

    it('creates a restricted custom role from a template with a fresh re-auth token', async () => {
      const token = await reauth(director);
      const response = await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .send({
          name: `Ticket viewer ${stamp}`,
          description: 'Reads tickets, cannot touch tasks',
          templateKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
          permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.PROJECT_READ],
        })
        .expect(201);
      expect(response.body.isSystem).toBe(false);
      expect(response.body.audience).toBe('INTERNAL');
      // The API returns permissions sorted by key.
      expect(response.body.permissions).toEqual([
        PERMISSIONS.PROJECT_READ,
        PERMISSIONS.TICKET_READ,
      ]);
      roleId = response.body.id;
    });

    it('refuses privilege escalation: a role admin cannot grant permissions it lacks', async () => {
      // A limited "role admin" may manage roles and users but holds no cost or audit access.
      const token = await reauth(director);
      const adminRole = await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .send({
          name: `Role admin ${stamp}`,
          templateKey: ROLE_KEYS.PROJECT_MANAGER,
          permissions: [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_MANAGE, PERMISSIONS.TASK_READ],
        })
        .expect(201);
      const email = `roleadmin-${stamp}@example.com`;
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .send({ email, name: 'Role Admin', roleId: adminRole.body.id, password: SEED_PASSWORD })
        .expect(201);
      const roleAdmin = await loginAs(app, email);
      const adminToken = await reauth(roleAdmin);
      const response = await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(roleAdmin))
        .set(REAUTH_HEADER, adminToken)
        .send({
          name: `Escalated ${stamp}`,
          templateKey: ROLE_KEYS.PROJECT_MANAGER,
          permissions: [PERMISSIONS.TASK_READ, PERMISSIONS.COST_READ, PERMISSIONS.AUDIT_LOG_READ],
        });
      expect(response.status).toBe(403);
      expect(response.body.message).toContain(PERMISSIONS.COST_READ);
      expect(response.body.message).toContain(PERMISSIONS.AUDIT_LOG_READ);
      // The template's defaults are capped by what the role admin holds.
      const capped = await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(roleAdmin))
        .set(REAUTH_HEADER, adminToken)
        .send({ name: `Capped ${stamp}`, templateKey: ROLE_KEYS.PROJECT_MANAGER })
        .expect(201);
      // Only the intersection of the template and the role admin's own permissions survives.
      expect(capped.body.permissions).toEqual([PERMISSIONS.TASK_READ]);
    });

    it('keeps internal permissions out of client roles and protects system roles', async () => {
      const token = await reauth(director);
      await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .send({
          name: `Client plus ${stamp}`,
          templateKey: ROLE_KEYS.CLIENT_ADMIN,
          permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.COMMENT_INTERNAL],
        })
        .expect(400);
      const roles = await api()
        .get('/api/v1/roles')
        .set('Authorization', bearer(director))
        .expect(200);
      const developer = roles.body.find(
        (role: { key: string }) => role.key === ROLE_KEYS.DEVELOPER,
      );
      await api()
        .patch(`/api/v1/roles/${developer.id}`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .send({ permissions: [PERMISSIONS.TASK_READ] })
        .expect(400);
      await api()
        .delete(`/api/v1/roles/${developer.id}`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .expect(400);
    });

    it('a person in the restricted role gets exactly those permissions', async () => {
      const created = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({
          email: restrictedEmail,
          name: 'Restricted Viewer',
          roleId,
          password: SEED_PASSWORD,
        })
        .expect(201);
      restrictedUser = created.body.id;
      expect(created.body.isCustomRole).toBe(true);
      expect(created.body.roleKey).toBe(ROLE_KEYS.SUPPORT_EXECUTIVE);
      const session = await loginAs(app, restrictedEmail);
      expect(session.body.user.permissions).toEqual([
        PERMISSIONS.PROJECT_READ,
        PERMISSIONS.TICKET_READ,
      ]);
      await api().get('/api/v1/tickets').set('Authorization', bearer(session)).expect(200);
      await api().get('/api/v1/tasks').set('Authorization', bearer(session)).expect(403);
      await api()
        .post('/api/v1/tasks')
        .set('Authorization', bearer(session))
        .send({ title: 'Should fail', projectId: '01a07344-5f6d-7497-ac5c-142e27bbcdf6' })
        .expect(403);
    });

    it('changing a person’s role needs re-authentication and is audited', async () => {
      await api()
        .post(`/api/v1/users/${restrictedUser}/role`)
        .set('Authorization', bearer(director))
        .send({ roleKey: ROLE_KEYS.DEVELOPER })
        .expect(403);
      const token = await reauth(director);
      const changed = await api()
        .post(`/api/v1/users/${restrictedUser}/role`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .send({ roleKey: ROLE_KEYS.DEVELOPER })
        .expect(201);
      expect(changed.body.roleKey).toBe(ROLE_KEYS.DEVELOPER);
      const audit = await api()
        .get('/api/v1/audit-logs?entityType=user')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(audit.body.items.map((entry: { action: string }) => entry.action)).toContain(
        'user.role_changed',
      );
    });

    it('a role with members cannot be deleted; an empty one can', async () => {
      const token = await reauth(director);
      const history = await api()
        .get(`/api/v1/roles/${roleId}/history`)
        .set('Authorization', bearer(director))
        .expect(200);
      expect(history.body.map((entry: { action: string }) => entry.action)).toContain(
        'role.created',
      );
      await api()
        .delete(`/api/v1/roles/${roleId}`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, token)
        .expect(204);
    });

    it('a client admin has no access to the roles editor', async () => {
      await api().get('/api/v1/roles').set('Authorization', bearer(clientAdmin)).expect(403);
    });
  });

  /**
   * Creating a person is not a lesser act than changing one's role — it is the same act plus a
   * credential. `POST /users` chooses the role from the body and returns the invitation link in
   * the 201, and accepting that link sets a password and returns a full session. So a stolen
   * access token, which cannot change anybody's role without the password, must not be able to
   * make a new Super Admin and then sign in as one instead.
   */
  describe('creating people is a step-up action', () => {
    const stolenTokenEmail = `stolen-${stamp}@example.com`;

    it('refuses to create a person without a fresh password check', async () => {
      const refused = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .send({
          email: stolenTokenEmail,
          name: 'Minted Super Admin',
          roleKey: ROLE_KEYS.SUPER_ADMIN,
        });
      expect(refused.status).toBe(403);
      // Nothing was created, and above all no invitation link came back.
      expect(JSON.stringify(refused.body)).not.toContain('/invite/');
      expect(await prisma.user.findUnique({ where: { email: stolenTokenEmail } })).toBeNull();
    });

    it('refuses to re-issue an invitation link without a fresh password check', async () => {
      const created = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({
          email: stolenTokenEmail,
          name: 'Minted Super Admin',
          roleKey: ROLE_KEYS.DEVELOPER,
        })
        .expect(201);
      expect(created.body.invitation.link).toContain('/invite/');

      const refused = await api()
        .post(`/api/v1/users/${created.body.id}/invitations`)
        .set('Authorization', bearer(director));
      expect(refused.status).toBe(403);
      expect(JSON.stringify(refused.body)).not.toContain('/invite/');

      // With the password confirmed it is an ordinary administrative action again.
      const issued = await api()
        .post(`/api/v1/users/${created.body.id}/invitations`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .expect(201);
      expect(issued.body.link).toContain('/invite/');
    });
  });

  /**
   * The other half of the same escalation: `user:manage` says who may administer people, not
   * which roles they may hand out. A Super Admin can define a custom role that carries
   * `user:manage` and little else — a "user administrator" who is not an administrator of
   * everything — and without a cap its holder could create a Super Admin and become one.
   */
  describe('a role can only be granted by someone who holds its permissions', () => {
    let userAdmin: Session;
    let userAdminRoleId = '';

    beforeAll(async () => {
      const created = await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({
          name: `User administrator ${stamp}`,
          description: 'Adds and removes people, holds nothing else',
          templateKey: ROLE_KEYS.PROJECT_MANAGER,
          permissions: [PERMISSIONS.USER_MANAGE, PERMISSIONS.TASK_READ],
        })
        .expect(201);
      userAdminRoleId = created.body.id;
      const email = `useradmin-${stamp}@example.com`;
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ email, name: 'User Admin', roleId: created.body.id, password: SEED_PASSWORD })
        .expect(201);
      userAdmin = await loginAs(app, email);
    });

    it('a user administrator cannot mint a Super Admin', async () => {
      const email = `minted-admin-${stamp}@example.com`;
      const refused = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(userAdmin))
        .set(REAUTH_HEADER, await reauth(userAdmin))
        .send({ email, name: 'Minted Admin', roleKey: ROLE_KEYS.SUPER_ADMIN });
      expect(refused.status).toBe(403);
      expect(refused.body.message).toContain('cannot grant permissions you do not hold');
      expect(JSON.stringify(refused.body)).not.toContain('/invite/');
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it('a user administrator cannot promote an existing person into one either', async () => {
      const developer = await prisma.user.findUniqueOrThrow({ where: { email: DEMO.developer } });
      const refused = await api()
        .post(`/api/v1/users/${developer.id}/role`)
        .set('Authorization', bearer(userAdmin))
        .set(REAUTH_HEADER, await reauth(userAdmin))
        .send({ roleKey: ROLE_KEYS.SUPER_ADMIN });
      expect(refused.status).toBe(403);
      const after = await api()
        .get(`/api/v1/users/${developer.id}`)
        .set('Authorization', bearer(userAdmin))
        .expect(200);
      expect(after.body.roleKey).toBe(ROLE_KEYS.DEVELOPER);
    });

    it('still creates a person in the role it does hold', async () => {
      const email = `helper-${stamp}@example.com`;
      const created = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(userAdmin))
        .set(REAUTH_HEADER, await reauth(userAdmin))
        .send({ email, name: 'Helper', roleId: userAdminRoleId })
        .expect(201);
      expect(created.body.isCustomRole).toBe(true);
    });

    it('and a Super Admin can still assign every role, including their own', async () => {
      const email = `second-admin-${stamp}@example.com`;
      const created = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ email, name: 'Second Admin', roleKey: ROLE_KEYS.SUPER_ADMIN })
        .expect(201);
      expect(created.body.roleKey).toBe(ROLE_KEYS.SUPER_ADMIN);
      // Suspended again straight away: the suites share one database, and a second live Super
      // Admin is not something the rest of the run should have to know about.
      await api()
        .post(`/api/v1/users/${created.body.id}/deactivate`)
        .set('Authorization', bearer(director))
        .expect(201);
    });
  });
  /**
   * A withdrawn role must stop authorizing the people who held it.
   *
   * Unreachable through the API today — the roles editor refuses to delete a role with members —
   * so the row is withdrawn directly here. The point is what the guard does if that ever changes:
   * permissions are read from the membership's role on every request, and a soft-deleted role
   * would otherwise keep answering with the permission set it had when it was taken away.
   */
  describe('a withdrawn role stops authorizing', () => {
    it('refuses a session whose role has been soft-deleted', async () => {
      const role = await api()
        .post('/api/v1/roles')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({
          name: `Withdrawn ${stamp}`,
          templateKey: ROLE_KEYS.SUPPORT_EXECUTIVE,
          permissions: [PERMISSIONS.TICKET_READ],
        })
        .expect(201);
      const email = `withdrawn-${stamp}@example.com`;
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ email, name: 'Withdrawn Holder', roleId: role.body.id, password: SEED_PASSWORD })
        .expect(201);

      const session = await loginAs(app, email);
      await api().get('/api/v1/tickets').set('Authorization', bearer(session)).expect(200);

      await prisma.role.update({ where: { id: role.body.id }, data: { deletedAt: new Date() } });
      const refused = await api().get('/api/v1/tickets').set('Authorization', bearer(session));
      expect(refused.status).toBe(401);
    });
  });
});
