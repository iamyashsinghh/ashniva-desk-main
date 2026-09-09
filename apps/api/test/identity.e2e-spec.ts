import type { INestApplication } from '@nestjs/common';
import { ROLE_KEYS } from '@ashniva/types';
import request from 'supertest';

import {
  DEMO,
  SEED_PASSWORD,
  bearer,
  createTestApp,
  loginAs,
  reauthHeaders,
  type Session,
} from './helpers/test-app';

/** Users, organizations, teams and roles: permissions and tenant boundaries. */
describe('Identity administration (e2e)', () => {
  let app: INestApplication;
  let director: Session;
  let developer: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let acmeId: string;
  let zenithId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    director = await loginAs(app, DEMO.director);
    developer = await loginAs(app, DEMO.developer);
    clientAdmin = await loginAs(app, DEMO.clientAdmin);
    zenithAdmin = await loginAs(app, DEMO.zenithAdmin);
    acmeId = clientAdmin.body.user.organization.id;
    zenithId = zenithAdmin.body.user.organization.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('organizations', () => {
    /**
     * Rewritten, not deleted. This used to assert that any authenticated caller reached
     * `GET /organizations` — internal staff got every company with its user, project and open
     * ticket counts, a client got their own row. Those counts are one client's commercial
     * figures, so the administrative list is now behind `organization:manage` and everything
     * that only wanted a name asks `/organizations/options` instead. Both halves are still
     * asserted; the second half is now the picker.
     */
    it('gives an administrator every company with its counts', async () => {
      const all = await api()
        .get('/api/v1/organizations')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(all.body.length).toBeGreaterThanOrEqual(4);
      expect(all.body[0].isServiceProvider).toBe(true);
      expect(
        all.body.find((o: { slug: string }) => o.slug === 'acme-retail').userCount,
      ).toBeGreaterThan(0);
    });

    it('refuses the counts to anybody who does not administer companies', async () => {
      await api().get('/api/v1/organizations').set('Authorization', bearer(developer)).expect(403);
      await api()
        .get('/api/v1/organizations')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });

    it('gives a client picker names only, and a client only their own company', async () => {
      const own = await api()
        .get('/api/v1/organizations/options')
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(own.body).toHaveLength(1);
      expect(own.body[0].id).toBe(acmeId);
      expect(own.body[0]).not.toHaveProperty('userCount');

      const staff = await api()
        .get('/api/v1/organizations/options')
        .set('Authorization', bearer(developer))
        .expect(200);
      expect(staff.body.length).toBeGreaterThanOrEqual(4);
      for (const row of staff.body as Array<Record<string, unknown>>) {
        expect(Object.keys(row).sort()).toEqual(['id', 'isServiceProvider', 'name']);
      }
    });

    it('a client cannot read another client organization (404, not 403)', async () => {
      await api()
        .get(`/api/v1/organizations/${zenithId}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);
      // Their own company is still theirs to read, which is why this route keeps the 404 rule
      // instead of a decorator that would answer 403 for every id including this one.
      await api()
        .get(`/api/v1/organizations/${acmeId}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      await api()
        .get(`/api/v1/organizations/${zenithId}`)
        .set('Authorization', bearer(director))
        .expect(200);
    });

    it('keeps one company’s figures from internal staff who do not administer companies', async () => {
      await api()
        .get(`/api/v1/organizations/${zenithId}`)
        .set('Authorization', bearer(developer))
        .expect(403);
    });

    it('only the service provider creates organizations', async () => {
      await api()
        .post('/api/v1/organizations')
        .set('Authorization', bearer(clientAdmin))
        .send({ name: 'Rogue Co', type: 'CONTRACT_CLIENT' })
        .expect(403);

      const name = `E2E Client ${Date.now()}`;
      const created = await api()
        .post('/api/v1/organizations')
        .set('Authorization', bearer(director))
        .send({ name, type: 'CONTRACT_CLIENT' })
        .expect(201);
      expect(created.body.slug).toMatch(/^e2e-client-\d+$/);

      await api()
        .post('/api/v1/organizations')
        .set('Authorization', bearer(director))
        .send({ name, type: 'CONTRACT_CLIENT' })
        .expect(409);
    });
  });

  describe('users', () => {
    it('requires the user:manage permission', async () => {
      await api().get('/api/v1/users').set('Authorization', bearer(developer)).expect(403);
    });

    it('lists people of the caller organization by default', async () => {
      const internal = await api()
        .get('/api/v1/users')
        .set('Authorization', bearer(director))
        .expect(200);
      const emails = internal.body.map((u: { email: string }) => u.email);
      expect(emails).toContain(DEMO.developer);
      expect(emails).not.toContain(DEMO.clientAdmin);

      const acme = await api()
        .get('/api/v1/users')
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      const acmeEmails = acme.body.map((u: { email: string }) => u.email);
      expect(acmeEmails).toEqual(expect.arrayContaining([DEMO.clientAdmin, DEMO.clientEmployee]));
      expect(acmeEmails).not.toContain(DEMO.developer);
      expect(
        acme.body.every((u: { organization: { id: string } }) => u.organization.id === acmeId),
      ).toBe(true);
    });

    it('a client admin cannot list or create people in another organization', async () => {
      await api()
        .get(`/api/v1/users?organizationId=${zenithId}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(clientAdmin))
        .set(await reauthHeaders(app, clientAdmin))
        .send({
          email: `intruder-${Date.now()}@example.com`,
          name: 'Intruder',
          password: 'LongEnoughPassword1',
          roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
          organizationId: zenithId,
        })
        .expect(403);
    });

    it('a client admin can only assign client roles', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(clientAdmin))
        .set(await reauthHeaders(app, clientAdmin))
        .send({
          email: `dev-${Date.now()}@example.com`,
          name: 'Not A Dev',
          password: 'LongEnoughPassword1',
          roleKey: ROLE_KEYS.DEVELOPER,
        })
        .expect(400);
    });

    it('internal roles cannot be placed in a client organization', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(await reauthHeaders(app, director))
        .send({
          email: `dev-${Date.now()}@example.com`,
          name: 'Misplaced Dev',
          password: 'LongEnoughPassword1',
          roleKey: ROLE_KEYS.DEVELOPER,
          organizationId: acmeId,
        })
        .expect(400);
    });

    it('creates, edits and deactivates a client employee', async () => {
      const email = `store-${Date.now()}@example.com`;
      const created = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(clientAdmin))
        .set(await reauthHeaders(app, clientAdmin))
        .send({
          email,
          name: 'New Store Manager',
          password: 'LongEnoughPassword1',
          roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
          title: 'Store 9',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        email,
        roleKey: ROLE_KEYS.CLIENT_EMPLOYEE,
        status: 'ACTIVE',
        title: 'Store 9',
      });

      await loginAs(app, email, 'LongEnoughPassword1');

      const updated = await api()
        .patch(`/api/v1/users/${created.body.id}`)
        .set('Authorization', bearer(clientAdmin))
        .send({ title: 'Store 10' })
        .expect(200);
      expect(updated.body).toMatchObject({ title: 'Store 10' });

      // Role changes are a separate, re-authenticated call.
      const reauth = await api()
        .post('/api/v1/auth/reauth')
        .set('Authorization', bearer(clientAdmin))
        .send({ password: SEED_PASSWORD })
        .expect(200);
      const promoted = await api()
        .post(`/api/v1/users/${created.body.id}/role`)
        .set('Authorization', bearer(clientAdmin))
        .set('x-reauth-token', reauth.body.reauthToken)
        .send({ roleKey: ROLE_KEYS.CLIENT_ADMIN })
        .expect(201);
      expect(promoted.body).toMatchObject({ title: 'Store 10', roleKey: ROLE_KEYS.CLIENT_ADMIN });

      // Zenith's admin cannot even see this Acme person.
      await api()
        .get(`/api/v1/users/${created.body.id}`)
        .set('Authorization', bearer(zenithAdmin))
        .expect(404);

      const deactivated = await api()
        .post(`/api/v1/users/${created.body.id}/deactivate`)
        .set('Authorization', bearer(clientAdmin))
        .expect(201);
      expect(deactivated.body.status).toBe('SUSPENDED');
      await api()
        .post('/api/v1/auth/login')
        .send({ email, password: 'LongEnoughPassword1' })
        .expect(401);
    });

    it('a duplicate membership is a conflict; a new person without a password is invited', async () => {
      await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(await reauthHeaders(app, director))
        .send({ email: DEMO.developer, name: 'Priya', roleKey: ROLE_KEYS.DEVELOPER })
        .expect(409);
      const invited = await api()
        .post('/api/v1/users')
        .set('Authorization', bearer(director))
        .set(await reauthHeaders(app, director))
        .send({
          email: `nopass-${Date.now()}@example.com`,
          name: 'No Password',
          roleKey: ROLE_KEYS.DEVELOPER,
        })
        .expect(201);
      expect(invited.body.status).toBe('INVITED');
      expect(invited.body.invitation.link).toContain('/invite/');
    });
  });

  describe('teams and roles', () => {
    /**
     * Read as the director rather than as a developer. `GET /teams` used to answer every
     * authenticated caller with the whole internal org chart, every member's email included;
     * it now asks for `user:manage` or `project:manage`, which are the two screens that need it.
     * The assertion about the payload is unchanged.
     */
    it('lists teams with lead and members', async () => {
      const response = await api()
        .get('/api/v1/teams')
        .set('Authorization', bearer(director))
        .expect(200);
      const web = response.body.find((team: { name: string }) => team.name === 'Web Team');
      expect(web.lead.email).toBe(DEMO.lead);
      expect(web.members.map((m: { email: string }) => m.email)).toContain(DEMO.developer);
    });

    it('refuses the org chart to a developer, who administers neither people nor projects', async () => {
      await api().get('/api/v1/teams').set('Authorization', bearer(developer)).expect(403);
    });

    it('creates a team and replaces its members', async () => {
      const name = `E2E Team ${Date.now()}`;
      const created = await api()
        .post('/api/v1/teams')
        .set('Authorization', bearer(director))
        .send({ name, leadUserId: director.body.user.id, memberIds: [developer.body.user.id] })
        .expect(201);
      expect(created.body.members.map((m: { email: string }) => m.email).sort()).toEqual(
        [DEMO.director, DEMO.developer].sort(),
      );
      // Members from another organization are silently ignored: teams never cross tenants.
      const replaced = await api()
        .put(`/api/v1/teams/${created.body.id}/members`)
        .set('Authorization', bearer(director))
        .send({ userIds: [developer.body.user.id, clientAdmin.body.user.id] })
        .expect(200);
      expect(replaced.body.members.map((m: { email: string }) => m.email)).toEqual([
        DEMO.developer,
      ]);
      await api()
        .get(`/api/v1/teams/${created.body.id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);
    });

    it('exposes the role matrix to role managers only', async () => {
      await api().get('/api/v1/roles').set('Authorization', bearer(developer)).expect(403);
      const response = await api()
        .get('/api/v1/roles')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(response.body.filter((role: { isSystem: boolean }) => role.isSystem)).toHaveLength(9);
      const clientEmployee = response.body.find(
        (role: { key: string }) => role.key === ROLE_KEYS.CLIENT_EMPLOYEE,
      );
      expect(clientEmployee.permissions).not.toContain('comment:internal');
    });
  });
});
