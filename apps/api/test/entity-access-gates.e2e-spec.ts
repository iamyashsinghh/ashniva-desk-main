import type { INestApplication } from '@nestjs/common';
import {
  DEFAULT_ROLE_PERMISSIONS,
  OPERATIONS_SCOPE,
  PERMISSIONS,
  ROLE_KEYS,
  type DashboardResponse,
  type FileSummary,
  type OrganizationOption,
  type OrganizationSummary,
} from '@ashniva/types';
import request from 'supertest';

import {
  bearer,
  createTestApp,
  DEMO,
  loginAs,
  reauthHeaders,
  type Session,
} from './helpers/test-app';

/**
 * Who may reach which entity, checked at the endpoint rather than in the sidebar.
 *
 * Every case here was reproduced against the seeded data before it was fixed: a list that
 * answered every authenticated caller, a gate on a permission every role holds, or a switch on a
 * role name that a custom role can carry without the permissions that go with it.
 */
describe('Entity access gates (e2e)', () => {
  let app: INestApplication;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let tester: Session;
  let support: Session;
  let acmeAdmin: Session;
  let zenithAdmin: Session;
  /** An internal employee inside the provider organization: ticket:read and little else. */
  let providerEmployee: Session;

  const api = () => request(app.getHttpServer());
  const password = 'LongEnoughPassword1';

  interface TicketRow {
    id: string;
    clientOrganization: { id: string; name: string };
  }

  /** One ticket per client organization, so "another client's attachment" has a subject. */
  let acmeTicket: TicketRow;
  let zenithTicket: TicketRow;
  let internalAcmeFileId: string;
  let internalZenithFileId: string;
  let clientAcmeFileId: string;
  let contractFileId: string;

  beforeAll(async () => {
    app = await createTestApp();
    [director, pm, lead, developer, tester, support, acmeAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.lead),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.tester),
      loginAs(app, DEMO.support),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    const tickets = (
      await api()
        .get('/api/v1/tickets?view=all&limit=100')
        .set('Authorization', bearer(director))
        .expect(200)
    ).body.items as TicketRow[];
    const byClient = new Map<string, TicketRow>();
    for (const ticket of tickets) {
      if (!byClient.has(ticket.clientOrganization.id)) {
        byClient.set(ticket.clientOrganization.id, ticket);
      }
    }
    const found = [...byClient.values()];
    acmeTicket = found.find((row) => row.clientOrganization.name.includes('Acme')) as TicketRow;
    zenithTicket = found.find((row) => row.clientOrganization.name.includes('Zenith')) as TicketRow;

    internalAcmeFileId = await upload(director, { ticketId: acmeTicket.id }, 'INTERNAL');
    internalZenithFileId = await upload(director, { ticketId: zenithTicket.id }, 'INTERNAL');
    clientAcmeFileId = await upload(director, { ticketId: acmeTicket.id }, 'CLIENT');

    const contracts = (
      await api().get('/api/v1/contracts').set('Authorization', bearer(director)).expect(200)
    ).body.items as Array<{ id: string }>;
    contractFileId = await upload(director, { contractId: contracts[0]!.id }, 'INTERNAL');

    providerEmployee = await createUser(ROLE_KEYS.INTERNAL_EMPLOYEE);
  });

  afterAll(async () => {
    await app.close();
  });

  async function upload(
    session: Session,
    parent: Record<string, string>,
    visibility: 'INTERNAL' | 'CLIENT',
  ): Promise<string> {
    const post = api().post('/api/v1/files').set('Authorization', bearer(session));
    for (const [field, value] of Object.entries(parent)) {
      void post.field(field, value);
    }
    const response = await post
      .field('visibility', visibility)
      .attach('file', Buffer.from(`attachment ${visibility} ${Date.now()}`), {
        filename: `gate-${visibility.toLowerCase()}-${Date.now()}.txt`,
        contentType: 'text/plain',
      })
      .expect(201);
    return (response.body as FileSummary).id;
  }

  /** A person of the provider organization, created through the real endpoint. */
  async function createUser(
    role: { roleKey: string } | { roleId: string } | string,
  ): Promise<Session> {
    const email = `gates-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const roleField = typeof role === 'string' ? { roleKey: role } : role;
    await api()
      .post('/api/v1/users')
      .set('Authorization', bearer(director))
      .set(await reauthHeaders(app, director))
      .send({ email, name: 'Access Gate Fixture', password, ...roleField })
      .expect(201);
    return loginAs(app, email, password);
  }

  const get = (session: Session, path: string) =>
    api().get(path).set('Authorization', bearer(session));

  /**
   * F1 — `GET /files` had no permission gate, no parent check, no visibility filter and no bound,
   * so a bare call answered with every attachment in the installation. Three INTERNAL files, one
   * per client organization, came back in full to a developer, a tester and to an internal
   * employee whose whole permission set is raising and reading tickets.
   */
  describe('F1 · attachments', () => {
    it('refuses a listing that names no parent, whoever asks', async () => {
      await get(director, '/api/v1/files').expect(400);
      await get(developer, '/api/v1/files').expect(400);
    });

    it('lets a developer read and download the attachments of a ticket they can open', async () => {
      const listed = (await get(developer, `/api/v1/files?ticketId=${acmeTicket.id}`).expect(200))
        .body as FileSummary[];
      expect(listed.map((file) => file.id)).toEqual(
        expect.arrayContaining([internalAcmeFileId, clientAcmeFileId]),
      );
      await get(developer, `/api/v1/files/${internalAcmeFileId}/download`).expect(200);
    });

    it('keeps internal attachments from an internal employee who holds no comment:internal', async () => {
      expect(DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.INTERNAL_EMPLOYEE]).not.toContain(
        PERMISSIONS.COMMENT_INTERNAL,
      );
      const listed = (
        await get(providerEmployee, `/api/v1/files?ticketId=${acmeTicket.id}`).expect(200)
      ).body as FileSummary[];
      expect(listed.map((file) => file.id)).not.toContain(internalAcmeFileId);
      expect(listed.every((file) => file.visibility === 'CLIENT')).toBe(true);

      // The reproduction, in one line: this used to answer 200 with the bytes.
      await get(providerEmployee, `/api/v1/files/${internalAcmeFileId}/download`).expect(404);
      await get(providerEmployee, `/api/v1/files/${internalZenithFileId}/download`).expect(404);
    });

    it('refuses an internal employee a parent they cannot read at all', async () => {
      await get(providerEmployee, `/api/v1/files?projectId=${acmeTicket.id}`).expect(403);
    });

    it('refuses a contract document to internal staff without contract:read, and allows it with', async () => {
      expect(DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.DEVELOPER]).not.toContain(
        PERMISSIONS.CONTRACT_READ,
      );
      await get(developer, `/api/v1/files/${contractFileId}/download`).expect(403);
      await get(pm, `/api/v1/files/${contractFileId}/download`).expect(200);
    });

    it('never lets one client reach another client’s attachment', async () => {
      // Zenith asking about an Acme ticket: no rows, and no download either.
      expect(
        (await get(zenithAdmin, `/api/v1/files?ticketId=${acmeTicket.id}`).expect(200)).body,
      ).toEqual([]);
      await get(zenithAdmin, `/api/v1/files/${clientAcmeFileId}/download`).expect(404);
      await get(zenithAdmin, `/api/v1/files/${internalAcmeFileId}/download`).expect(404);
    });

    it('still gives a client their own client-visible attachment and never the internal one', async () => {
      const listed = (await get(acmeAdmin, `/api/v1/files?ticketId=${acmeTicket.id}`).expect(200))
        .body as FileSummary[];
      const ids = listed.map((file) => file.id);
      expect(ids).toContain(clientAcmeFileId);
      expect(ids).not.toContain(internalAcmeFileId);
      expect(listed.every((file) => file.visibility === 'CLIENT')).toBe(true);
      await get(acmeAdmin, `/api/v1/files/${clientAcmeFileId}/download`).expect(200);
      await get(acmeAdmin, `/api/v1/files/${internalAcmeFileId}/download`).expect(404);
    });
  });

  /**
   * F2 — `GET /organizations` was ungated, so a developer received every client company with its
   * user, project and open-ticket counts. The pickers that legitimately need a company list get a
   * narrower endpoint instead.
   */
  describe('F2 · organizations', () => {
    it('keeps the administrative list to organization:manage', async () => {
      await get(developer, '/api/v1/organizations').expect(403);
      await get(tester, '/api/v1/organizations').expect(403);
      await get(support, '/api/v1/organizations').expect(403);
      const rows = (await get(director, '/api/v1/organizations').expect(200))
        .body as OrganizationSummary[];
      expect(rows.length).toBeGreaterThan(1);
      expect(rows[0]).toHaveProperty('openTicketCount');
    });

    it('serves pickers a list of names with no commercial numbers on it', async () => {
      const rows = (await get(developer, '/api/v1/organizations/options').expect(200))
        .body as OrganizationOption[];
      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(['id', 'isServiceProvider', 'name']);
      }
      // The internal employee raises tickets on behalf of a company, so the picker still answers.
      await get(providerEmployee, '/api/v1/organizations/options').expect(200);
    });

    it('keeps one organization’s counts to organization:manage as well', async () => {
      const own = (await get(director, '/api/v1/organizations').expect(200))
        .body as OrganizationSummary[];
      await get(developer, `/api/v1/organizations/${own[0]!.id}`).expect(403);
      await get(director, `/api/v1/organizations/${own[0]!.id}`).expect(200);
    });
  });

  /** F3 — the SLA catalogue was gated on `ticket:read`, which every role in the product holds. */
  describe('F3 · SLA policies', () => {
    it('refuses every internal role that is not an SLA administrator', async () => {
      await get(developer, '/api/v1/sla/policies').expect(403);
      await get(tester, '/api/v1/sla/policies').expect(403);
      await get(support, '/api/v1/sla/policies').expect(403);
      await get(acmeAdmin, '/api/v1/sla/policies').expect(403);
    });

    it('still serves the people the SLA screen is for', async () => {
      expect((await get(director, '/api/v1/sla/policies').expect(200)).body.length).toBeGreaterThan(
        0,
      );
      await get(pm, '/api/v1/sla/policies').expect(200);
    });
  });

  /** F4 — approvals and milestones were gated on `project:read`, held by every role. */
  describe('F4 · approvals and milestones', () => {
    it('refuses the approvals inbox to roles the sidebar never shows it to', async () => {
      await get(developer, '/api/v1/approvals?view=all').expect(403);
      await get(tester, '/api/v1/approvals?view=all').expect(403);
    });

    it('still serves whoever prepares or decides an approval', async () => {
      const inbox = await get(pm, '/api/v1/approvals?view=all').expect(200);
      expect(inbox.body.total).toBeGreaterThan(0);
      await get(support, '/api/v1/approvals?view=all').expect(200);
      await get(director, '/api/v1/approvals?view=all').expect(200);
    });

    it('refuses the milestone plan to roles that do not manage milestones', async () => {
      await get(developer, '/api/v1/milestones').expect(403);
      await get(tester, '/api/v1/milestones').expect(403);
    });

    it('still serves the milestone plan to whoever may edit it', async () => {
      expect((await get(pm, '/api/v1/milestones').expect(200)).body.length).toBeGreaterThan(0);
      await get(lead, '/api/v1/milestones').expect(200);
    });
  });

  /** F5 — `GET /teams` was ungated: the internal org chart with every member's email. */
  describe('F5 · teams', () => {
    it('refuses the org chart to roles that administer neither people nor projects', async () => {
      await get(developer, '/api/v1/teams').expect(403);
      await get(tester, '/api/v1/teams').expect(403);
      await get(support, '/api/v1/teams').expect(403);
      await get(providerEmployee, '/api/v1/teams').expect(403);
    });

    it('still serves the two screens that need it', async () => {
      // Users & teams (user:manage) and the project form's team picker (project:manage).
      expect((await get(director, '/api/v1/teams').expect(200)).body.length).toBeGreaterThan(0);
      await get(pm, '/api/v1/teams').expect(200);
      await get(lead, '/api/v1/teams').expect(200);
    });
  });

  /**
   * F7 — the dashboard switched on `roleKey`, and a custom role reports the system role it was
   * cloned from for the life of that role while its permissions are edited freely afterwards.
   */
  describe('F7 · dashboards by permission, not by role name', () => {
    it.each([
      ['director', () => director, 'management'],
      ['pm', () => pm, 'management'],
      ['lead', () => lead, 'senior'],
      ['developer', () => developer, 'developer'],
      ['tester', () => tester, 'tester'],
      ['support', () => support, 'support'],
    ] as Array<[string, () => Session, string]>)(
      'lands %s on the same dashboard as before',
      async (_label, session, kind) => {
        const body = (await get(session(), '/api/v1/dashboard').expect(200))
          .body as DashboardResponse;
        expect(body.kind).toBe(kind);
      },
    );

    it('lands an internal employee on the employee dashboard', async () => {
      const body = (await get(providerEmployee, '/api/v1/dashboard').expect(200))
        .body as DashboardResponse;
      expect(body.kind).toBe('employee');
    });

    it('gives a role cloned from Project Manager and then stripped back what it can actually do', async () => {
      const stripped = await createUser({
        roleId: await createRole(ROLE_KEYS.PROJECT_MANAGER, [
          PERMISSIONS.TICKET_READ,
          PERMISSIONS.TICKET_RAISE,
        ]),
      });
      // It still reports roleKey PROJECT_MANAGER, which is what used to decide both of these.
      expect(stripped.body.user.roleKey).toBe(ROLE_KEYS.PROJECT_MANAGER);
      const body = (await get(stripped, '/api/v1/dashboard').expect(200)).body as DashboardResponse;
      expect(body.kind).toBe('employee');
      await get(stripped, '/api/v1/dashboard/operations').expect(403);
      await get(stripped, '/api/v1/milestones').expect(403);
    });

    it('gives a role cloned from Developer but granted a manager’s keys the manager’s board', async () => {
      const promoted = await createUser({
        roleId: await createRole(ROLE_KEYS.DEVELOPER, [
          ...DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.PROJECT_MANAGER],
        ]),
      });
      expect(promoted.body.user.roleKey).toBe(ROLE_KEYS.DEVELOPER);
      const body = (await get(promoted, '/api/v1/dashboard').expect(200)).body as DashboardResponse;
      expect(body.kind).toBe('management');
      const operations = await get(promoted, '/api/v1/dashboard/operations').expect(200);
      expect(operations.body.scope.kind).toBe(OPERATIONS_SCOPE.ORGANIZATION);
    });
  });

  /**
   * Migration `20260918090200` revoked `release:approve` from TESTER on purpose: a QA_LEAD role
   * is what a project names when it wants QA's signature, and granting the key to every tester
   * made that role decorative. Two branches have since put it back by accident.
   */
  it('leaves TESTER with no release:approve, in the defaults and in the database', async () => {
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.TESTER]).not.toContain(PERMISSIONS.RELEASE_APPROVE);
    const roles = (await get(director, '/api/v1/roles').expect(200)).body as Array<{
      key: string;
      permissions: string[];
    }>;
    const testerRole = roles.find((role) => role.key === ROLE_KEYS.TESTER);
    expect(testerRole).toBeDefined();
    expect(testerRole?.permissions).not.toContain(PERMISSIONS.RELEASE_APPROVE);
  });

  async function createRole(templateKey: string, permissions: string[]): Promise<string> {
    const response = await api()
      .post('/api/v1/roles')
      .set('Authorization', bearer(director))
      .set(await reauthHeaders(app, director))
      .send({
        name: `Gate fixture ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        templateKey,
        permissions,
      })
      .expect(201);
    return response.body.id as string;
  }
});
