import type { INestApplication } from '@nestjs/common';
import {
  SEARCH_MAX_GROUP_LIMIT,
  SEARCH_MIN_QUERY_LENGTH,
  type SearchEntityType,
  type SearchResponse,
} from '@ashniva/types';
import request from 'supertest';

import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Global search is an existence oracle: a hit leaks that a row exists, what it is called and
 * usually whose it is. So the tests here are about who is answered, not about relevance.
 *
 * The load-bearing one is `search ⊆ list`, run per module for six different people. For every
 * entity type the endpoint can return, it asks that module's own list endpoint the same question
 * with the same term and the same session, and requires that every hit search returned is in the
 * answer — and that when the list endpoint says 403, search returns no group of that type at all.
 */
describe('Global search (e2e)', () => {
  let app: INestApplication;
  let director: Session;
  let pm: Session;
  let lead: Session;
  let developer: Session;
  let tester: Session;
  let support: Session;
  let acmeAdmin: Session;
  let zenithAdmin: Session;

  const api = () => request(app.getHttpServer());

  /** Where each entity type's own list endpoint lives, asked the same question search asks it. */
  const LIST_ROUTE: Record<SearchEntityType, (term: string) => string> = {
    task: (q) => `/api/v1/tasks?view=all&limit=100&search=${q}`,
    ticket: (q) => `/api/v1/tickets?view=all&limit=100&search=${q}`,
    project: (q) => `/api/v1/projects?search=${q}`,
    contract: (q) => `/api/v1/contracts?view=all&limit=100&search=${q}`,
    invoice: (q) => `/api/v1/invoices?limit=100&search=${q}`,
    'change-request': (q) => `/api/v1/change-requests?limit=100&search=${q}`,
    problem: (q) => `/api/v1/problems?limit=100&search=${q}`,
    incident: (q) => `/api/v1/incidents?limit=100&search=${q}`,
    approval: (q) => `/api/v1/approvals?view=all&limit=100&search=${q}`,
    release: (q) => `/api/v1/releases?limit=100&search=${q}`,
    user: (q) => `/api/v1/users?search=${q}`,
  };

  /** Every entity type in LIST_ROUTE, checked against the response so neither list can rot. */
  const ENTITY_TYPES = Object.keys(LIST_ROUTE) as SearchEntityType[];

  async function search(session: Session, term: string, limit = 20): Promise<SearchResponse> {
    const response = await api()
      .get(`/api/v1/search?q=${encodeURIComponent(term)}&limit=${limit}`)
      .set('Authorization', bearer(session))
      .expect(200);
    return response.body as SearchResponse;
  }

  function hitIds(body: SearchResponse, type: SearchEntityType): string[] {
    return body.groups.find((group) => group.type === type)?.hits.map((hit) => hit.id) ?? [];
  }

  /** List responses come in two shapes: a paginated envelope, or a plain array. */
  function listIds(body: unknown): string[] {
    const rows = Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? []);
    return rows.map((row) => (row as { id: string }).id);
  }

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a bearer token', async () => {
    await api().get('/api/v1/search?q=acme').expect(401);
  });

  describe('shape and bounds', () => {
    it('refuses a term shorter than the trigram floor', async () => {
      expect(SEARCH_MIN_QUERY_LENGTH).toBe(3);
      await api().get('/api/v1/search?q=ac').set('Authorization', bearer(director)).expect(400);
    });

    it('refuses a missing term rather than answering with everything', async () => {
      await api().get('/api/v1/search').set('Authorization', bearer(director)).expect(400);
    });

    it('refuses a per-module limit above the cap', async () => {
      await api()
        .get(`/api/v1/search?q=acme&limit=${SEARCH_MAX_GROUP_LIMIT + 1}`)
        .set('Authorization', bearer(director))
        .expect(400);
    });

    it('returns no groups at all when nothing matches', async () => {
      const body = await search(director, 'zzqqxxnothingmatchesthis');
      expect(body.groups).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.truncated).toBe(false);
    });

    it('never returns more rows per module than the limit asked for', async () => {
      const body = await search(director, 'the', 2);
      for (const group of body.groups) {
        expect(group.hits.length).toBeLessThanOrEqual(2);
      }
      expect(body.total).toBe(body.groups.reduce((sum, group) => sum + group.hits.length, 0));
    });

    it('only ever returns types it has a group definition for', async () => {
      const body = await search(director, 'acme');
      for (const group of body.groups) {
        expect(ENTITY_TYPES).toContain(group.type);
      }
    });

    it('carries only the fields a hit is allowed to carry', async () => {
      const body = await search(director, 'barcode');
      const hit = body.groups.flatMap((group) => group.hits)[0];
      expect(hit).toBeDefined();
      expect(Object.keys(hit!).sort()).toEqual([
        'href',
        'id',
        'reference',
        'status',
        'subtitle',
        'title',
        'type',
      ]);
    });
  });

  describe('search never exceeds the list endpoint', () => {
    const roles: Array<[string, () => Session]> = [
      ['a super admin', () => director],
      ['a project manager', () => pm],
      ['a team lead', () => lead],
      ['a developer', () => developer],
      ['a tester', () => tester],
      ['a support executive', () => support],
    ];

    // Three terms, chosen to reach several modules each: a client name that also names projects,
    // contracts and invoices; a second client's name, so the cross-client half is exercised for
    // every role too; and a ticket title.
    //
    // Three rather than a dozen because `/search` is throttled per client IP and every request in
    // this run comes from 127.0.0.1 — six roles times three terms is eighteen of the sixty a
    // minute the route allows, which leaves room for the rest of the suite.
    const terms = ['acme', 'zenith', 'barcode'];

    it.each(roles)(
      'holds for %s, in every module and for every term',
      async (_label, session) => {
        // A subset assertion passes for free against an empty set, so count what was compared and
        // require that the run actually had something to compare.
        let compared = 0;
        for (const term of terms) {
          const body = await search(session(), term, SEARCH_MAX_GROUP_LIMIT);
          for (const type of ENTITY_TYPES) {
            const found = hitIds(body, type);
            const list = await api()
              .get(LIST_ROUTE[type](term))
              .set('Authorization', bearer(session()));

            if (list.status === 403) {
              // The module refuses this person; search must not have answered for it at all.
              expect(found).toEqual([]);
              continue;
            }
            expect(list.status).toBe(200);
            const allowed = new Set(listIds(list.body));
            for (const id of found) {
              expect(allowed.has(id)).toBe(true);
              compared += 1;
            }
          }
        }
        expect(compared).toBeGreaterThan(0);
      },
      60_000,
    );
  });

  describe('client isolation', () => {
    it('answers a client with their own tickets only', async () => {
      const body = await search(acmeAdmin, 'barcode');
      expect(body.groups.map((group) => group.type)).toEqual(['ticket']);
      const hit = body.groups[0]?.hits[0];
      expect(hit?.title).toContain('Barcode');
      expect(hit?.href).toMatch(/^\/portal\/tickets\//);
    });

    it('does not match another client’s ticket', async () => {
      // "Vehicle markers flicker on the live map" belongs to Zenith.
      const acme = await search(acmeAdmin, 'vehicle');
      expect(acme.groups).toEqual([]);
      expect(acme.total).toBe(0);

      // …and the reverse: Acme's barcode ticket is invisible to Zenith.
      const zenith = await search(zenithAdmin, 'barcode');
      expect(zenith.groups).toEqual([]);
    });

    it('does not let a client enumerate other clients through the ticket that names them', async () => {
      const body = await search(acmeAdmin, 'zenith');
      for (const group of body.groups) {
        for (const hit of group.hits) {
          expect(`${hit.title} ${hit.subtitle ?? ''}`.toLowerCase()).not.toContain('zenith');
        }
      }
    });

    /**
     * Contract and invoice search match on the *client organization's name*, which makes them an
     * enumeration route if they are ever reachable by a client: one letter at a time answers "who
     * else is a customer here". They are internal-only sources, and this is the test that says so.
     */
    it('never returns a contract or an invoice to a client', async () => {
      for (const term of ['zenith', 'CT-2026']) {
        for (const client of [acmeAdmin, zenithAdmin]) {
          const body = await search(client, term);
          const types = body.groups.map((group) => group.type);
          expect(types).not.toContain('contract');
          expect(types).not.toContain('invoice');
          expect(types).not.toContain('task');
          expect(types).not.toContain('project');
          expect(types).not.toContain('problem');
          expect(types).not.toContain('incident');
          expect(types).not.toContain('user');
        }
      }
    }, 30_000);

    it('shows a client the client-visible ticket status, not the internal one', async () => {
      const body = await search(acmeAdmin, 'barcode');
      const portalList = (
        await api()
          .get('/api/v1/portal/tickets?view=all&limit=100&search=barcode')
          .set('Authorization', bearer(acmeAdmin))
          .expect(200)
      ).body as { items: Array<{ id: string; status: string }> };
      const expected = new Map(portalList.items.map((row) => [row.id, row.status]));
      for (const hit of body.groups[0]?.hits ?? []) {
        expect(expected.get(hit.id)).toBe(hit.status);
      }
    });
  });

  describe('per-module gates', () => {
    it('gives a developer no contracts, invoices or people', async () => {
      const body = await search(developer, 'acme');
      const types = body.groups.map((group) => group.type);
      expect(types).not.toContain('contract');
      expect(types).not.toContain('invoice');
      expect(types).not.toContain('user');
      // …but the modules a developer does work in are there.
      expect(types).toContain('task');
    });

    it('gives a super admin more entity types than a tester', async () => {
      const admin = await search(director, 'acme');
      const limited = await search(tester, 'acme');
      const adminTypes = new Set(admin.groups.map((group) => group.type));
      for (const group of limited.groups) {
        expect(adminTypes.has(group.type)).toBe(true);
      }
      expect(adminTypes.size).toBeGreaterThan(limited.groups.length);
    });
  });
});
