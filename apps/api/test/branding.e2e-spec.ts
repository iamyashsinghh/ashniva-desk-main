import type { INestApplication } from '@nestjs/common';
import {
  AUDIT_ACTION,
  DEFAULT_BRANDING,
  DEFAULT_THEME_DOCUMENT,
  THEME_DOCUMENT_VERSION,
  type Branding,
} from '@ashniva/types';
import request from 'supertest';

import { PrismaService } from '../src/database/prisma.service';
import { bearer, createTestApp, DEMO, loginAs, type Session } from './helpers/test-app';

/**
 * Branding, end to end: the write path that was promised in Phase 1 and never built, and the
 * boundaries around it.
 *
 * Three things carry the weight here, and they are the three ways theming could hurt somebody:
 *
 *  * **the permission** — changing what every person who signs in sees is `branding:manage` and
 *    nothing weaker, and hiding the screen is not the control;
 *  * **the validation** — these values are written into CSS custom properties, so a value that
 *    is not of its own kind has to be refused at the API rather than filtered in a browser;
 *  * **the tenant boundary** — one organization's branding, one organization's logo file, and no
 *    parameter anywhere that could name somebody else's.
 */
describe('Branding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let director: Session;
  let developer: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;

  let providerOrgId: string;
  let providerSlug: string;
  let clientOrgId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    [director, developer, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    const provider = await prisma.organization.findFirstOrThrow({
      where: { isServiceProvider: true },
    });
    providerOrgId = provider.id;
    providerSlug = provider.slug;
    clientOrgId = clientAdmin.body.user.organization.id;
  });

  afterAll(async () => {
    // Every suite shares one database, so this one puts the theme back the way it found it.
    await prisma.organization.update({
      where: { id: providerOrgId },
      data: { settings: {} },
    });
    await app.close();
  });

  describe('GET /branding — public, and always complete', () => {
    it('serves a whole token document without a token', async () => {
      const response = await api().get('/api/v1/branding').expect(200);
      const branding = response.body as Branding;

      expect(branding.theme.version).toBe(THEME_DOCUMENT_VERSION);
      expect(Object.keys(branding.theme.colors)).toEqual(
        Object.keys(DEFAULT_THEME_DOCUMENT.colors),
      );
      expect(branding.theme.focus.ring).toBe(DEFAULT_THEME_DOCUMENT.focus.ring);
    });

    it('404s for an organization that does not exist', async () => {
      await api().get('/api/v1/branding').query({ organization: 'nope' }).expect(404);
    });

    /**
     * The endpoint the sign-in page calls before anybody has signed in, against a row this build
     * can no longer read.
     *
     * This is not a hypothetical row. `logoUrl` was validated as any URL `new URL()` would parse,
     * so `ftp://` was legal and is sitting in real settings columns; and until the write path
     * existed, editing this column by hand was the only way to set a theme at all. A strict parse
     * here turns every one of those into a 500 on the first request the web app makes, which is a
     * login screen that cannot render — over a logo. The bad value must not be served, and the
     * request must still answer.
     */
    it('serves defaults, not a 500, when the stored row no longer parses', async () => {
      await prisma.organization.update({
        where: { id: providerOrgId },
        data: {
          settings: { branding: { productName: 'Legacy Desk', logoUrl: 'ftp://x/y.png' } },
        },
      });

      try {
        const response = await api()
          .get('/api/v1/branding')
          .query({ organization: providerSlug })
          .expect(200);
        const branding = response.body as Branding;

        expect(branding.logoUrl).toBeNull();
        expect(branding.productName).toBe(DEFAULT_BRANDING.productName);
        expect(branding.theme.colors.brandPrimary).toBe(DEFAULT_THEME_DOCUMENT.colors.brandPrimary);

        // The logo route is public for the same page and must not fail on it either.
        await api().get('/api/v1/branding/logo').query({ organization: providerSlug }).expect(404);
      } finally {
        await prisma.organization.update({
          where: { id: providerOrgId },
          data: { settings: {} },
        });
      }
    });
  });

  /**
   * The other half of that split. The administration screen is the one place whose subject *is*
   * that row and whose reader can repair it, so there the failure stays loud: showing an
   * unreadable row as "no overrides" would look like a working screen and make the next save a
   * silent reset of everything it held.
   */
  describe('GET /admin/branding — the screen that owns the row still fails loudly', () => {
    it('refuses to render a row it cannot read', async () => {
      await prisma.organization.update({
        where: { id: providerOrgId },
        data: {
          settings: { branding: { productName: 'Legacy Desk', logoUrl: 'ftp://x/y.png' } },
        },
      });

      try {
        await api()
          .get('/api/v1/admin/branding')
          .set('Authorization', bearer(director))
          .expect(500);
      } finally {
        await prisma.organization.update({
          where: { id: providerOrgId },
          data: { settings: {} },
        });
      }
    });
  });

  describe('PATCH /admin/branding — who may, and what is recorded', () => {
    it('refuses a signed-in user without branding:manage', async () => {
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(developer))
        .send({ productName: 'Developer Desk' })
        .expect(403);
    });

    it('refuses an anonymous caller', async () => {
      await api().patch('/api/v1/admin/branding').send({ productName: 'Anon Desk' }).expect(401);
    });

    it('refuses a client administrator', async () => {
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(clientAdmin))
        .send({ productName: 'Client Desk' })
        .expect(403);
    });

    it('applies a change, serves it publicly, and audits it', async () => {
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({
          productName: 'Ashniva Desk (audited)',
          theme: { version: THEME_DOCUMENT_VERSION, colors: { brandPrimary: '#112233' } },
        })
        .expect(200);

      const branding = await api()
        .get('/api/v1/branding')
        .query({ organization: providerSlug })
        .expect(200);
      expect(branding.body.productName).toBe('Ashniva Desk (audited)');
      expect(branding.body.colors.primary).toBe('#112233');
      // The summary and the document must never disagree; one is projected from the other.
      expect(branding.body.theme.colors.brandPrimary).toBe('#112233');
      // Everything the change did not mention is still the built-in default.
      expect(branding.body.theme.radius.md).toBe(DEFAULT_THEME_DOCUMENT.radius.md);

      const entry = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTION.BRANDING_UPDATED, organizationId: providerOrgId },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry).not.toBeNull();
      expect(entry?.actorUserId).toBe(director.body.user.id);
    });

    it('leaves other tenants alone', async () => {
      const zenith = await prisma.organization.findFirstOrThrow({
        where: { id: zenithAdmin.body.user.organization.id },
      });
      const before = await api()
        .get('/api/v1/branding')
        .query({ organization: zenith.slug })
        .expect(200);

      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({ productName: 'Only ours' })
        .expect(200);

      const after = await api()
        .get('/api/v1/branding')
        .query({ organization: zenith.slug })
        .expect(200);
      expect(after.body.productName).toBe(before.body.productName);
      expect(after.body.productName).not.toBe('Only ours');
    });
  });

  /**
   * Each refusal on its own. "The document was rejected" is a weaker claim than "this field was
   * rejected", and a validator that refused everything would satisfy a single combined assertion.
   */
  describe('PATCH /admin/branding — validation is the security boundary', () => {
    const cases: { name: string; body: unknown }[] = [
      { name: 'a colour that is not #rrggbb', body: { theme: v({ colors: { text: 'red' } }) } },
      {
        name: 'a colour that closes the CSS declaration',
        body: { theme: v({ colors: { surface: '#fff; } html { display: none' } }) },
      },
      { name: 'a length with no unit', body: { theme: v({ radius: { md: '6' } }) } },
      { name: 'a length in an unsupported unit', body: { theme: v({ radius: { md: '6vw' } }) } },
      { name: 'a calc() expression', body: { theme: v({ spacing: { space4: 'calc(1px)' } }) } },
      {
        name: 'a font stack that fetches a font',
        body: { theme: v({ typography: { fontSans: 'url(https://evil.test/f.woff)' } }) },
      },
      {
        name: 'an over-long string',
        body: { theme: v({ typography: { fontSans: `${'Aaaaaaaaaa, '.repeat(20)}serif` } }) },
      },
      { name: 'an unknown document version', body: { theme: { version: 2 } } },
      { name: 'a document with no version', body: { theme: { colors: { text: '#000000' } } } },
      { name: 'an unknown token', body: { theme: v({ radius: { enormous: '99px' } }) } },
      { name: 'an unknown family', body: { theme: v({ motion: { fast: '1ms' } }) } },
      { name: 'a javascript: logo URL', body: { logoUrl: 'javascript:alert(1)' } },
      /**
       * The logo is an `<img src>` on the sign-in page. Plain HTTP there is mixed content a
       * browser blocks on an HTTPS deployment, and a picture anything on the path can swap on the
       * one page whose job is to look like the customer's own product.
       */
      {
        name: 'an http logo URL on a public host',
        body: { logoUrl: 'http://cdn.acme.test/l.png' },
      },
      { name: 'an ftp logo URL', body: { logoUrl: 'ftp://cdn.acme.test/l.png' } },
      { name: 'a logo file id that is not a uuid', body: { logoFileId: 'not-a-uuid' } },
      { name: 'an unknown top-level field', body: { colors: { primary: '#112233' } } },
      { name: 'a product name that is too long', body: { productName: 'x'.repeat(61) } },
    ];

    it.each(cases)('refuses $name', async ({ body }) => {
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send(body as object)
        .expect(400);
    });

    it('accepts an https logo, and http on loopback where there is nothing in between', async () => {
      for (const logoUrl of ['https://cdn.acme.test/l.png', 'http://localhost:5173/l.png']) {
        await api()
          .patch('/api/v1/admin/branding')
          .set('Authorization', bearer(director))
          .send({ logoUrl })
          .expect(200);
      }
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({ logoUrl: null })
        .expect(200);
    });

    it('accepts every value kind when each is of its own kind', async () => {
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({
          theme: v({
            colors: { brandPrimary: '#3b5fa0' },
            radius: { md: '2px' },
            spacing: { space4: '1rem' },
            typography: { fontSans: "'IBM Plex Sans', Arial, sans-serif", lineHeight: 1.6 },
            shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)' },
            focus: { ring: '0 0 0 3px rgba(59, 95, 160, 0.35)' },
          }),
        })
        .expect(200);
    });
  });

  describe('Logos go through the one upload path there is', () => {
    it('accepts a file uploaded through POST /files and serves it publicly', async () => {
      const upload = await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(director))
        .attach('file', PNG_BYTES, { filename: 'logo.png', contentType: 'image/png' })
        .expect(201);

      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({ logoFileId: upload.body.id })
        .expect(200);

      const branding = await api()
        .get('/api/v1/branding')
        .query({ organization: providerSlug })
        .expect(200);
      expect(branding.body.logoFileId).toBe(upload.body.id);

      // No bearer token: this is what the sign-in page does.
      const logo = await api()
        .get('/api/v1/branding/logo')
        .query({ organization: providerSlug })
        .expect(200);
      expect(logo.headers['content-type']).toContain('image/png');
    });

    it('refuses a file that belongs to another organization', async () => {
      const file = await prisma.file.create({
        data: {
          organizationId: clientOrgId,
          uploadedById: clientAdmin.body.user.id,
          name: 'theirs.png',
          contentType: 'image/png',
          sizeBytes: PNG_BYTES.length,
          storageKey: `${clientOrgId}/theirs.png`,
          visibility: 'CLIENT',
        },
      });

      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({ logoFileId: file.id })
        .expect(404);

      await prisma.file.delete({ where: { id: file.id } });
    });

    it('refuses a file that is not an image', async () => {
      const upload = await api()
        .post('/api/v1/files')
        .set('Authorization', bearer(director))
        .attach('file', Buffer.from('not a logo'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({ logoFileId: upload.body.id })
        .expect(400);
    });

    it('404s for an organization with no uploaded logo', async () => {
      const zenith = await prisma.organization.findFirstOrThrow({
        where: { id: zenithAdmin.body.user.organization.id },
      });
      await api().get('/api/v1/branding/logo').query({ organization: zenith.slug }).expect(404);
    });
  });

  /**
   * A theme must never be able to affect a security decision.
   *
   * It is the sort of thing that sounds obviously true and stops being true the moment somebody
   * lets a theme document carry a flag "for convenience". Setting a deliberately hostile theme
   * and then checking that authentication, permissions and tenancy are untouched is cheap, and it
   * is the assertion that would fail if that ever happened.
   */
  describe('A theme changes appearance and nothing else', () => {
    it('leaves login, permissions and tenant scope exactly as they were', async () => {
      const before = await api()
        .get('/api/v1/auth/me')
        .set('Authorization', bearer(developer))
        .expect(200);

      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(director))
        .send({
          productName: 'Hostile',
          theme: v({ colors: { brandPrimary: '#000000', textOnBrand: '#000000' } }),
        })
        .expect(200);

      // Signing in still works, and works for somebody who has never seen the branding screen.
      const freshLogin = await loginAs(app, DEMO.developer);
      const after = await api()
        .get('/api/v1/auth/me')
        .set('Authorization', bearer(freshLogin))
        .expect(200);

      expect(after.body.permissions).toEqual(before.body.permissions);
      expect(after.body.roleKey).toBe(before.body.roleKey);
      expect(after.body.organization.id).toBe(before.body.organization.id);

      // And the change still cannot reach anything the developer may not do.
      await api()
        .patch('/api/v1/admin/branding')
        .set('Authorization', bearer(freshLogin))
        .send({ productName: 'Still not allowed' })
        .expect(403);
    });
  });

  describe('GET /admin/branding/theme-source', () => {
    it('reports the local source as healthy with nothing outstanding', async () => {
      const response = await api()
        .get('/api/v1/admin/branding/theme-source')
        .set('Authorization', bearer(director))
        .expect(200);

      expect(response.body.source).toBe('local');
      expect(response.body.healthy).toBe(true);
      expect(response.body.missing).toEqual([]);
    });

    it('needs branding:manage like everything else here', async () => {
      await api()
        .get('/api/v1/admin/branding/theme-source')
        .set('Authorization', bearer(developer))
        .expect(403);
    });
  });
});

/** A partial theme document at the version this build understands. */
function v(document: Record<string, unknown>): Record<string, unknown> {
  return { version: THEME_DOCUMENT_VERSION, ...document };
}

/** The smallest valid PNG: one transparent pixel. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
