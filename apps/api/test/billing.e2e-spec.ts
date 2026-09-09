import type { INestApplication } from '@nestjs/common';
import { REAUTH_HEADER } from '@ashniva/types';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';

import { TenantContextService } from '../src/common/tenant/tenant-context.service';
import { PrismaService } from '../src/database/prisma.service';
import {
  bearer,
  createTestApp,
  DEMO,
  loginAs,
  SEED_PASSWORD,
  type Session,
} from './helpers/test-app';

/**
 * Billing end to end.
 *
 * The parts worth proving against a real database rather than a unit test: the invoice sequence
 * under concurrency, that money moves atomically, that an issued invoice is frozen, and that a
 * client sees their own invoices and nothing else.
 */
describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let director: Session;
  let pm: Session;
  let developer: Session;
  let clientAdmin: Session;
  let zenithAdmin: Session;
  let providerOrgId: string;
  let clientOrgId: string;
  let zenithOrgId: string;
  const createdInvoices: string[] = [];
  const createdPayments: string[] = [];

  const api = () => request(app.getHttpServer());

  /** Storage-key prefix for the throwaway file rows, so a stray one is recognisable and removable. */
  const PROFILE_TEST_FILE_PREFIX = 'test/billing-profile/';

  /** Named so the "no policy changed" test reads the SQL that actually shipped. */
  const CLIENT_BILLING_MIGRATION = '20260922090200_client_billing_profiles';

  /**
   * A fresh re-authentication token.
   *
   * The billing profile carries the bank account clients pay into, and voiding an invoice and
   * recording a payment both move money — all three now ask for the password again (issues #12
   * and #15), so the tests carry the header the UI would.
   */
  const reauthTokens = new Map<string, Promise<string>>();
  const reauth = (session: Session): Promise<string> => {
    // One token per person for the whole run, not one per request: the endpoint is rate limited
    // (deliberately — it takes a password), and a token is good for the re-auth TTL.
    const cached = reauthTokens.get(session.accessToken);
    if (cached) {
      return cached;
    }
    const token = api()
      .post('/api/v1/auth/reauth')
      .set('Authorization', bearer(session))
      .send({ password: SEED_PASSWORD })
      .expect(200)
      .then((response) => response.body.reauthToken as string);
    reauthTokens.set(session.accessToken, token);
    return token;
  };

  /** PUTs the billing profile with a re-auth token, which that route now requires. */
  const saveProfile = async (session: Session, body: Record<string, unknown>, status = 200) =>
    api()
      .put('/api/v1/settings/billing')
      .set('Authorization', bearer(session))
      .set(REAUTH_HEADER, await reauth(session))
      .send(body)
      .expect(status);

  const profile = {
    legalName: 'Ashniva Technologies Private Limited',
    addressLine1: '4th Floor, Tech Park',
    city: 'Bengaluru',
    state: 'Karnataka',
    stateCode: '29',
    postalCode: '560001',
    gstin: '29AABCU9603R1ZM',
    pan: 'AABCU9603R',
    email: 'billing@ashniva.example',
    bankDetails: 'HDFC Bank · A/C 50200012345678 · IFSC HDFC0001234',
    terms: 'Payment due within 30 days.',
  };

  const line = (over: Record<string, unknown> = {}) => ({
    description: 'Managed support — September',
    hsnSac: '998314',
    quantity: '1.000',
    unitPrice: '100000.00',
    taxRate: '18.00',
    ...over,
  });

  /** Creates a draft against the given client. Intra-state unless told otherwise. */
  async function draft(over: Record<string, unknown> = {}, session = pm): Promise<string> {
    const response = await api()
      .post('/api/v1/invoices')
      .set('Authorization', bearer(session))
      .send({
        clientOrganizationId: clientOrgId,
        issueDate: '2026-09-01',
        placeOfSupplyState: 'Karnataka',
        placeOfSupplyCode: '29',
        lines: [line()],
        ...over,
      })
      .expect(201);
    createdInvoices.push(response.body.id);
    return response.body.id;
  }

  async function issue(id: string, session = pm) {
    return api()
      .post(`/api/v1/invoices/${id}/issue`)
      .set('Authorization', bearer(session))
      .expect(201);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [director, pm, developer, clientAdmin, zenithAdmin] = await Promise.all([
      loginAs(app, DEMO.director),
      loginAs(app, DEMO.pm),
      loginAs(app, DEMO.developer),
      loginAs(app, DEMO.clientAdmin),
      loginAs(app, DEMO.zenithAdmin),
    ]);

    providerOrgId = clientAdmin.body.user.organization.id;
    const provider = await prisma.organization.findFirst({ where: { slug: 'ashniva' } });
    providerOrgId = provider?.id ?? '';
    clientOrgId = clientAdmin.body.user.organization.id;
    zenithOrgId = zenithAdmin.body.user.organization.id;
    expect(providerOrgId && clientOrgId && zenithOrgId).toBeTruthy();

    await saveProfile(director, profile);
  });

  afterAll(async () => {
    // Only rows these tests created.
    await prisma.paymentAllocation.deleteMany({
      where: { payment: { organizationId: providerOrgId } },
    });
    await prisma.payment.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.invoiceHistory.deleteMany({
      where: { invoice: { organizationId: providerOrgId } },
    });
    await prisma.invoiceLineItem.deleteMany({
      where: { invoice: { organizationId: providerOrgId } },
    });
    await prisma.invoiceTaxBreakdown.deleteMany({
      where: { invoice: { organizationId: providerOrgId } },
    });
    await prisma.invoice.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.clientBillingProfile.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.billingProfile.deleteMany({ where: { organizationId: providerOrgId } });
    await prisma.file.deleteMany({
      where: { storageKey: { startsWith: PROFILE_TEST_FILE_PREFIX } },
    });
    await app.close();
  });

  describe('the billing profile', () => {
    it('saves and reads back', async () => {
      const read = await api()
        .get('/api/v1/settings/billing')
        .set('Authorization', bearer(director))
        .expect(200);
      expect(read.body).toMatchObject({ legalName: profile.legalName, stateCode: '29' });
    });

    it('rejects an invalid GSTIN and state code', async () => {
      for (const bad of [{ gstin: 'NOT-A-GSTIN' }, { stateCode: '299' }, { pan: 'lowercase' }]) {
        await saveProfile(director, { ...profile, ...bad }, 400);
      }
    });

    it('does not let the form reset the invoice sequence', async () => {
      // A settings form that could rewind the counter is a form that produces duplicate numbers.
      await saveProfile(director, { ...profile, nextSequence: 1, sequenceYear: '2020-21' }, 400);
    });

    it('keeps a developer and a client out', async () => {
      await api()
        .get('/api/v1/settings/billing')
        .set('Authorization', bearer(developer))
        .expect(403);
      await api()
        .get('/api/v1/settings/billing')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
    });

    /**
     * The guard, pinned from the outside.
     *
     * Every other test here attaches the header, on the assumption that the UI does. It did not:
     * the settings screen sent no `x-reauth-token` and the save was a flat 403 for everybody,
     * with no password prompt to explain it. Nothing failed, because nothing asserted the
     * unheadered case. This does.
     */
    it('refuses a save that carries no re-authentication header', async () => {
      await api()
        .put('/api/v1/settings/billing')
        .set('Authorization', bearer(director))
        .send(profile)
        .expect(403);
    });

    /**
     * A manager may read the profile and may never save it, token or no token — which is why the
     * navigation entry is gated on `billing-profile:manage` rather than `invoice:write`.
     */
    it('refuses a manager the save even with a valid token', async () => {
      await api().get('/api/v1/settings/billing').set('Authorization', bearer(pm)).expect(200);
      await saveProfile(pm, profile, 403);
    });

    /**
     * The settings form is not the whole row.
     *
     * The PUT is a full replace, and it used to coerce every absent optional to the type default:
     * one save from a form that has no logo, no signature and no financial-year field deleted the
     * first two and moved the third from January back to April — silently changing the year label
     * on every invoice number issued afterwards.
     */
    it('preserves the fields a UI-shaped payload does not carry', async () => {
      // The storage key is unique per run so a failed run leaves nothing to collide with.
      const file = (name: string) =>
        prisma.file.create({
          data: {
            organizationId: providerOrgId,
            name,
            contentType: 'image/png',
            sizeBytes: 12,
            storageKey: `${PROFILE_TEST_FILE_PREFIX}${randomUUID()}/${name}`,
            visibility: 'INTERNAL',
            uploadedById: director.body.user.id,
          },
          select: { id: true },
        });
      const [logo, signature] = await Promise.all([file('logo.png'), file('signature.png')]);

      try {
        await saveProfile(director, {
          ...profile,
          financialYearStartMonth: 1,
          logoFileId: logo.id,
          signatureFileId: signature.id,
        });

        // Exactly what the settings screen sends: no logo, no signature, no financial year.
        await saveProfile(director, { ...profile, invoicePrefix: 'INV' });

        const read = await api()
          .get('/api/v1/settings/billing')
          .set('Authorization', bearer(director))
          .expect(200);
        expect(read.body).toMatchObject({
          financialYearStartMonth: 1,
          logoFileId: logo.id,
          signatureFileId: signature.id,
        });
      } finally {
        // Put the numbering back the way the rest of this file expects, then drop the files.
        await prisma.billingProfile.update({
          where: { organizationId: providerOrgId },
          data: { financialYearStartMonth: 4, logoFileId: null, signatureFileId: null },
        });
        await prisma.file.deleteMany({ where: { id: { in: [logo.id, signature.id] } } });
      }
    });

    /**
     * The amount in words is the line that legally states the figure, and it is written in the
     * Indian system down to the word "Paise". A profile saved as USD printed a dollar total as
     * "Rupees … Paise Only", so the currency is refused rather than stored and mis-stated.
     */
    it('refuses a currency the amount in words cannot state', async () => {
      await saveProfile(director, { ...profile, currency: 'USD' }, 400);
      await saveProfile(director, { ...profile, currency: 'INR' });
    });
  });

  describe('calculation', () => {
    it('computes intra-state CGST and SGST', async () => {
      const result = await api()
        .post('/api/v1/invoices/calculate')
        .set('Authorization', bearer(pm))
        .send({ lines: [line()], placeOfSupplyCode: '29' })
        .expect(201);

      expect(result.body).toMatchObject({
        taxableValue: '100000.00',
        cgstTotal: '9000.00',
        sgstTotal: '9000.00',
        igstTotal: '0.00',
        total: '118000.00',
      });
      expect(result.body.amountInWords).toContain('One Lakh Eighteen Thousand');
    });

    it('computes inter-state IGST', async () => {
      const result = await api()
        .post('/api/v1/invoices/calculate')
        .set('Authorization', bearer(pm))
        .send({ lines: [line()], placeOfSupplyCode: '27' })
        .expect(201);
      expect(result.body).toMatchObject({ igstTotal: '18000.00', cgstTotal: '0.00' });
    });

    it('returns money as strings, never as JSON numbers', async () => {
      // A JSON number is a double; currency through one drifts.
      const result = await api()
        .post('/api/v1/invoices/calculate')
        .set('Authorization', bearer(pm))
        .send({ lines: [line({ unitPrice: '0.10' })], placeOfSupplyCode: '29' })
        .expect(201);
      expect(typeof result.body.total).toBe('string');
      expect(typeof result.body.taxableValue).toBe('string');
    });

    it('rejects a number that a double could not have held exactly', async () => {
      // The pipe coerces a JSON number to a string before validation. That round-trip is
      // lossless for anything the money pattern accepts — JavaScript prints the shortest
      // representation that round-trips — so what has to be refused is the shapes a double
      // mangles: exponent notation, excess precision, and values past the column's range.
      for (const unitPrice of [1e21, 0.30000000000000004, 1_000_000_000_000]) {
        await api()
          .post('/api/v1/invoices/calculate')
          .set('Authorization', bearer(pm))
          .send({ lines: [{ ...line(), unitPrice }], placeOfSupplyCode: '29' })
          .expect(400);
      }
    });

    it('keeps an ordinary price exact whether it arrives as a string or a number', async () => {
      const results = await Promise.all(
        ['1234.56', 1234.56].map((unitPrice) =>
          api()
            .post('/api/v1/invoices/calculate')
            .set('Authorization', bearer(pm))
            .send({ lines: [{ ...line(), unitPrice, taxRate: '18.00' }], placeOfSupplyCode: '29' })
            .expect(201),
        ),
      );
      expect(results[0]?.body.total).toBe(results[1]?.body.total);
      expect(results[0]?.body.taxableValue).toBe('1234.56');
    });
  });

  /**
   * An export supply carries no GST, but the line keeps the rate it was quoted at — that column is
   * the input an edit round-trips through. Every surface that shows the line to a person has to
   * reconcile those two facts, and a fix applied to only one of them is how this last regressed.
   */
  describe('an export invoice', () => {
    it('previews at 0% with no tax', async () => {
      const result = await api()
        .post('/api/v1/invoices/calculate')
        .set('Authorization', bearer(pm))
        .send({ lines: [line()], placeOfSupplyCode: '29', isExport: true })
        .expect(201);

      expect(result.body.lines[0].taxRate).toBe('0.00');
      expect(result.body.taxBreakdown[0].taxRate).toBe('0.00');
      expect(result.body).toMatchObject({
        taxableValue: '100000.00',
        cgstTotal: '0.00',
        sgstTotal: '0.00',
        igstTotal: '0.00',
        taxTotal: '0.00',
        total: '100000.00',
      });
    });

    it('reports 0% to the provider while the row still stores the quoted rate', async () => {
      const id = await draft({ isExport: true });
      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);

      expect(detail.body.supplyType).toBe('EXPORT');
      expect(detail.body.lineItems[0].taxRate).toBe('0.00');
      expect(detail.body.taxBreakdown[0].taxRate).toBe('0.00');
      expect(detail.body.taxTotal).toBe('0.00');
      expect(detail.body.total).toBe('100000.00');

      // The asymmetry, stated: the column keeps 18, the reader is told 0.
      const stored = await prisma.invoiceLineItem.findFirst({ where: { invoiceId: id } });
      expect(stored?.taxRate.toFixed(2)).toBe('18.00');
    });

    it('reports 0% to the client on the portal', async () => {
      const id = await draft({ isExport: true });
      await issue(id);

      const portal = await api()
        .get(`/api/v1/portal/invoices/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);

      expect(portal.body.supplyType).toBe('EXPORT');
      expect(portal.body.lineItems[0].taxRate).toBe('0.00');
      expect(portal.body.taxBreakdown[0].taxRate).toBe('0.00');
      expect(portal.body.taxTotal).toBe('0.00');
      expect(portal.body.total).toBe('100000.00');
    });

    it('never shows a rate on a line that carries no tax', async () => {
      const id = await draft({ isExport: true });
      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);

      for (const item of detail.body.lineItems) {
        const hasTax =
          item.cgstAmount !== '0.00' || item.sgstAmount !== '0.00' || item.igstAmount !== '0.00';
        expect(item.taxRate === '0.00').toBe(!hasTax);
      }
    });

    it('brings the GST back on every surface when the export flag is cleared', async () => {
      // The regression this pair guards: an earlier fix zeroed the stored column instead of the
      // presentation, so a patch that merely cleared `isExport` recomputed an 18% supply at 0%.
      const id = await draft({ isExport: true });

      const patched = await api()
        .patch(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .send({ isExport: false })
        .expect(200);

      expect(patched.body.supplyType).toBe('INTRA_STATE');
      expect(patched.body.lineItems[0].taxRate).toBe('18.00');
      expect(patched.body.taxBreakdown[0].taxRate).toBe('18.00');
      expect(patched.body).toMatchObject({
        cgstTotal: '9000.00',
        sgstTotal: '9000.00',
        taxTotal: '18000.00',
        total: '118000.00',
      });

      await issue(id);
      const portal = await api()
        .get(`/api/v1/portal/invoices/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(portal.body.lineItems[0].taxRate).toBe('18.00');
      expect(portal.body.taxBreakdown[0].taxRate).toBe('18.00');
      expect(portal.body.total).toBe('118000.00');
    });
  });

  describe('the invoice lifecycle', () => {
    it('creates a draft with no number and computes its totals', async () => {
      const id = await draft();
      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);

      expect(detail.body.status).toBe('DRAFT');
      expect(detail.body.numberLabel).toMatch(/^DRAFT-/);
      expect(detail.body.total).toBe('118000.00');
      expect(detail.body.balanceDue).toBe('118000.00');
      expect(detail.body.lineItems).toHaveLength(1);
      expect(detail.body.taxBreakdown).toHaveLength(1);
    });

    it('ignores a total the caller tries to supply', async () => {
      // The figure on a tax document has to come from the server.
      const response = await api()
        .post('/api/v1/invoices')
        .set('Authorization', bearer(pm))
        .send({
          clientOrganizationId: clientOrgId,
          issueDate: '2026-09-01',
          placeOfSupplyState: 'Karnataka',
          placeOfSupplyCode: '29',
          lines: [line()],
          total: '1.00',
          taxTotal: '0.00',
        });
      // Unknown properties are rejected outright by the validation pipe.
      expect(response.status).toBe(400);
    });

    it('issues with a real number and freezes the document', async () => {
      const id = await draft();
      const issued = await issue(id);

      expect(issued.body.status).toBe('ISSUED');
      expect(issued.body.numberLabel).toMatch(/^INV\/\d{4}-\d{2}\/\d{4}$/);
      expect(issued.body.issuedAt).toBeTruthy();
      expect(issued.body.pdfFileId).toBeTruthy();
    });

    it('refuses to edit an issued invoice', async () => {
      const id = await draft();
      await issue(id);
      await api()
        .patch(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .send({ notes: 'changed after the fact' })
        .expect(409);
    });

    it('refuses to issue twice', async () => {
      const id = await draft();
      await issue(id);
      await api().post(`/api/v1/invoices/${id}/issue`).set('Authorization', bearer(pm)).expect(409);
    });

    it('does not let an edit racing an issue rewrite the issued invoice', async () => {
      // The editability check runs on a row read before the transaction, so a PATCH whose read
      // lands just before Issue commits used to rewrite an ISSUED invoice — new line items, new
      // totals, `amountPaid` reset to zero — while it kept its number and the PDF already sent.
      const id = await draft();

      const [issued, edited] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/invoices/${id}/issue`)
          .set('Authorization', bearer(pm)),
        request(app.getHttpServer())
          .patch(`/api/v1/invoices/${id}`)
          .set('Authorization', bearer(pm))
          .send({ notes: 'slipped in during the issue' }),
      ]);

      expect(issued.status).toBe(201);
      // The edit either happened before the issue or was refused — never applied afterwards.
      expect([200, 409]).toContain(edited.status);

      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(detail.body.status).toBe('ISSUED');
      expect(detail.body.numberLabel).toMatch(/^INV\/\d{4}-\d{2}\/\d{4}$/);
      expect(detail.body.lineItems.length).toBeGreaterThan(0);
    });

    it('records a history entry with a snapshot at issue', async () => {
      const id = await draft();
      await issue(id);
      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);

      expect(detail.body.history[0]).toMatchObject({ toStatus: 'ISSUED', hasSnapshot: true });
    });

    /**
     * The snapshot is what the PDF prints once an invoice is issued, so a field missing from it
     * is a field missing from the document. The postal code was saved, mapped and returned, and
     * then dropped from the one address that ends up on paper.
     */
    it('freezes the postal code into the supplier address', async () => {
      const id = await draft();
      await issue(id);
      const row = await prisma.invoice.findUnique({ where: { id }, select: { snapshot: true } });
      const snapshot = row?.snapshot as { supplier?: { address?: string } } | null;
      expect(snapshot?.supplier?.address).toContain(profile.postalCode);
    });

    /** INR is the only currency the profile accepts, so the words always say Rupees. */
    it('states the amount in the currency the invoice is in', async () => {
      const id = await draft();
      const issued = await issue(id);
      expect(issued.body.currency).toBe('INR');
      expect(issued.body.amountInWords).toMatch(/^Rupees /);
    });

    it('keeps the number when an issued invoice is voided', async () => {
      const id = await draft();
      const issued = await issue(id);
      const numberLabel = issued.body.numberLabel;

      const voided = await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ reason: 'Raised against the wrong contract' })
        .expect(201);

      expect(voided.body.status).toBe('VOID');
      // The number is never reused; the sequence has no gap to explain.
      expect(voided.body.numberLabel).toBe(numberLabel);
      expect(voided.body.voidReason).toBe('Raised against the wrong contract');
    });

    it('requires a reason to void', async () => {
      const id = await draft();
      await issue(id);
      await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ reason: '' })
        .expect(400);
    });

    it('does not let a project manager void', async () => {
      // Withdrawing a tax document is its own permission.
      const id = await draft();
      await issue(id);
      await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({ reason: 'Testing the guard' })
        .expect(403);
    });
  });

  /**
   * A draft dated in a closed financial year continues the current series — restarting the
   * counter on any mismatch rewinds the profile and leaves the tenant unable to issue anything.
   * The invoice then has to say which year its number actually came from.
   */
  describe('a back-dated invoice', () => {
    /**
     * Voided once asserted. These invoices are deliberately dated before every other fixture in
     * the suite, and an open one would be the oldest thing auto-allocation reaches — it would
     * swallow the payment the allocation test is about. Voiding keeps the number spent, which is
     * the honest way to retire an issued invoice, and takes it out of `openInvoicesFor`.
     */
    const retire = async (id: string) =>
      api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ reason: 'Fixture for the numbering test' })
        .expect(201);

    it('files the invoice under the year its number was taken from', async () => {
      // Put the profile firmly in 2026-27 first, so the back-dated draft is genuinely older.
      const primer = await draft({ issueDate: '2026-09-01' });
      await issue(primer);
      await retire(primer);

      const id = await draft({ issueDate: '2026-03-15' });
      const asDraft = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      // While it is a draft the column is just where the issue date points; there is no number yet.
      expect(asDraft.body.financialYear).toBe('2025-26');

      await issue(id);
      const issued = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);

      expect(issued.body.numberLabel).toContain('/2026-27/');
      expect(issued.body.financialYear).toBe('2026-27');

      // Stated as the invariant rather than as two constants: the label and the column are one
      // fact written twice, and an invoice numbered in one year and filed under another is what
      // an auditor reconciling a series finds.
      const labelYear = /\/(\d{4}-\d{2})\//.exec(issued.body.numberLabel)?.[1];
      expect(issued.body.financialYear).toBe(labelYear);

      await retire(id);
    });

    it('keeps label and column agreeing for an ordinary invoice too', async () => {
      const id = await draft({ issueDate: '2026-09-01' });
      await issue(id);
      const issued = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);

      const labelYear = /\/(\d{4}-\d{2})\//.exec(issued.body.numberLabel)?.[1];
      expect(issued.body.financialYear).toBe(labelYear);
      expect(issued.body.financialYear).toBe('2026-27');

      await retire(id);
    });
  });

  describe('invoice numbering under concurrency', () => {
    it('gives every invoice its own number when issued at the same moment', async () => {
      const ids = await Promise.all([draft(), draft(), draft(), draft(), draft()]);

      // The whole point: five requests racing for the sequence.
      const results = await Promise.all(
        ids.map((id) =>
          request(app.getHttpServer())
            .post(`/api/v1/invoices/${id}/issue`)
            .set('Authorization', bearer(pm)),
        ),
      );

      const labels = results.map((response) => response.body.numberLabel);
      expect(results.every((response) => response.status === 201)).toBe(true);
      expect(new Set(labels).size).toBe(5);
      for (const label of labels) {
        expect(label).toMatch(/^INV\/\d{4}-\d{2}\/\d{4}$/);
      }
    });

    it('issues one invoice once, even when two requests race for it', async () => {
      const id = await draft();
      const before = await prisma.billingProfile.findUniqueOrThrow({
        where: { organizationId: providerOrgId },
      });

      const results = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/invoices/${id}/issue`)
          .set('Authorization', bearer(pm)),
        request(app.getHttpServer())
          .post(`/api/v1/invoices/${id}/issue`)
          .set('Authorization', bearer(pm)),
      ]);

      // One succeeds and one is refused. What matters beyond the status codes is that the loser
      // rolls back the sequence it took: a burnt number is a permanent gap in a GST series.
      expect(results.filter((response) => response.status === 201)).toHaveLength(1);
      expect(results.filter((response) => response.status === 409)).toHaveLength(1);

      const after = await prisma.billingProfile.findUniqueOrThrow({
        where: { organizationId: providerOrgId },
      });
      expect(after.nextSequence).toBe(before.nextSequence + 1);

      const history = await prisma.invoiceHistory.count({ where: { invoiceId: id } });
      expect(history).toBe(1);
    });

    it('advances the stored sequence past every number handed out', async () => {
      const before = await prisma.billingProfile.findUniqueOrThrow({
        where: { organizationId: providerOrgId },
      });
      const id = await draft();
      await issue(id);
      const after = await prisma.billingProfile.findUniqueOrThrow({
        where: { organizationId: providerOrgId },
      });
      expect(after.nextSequence).toBe(before.nextSequence + 1);
    });
  });

  describe('payments', () => {
    it('records a payment and settles the invoice', async () => {
      const id = await draft();
      await issue(id);

      const payment = await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `NEFT-${Date.now()}`,
          method: 'BANK_TRANSFER',
          paidAt: new Date().toISOString(),
          amount: '118000.00',
          allocations: [{ invoiceId: id, amount: '118000.00' }],
        })
        .expect(201);
      createdPayments.push(payment.body.id);

      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(detail.body).toMatchObject({
        status: 'PAID',
        amountPaid: '118000.00',
        balanceDue: '0.00',
      });
      expect(detail.body.payments).toHaveLength(1);
    });

    it('records a part payment', async () => {
      const id = await draft();
      await issue(id);
      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `PART-${Date.now()}`,
          method: 'UPI',
          paidAt: new Date().toISOString(),
          amount: '50000.00',
          allocations: [{ invoiceId: id, amount: '50000.00' }],
        })
        .expect(201);

      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(detail.body).toMatchObject({
        status: 'PARTIALLY_PAID',
        amountPaid: '50000.00',
        balanceDue: '68000.00',
      });
    });

    it('refuses to settle an invoice that was voided while the payment was being entered', async () => {
      // The lock re-read the status but never re-checked it, and voiding leaves `balanceDue`
      // alone — so a payment planned against an ISSUED invoice and applied after a concurrent
      // void wrote PAID over VOID, a transition the table forbids, on a withdrawn document.
      const id = await draft();
      await issue(id);
      await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ reason: 'raised in error' })
        .expect(201);

      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `VOIDRACE-${Date.now()}`,
          method: 'BANK_TRANSFER',
          paidAt: '2026-09-02',
          amount: '118000.00',
          allocations: [{ invoiceId: id, amount: '118000.00' }],
        })
        .expect(404);

      const after = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(after.status).toBe('VOID');
      expect(after.amountPaid.toFixed(2)).toBe('0.00');
    });

    it('refuses a payment from an organization that is not a client', async () => {
      for (const target of [providerOrgId, '00000000-0000-4000-8000-000000000000']) {
        await api()
          .post('/api/v1/payments')
          .set('Authorization', bearer(pm))
          .set(REAUTH_HEADER, await reauth(pm))
          .send({
            clientOrganizationId: target,
            reference: `BADCLIENT-${Date.now()}-${target.slice(0, 4)}`,
            method: 'BANK_TRANSFER',
            paidAt: '2026-09-02',
            amount: '100.00',
            leaveUnallocated: true,
          })
          .expect(400);
      }
    });

    it('refuses a duplicate payment reference', async () => {
      // Two people reading the same bank statement must not both enter the transfer.
      const reference = `DUP-${Date.now()}`;
      const body = {
        clientOrganizationId: clientOrgId,
        reference,
        method: 'BANK_TRANSFER' as const,
        paidAt: new Date().toISOString(),
        amount: '1000.00',
        leaveUnallocated: true,
      };
      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send(body)
        .expect(201);
      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send(body)
        .expect(409);
    });

    it('refuses to overpay an invoice', async () => {
      const id = await draft();
      await issue(id);
      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `OVER-${Date.now()}`,
          method: 'BANK_TRANSFER',
          paidAt: new Date().toISOString(),
          amount: '200000.00',
          allocations: [{ invoiceId: id, amount: '200000.00' }],
        })
        .expect(400);
    });

    it('leaves nothing applied when the allocation is refused', async () => {
      const id = await draft();
      await issue(id);
      const reference = `ATOMIC-${Date.now()}`;

      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference,
          method: 'BANK_TRANSFER',
          paidAt: new Date().toISOString(),
          amount: '500000.00',
          allocations: [{ invoiceId: id, amount: '500000.00' }],
        })
        .expect(400);

      // Neither the payment nor a balance change survived the refusal.
      expect(await prisma.payment.findFirst({ where: { reference } })).toBeNull();
      const detail = await api()
        .get(`/api/v1/invoices/${id}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(detail.body.amountPaid).toBe('0.00');
    });

    it('spreads an unallocated payment across open invoices, oldest first', async () => {
      const first = await draft({ issueDate: '2026-08-01' });
      const second = await draft({ issueDate: '2026-08-15' });
      await issue(first);
      await issue(second);

      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `AUTO-${Date.now()}`,
          method: 'BANK_TRANSFER',
          paidAt: new Date().toISOString(),
          amount: '150000.00',
        })
        .expect(201);

      const firstDetail = await api()
        .get(`/api/v1/invoices/${first}`)
        .set('Authorization', bearer(pm))
        .expect(200);
      expect(firstDetail.body.status).toBe('PAID');
    });

    it('does not let a developer record a payment', async () => {
      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(developer))
        .set(REAUTH_HEADER, await reauth(developer))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `NOPE-${Date.now()}`,
          method: 'CASH',
          paidAt: new Date().toISOString(),
          amount: '100.00',
          leaveUnallocated: true,
        })
        .expect(403);
    });
  });

  describe('what a client can see', () => {
    it('shows an issued invoice in the portal', async () => {
      const id = await draft();
      await issue(id);

      const detail = await api()
        .get(`/api/v1/portal/invoices/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(detail.body).toMatchObject({ status: 'ISSUED', total: '118000.00' });
      expect(detail.body.lineItems).toHaveLength(1);
    });

    it('lets a client download the PDF the portal points them at', async () => {
      // The portal hands back a file id and the browser fetches it from /files. The PDF has no
      // parent column of its own — the link runs from `Invoice.pdfFileId` — so without the
      // invoice being counted as its owner the client gets a 404 on their own invoice.
      const id = await draft();
      await issue(id);

      const pdf = await api()
        .get(`/api/v1/portal/invoices/${id}/pdf`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(pdf.body.fileId).toBeTruthy();

      await api()
        .get(`/api/v1/files/${pdf.body.fileId}/download`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
    });

    it('keeps serving the PDF after a void, which the client is still shown', async () => {
      // Void keeps the number in use precisely because the client relied on the document. It
      // stays visible in the portal, so unlinking its PDF took away a file they are still shown.
      const id = await draft();
      await issue(id);
      const pdf = await api()
        .get(`/api/v1/portal/invoices/${id}/pdf`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);

      await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ reason: 'superseded by a corrected invoice' })
        .expect(201);

      await api()
        .get(`/api/v1/portal/invoices/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      await api()
        .get(`/api/v1/files/${pdf.body.fileId}/download`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
    });

    it('will not let anyone delete an invoice document', async () => {
      // `DELETE /files/:id` has no permission guard and issues a real object delete, with no way
      // to regenerate — an unprivileged internal user could destroy a tax document already sent.
      const id = await draft();
      await issue(id);
      const pdf = await api()
        .get(`/api/v1/invoices/${id}/pdf`)
        .set('Authorization', bearer(pm))
        .expect(200);

      await api()
        .delete(`/api/v1/files/${pdf.body.fileId}`)
        .set('Authorization', bearer(developer))
        .expect(403);
      await api()
        .delete(`/api/v1/files/${pdf.body.fileId}`)
        .set('Authorization', bearer(director))
        .expect(403);

      await api()
        .get(`/api/v1/files/${pdf.body.fileId}/download`)
        .set('Authorization', bearer(pm))
        .expect(200);
    });

    it('stops serving the PDF once the invoice is soft-deleted', async () => {
      // The link is not authority. A soft-deleted invoice keeps `pdf_file_id`, and
      // `findForClient` refuses it — so the file check has to refuse it too, or the portal's own
      // 404 is the only thing standing between a client and a withdrawn document.
      const id = await draft();
      await issue(id);
      const pdf = await api()
        .get(`/api/v1/portal/invoices/${id}/pdf`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      await api()
        .get(`/api/v1/files/${pdf.body.fileId}/download`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);

      await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });

      await api()
        .get(`/api/v1/files/${pdf.body.fileId}/download`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);
      // Still the provider's document.
      await api()
        .get(`/api/v1/files/${pdf.body.fileId}/download`)
        .set('Authorization', bearer(pm))
        .expect(200);
    });

    it('will not let a cancelled invoice’s document be destroyed', async () => {
      // Cancelling nulls `invoices.pdf_file_id` and moves the only pointer to the history row.
      // A delete guard reading just the forward link stopped protecting the file at exactly the
      // moment the cancel path promised to keep it.
      const id = await draft();
      await issue(id);
      const pdf = await api()
        .get(`/api/v1/invoices/${id}/pdf`)
        .set('Authorization', bearer(pm))
        .expect(200);
      const fileId = pdf.body.fileId as string;

      await api()
        .post(`/api/v1/invoices/${id}/cancel`)
        .set('Authorization', bearer(director))
        .send({ reason: 'raised against the wrong client' })
        .expect(201);

      // The forward link is gone; the history link is not.
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
      expect(invoice.pdfFileId).toBeNull();

      await api()
        .delete(`/api/v1/files/${fileId}`)
        .set('Authorization', bearer(director))
        .expect(403);
      await api()
        .get(`/api/v1/files/${fileId}/download`)
        .set('Authorization', bearer(pm))
        .expect(200);
    });

    it('stops serving the PDF once the invoice is cancelled', async () => {
      // The portal 404s a cancelled invoice, but the file id was already in the client's hands
      // and the file itself stayed reachable. Cancelling now unlinks the PDF from the invoice,
      // which is the relation both `clientMayRead` and the row-level-security policy match on.
      const id = await draft();
      await issue(id);
      const pdf = await api()
        .get(`/api/v1/portal/invoices/${id}/pdf`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      const fileId = pdf.body.fileId as string;

      await api()
        .post(`/api/v1/invoices/${id}/cancel`)
        .set('Authorization', bearer(director))
        .send({ reason: 'raised against the wrong client' })
        .expect(201);

      await api()
        .get(`/api/v1/files/${fileId}/download`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);

      // The document itself is kept: the history row still points at it, provider-side.
      const history = await prisma.invoiceHistory.findFirst({
        where: { invoiceId: id, toStatus: 'CANCELLED' },
      });
      expect(history?.pdfFileId).toBe(fileId);
    });

    it('never shows a draft', async () => {
      const id = await draft();
      await api()
        .get(`/api/v1/portal/invoices/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(404);

      const list = await api()
        .get('/api/v1/portal/invoices?limit=100')
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      expect(list.body.items.map((row: { id: string }) => row.id)).not.toContain(id);
    });

    it('hides another client’s invoice, even given its id', async () => {
      const id = await draft();
      await issue(id);
      await api()
        .get(`/api/v1/portal/invoices/${id}`)
        .set('Authorization', bearer(zenithAdmin))
        .expect(404);
    });

    it('omits internal notes and the history from the portal response', async () => {
      const id = await draft({ internalNotes: 'Margin is thin; do not discount further' });
      await issue(id);

      const detail = await api()
        .get(`/api/v1/portal/invoices/${id}`)
        .set('Authorization', bearer(clientAdmin))
        .expect(200);
      const body = JSON.stringify(detail.body);
      expect(body).not.toContain('Margin is thin');
      expect(body).not.toContain('internalNotes');
      expect(detail.body).not.toHaveProperty('history');
      expect(detail.body).not.toHaveProperty('internalNotes');
    });

    it('keeps a client out of the internal endpoints', async () => {
      await api().get('/api/v1/invoices').set('Authorization', bearer(clientAdmin)).expect(403);
      await api().get('/api/v1/payments').set('Authorization', bearer(clientAdmin)).expect(403);
    });

    it('rejects an unauthenticated caller', async () => {
      await api().get('/api/v1/invoices').expect(401);
      await api().get('/api/v1/portal/invoices').expect(401);
    });
  });

  describe('tenant scope', () => {
    it('lists only this organization’s invoices', async () => {
      const id = await draft();
      const list = await api()
        .get('/api/v1/invoices?limit=100')
        .set('Authorization', bearer(pm))
        .expect(200);

      const ids = list.body.items.map((row: { id: string }) => row.id);
      expect(ids).toContain(id);
      const rows = await prisma.invoice.findMany({
        where: { id: { in: ids } },
        select: { organizationId: true },
      });
      expect(rows.every((row) => row.organizationId === providerOrgId)).toBe(true);
    });

    it('refuses an invoice addressed to the provider itself', async () => {
      await api()
        .post('/api/v1/invoices')
        .set('Authorization', bearer(pm))
        .send({
          clientOrganizationId: providerOrgId,
          issueDate: '2026-09-01',
          placeOfSupplyState: 'Karnataka',
          placeOfSupplyCode: '29',
          lines: [line()],
        })
        .expect(400);
    });

    it('refuses an invoice dated in the future', async () => {
      // The financial year comes from the issue date, and issuing into a later year drags the
      // whole numbering series there — a typo of 2030 relabels every invoice for four real years
      // and `nextSequence` is not writable through the API to put it back.
      await api()
        .post('/api/v1/invoices')
        .set('Authorization', bearer(pm))
        .send({
          clientOrganizationId: clientOrgId,
          issueDate: '2030-01-01',
          placeOfSupplyState: 'Karnataka',
          placeOfSupplyCode: '29',
          lines: [line()],
        })
        .expect(400);
    });

    it('refuses to issue an invoice with nothing to pay', async () => {
      // It could never be paid: `openInvoicesFor` requires a balance above zero, so it would sit
      // in the portal looking outstanding with no state it could leave.
      const id = await draft({ lines: [line({ unitPrice: '0.00' })] });
      await api().post(`/api/v1/invoices/${id}/issue`).set('Authorization', bearer(pm)).expect(409);
    });

    it('refuses a quantity the column would silently round, with a 400 and a reason', async () => {
      // `quantity` is numeric(12,3). 1.2345 used to be accepted, the totals computed from it, and
      // 1.235 stored — so the line no longer multiplied out to its own taxable value. And the
      // money errors were plain Errors, so a bad field answered 500 "Something went wrong".
      const response = await api()
        .post('/api/v1/invoices')
        .set('Authorization', bearer(pm))
        .send({
          clientOrganizationId: clientOrgId,
          issueDate: '2026-09-01',
          placeOfSupplyState: 'Karnataka',
          placeOfSupplyCode: '29',
          lines: [{ ...line(), quantity: '1.2345' }],
        })
        .expect(400);
      expect(response.body.message).toMatch(/3 decimal places/);
    });

    it('refuses a payment amount finer than a paisa', async () => {
      const response = await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `PRECISION-${Date.now()}`,
          method: 'BANK_TRANSFER',
          paidAt: '2026-09-02',
          amount: '1000.005',
          leaveUnallocated: true,
        })
        .expect(400);
      expect(response.body.message).toMatch(/2 decimal places/);
    });

    it('rejects an unknown query parameter rather than ignoring it', async () => {
      await api()
        .get('/api/v1/invoices?includeOtherTenants=true')
        .set('Authorization', bearer(pm))
        .expect(400);
    });
  });

  /**
   * Issues #12, #14 and #15: who may do the things that move money.
   *
   * Three separate findings that all live on this controller, so they are asserted together and
   * named individually.
   */
  describe('the guards on money-moving actions', () => {
    it('#15: refuses to void without a fresh password, then allows it with one', async () => {
      const id = await draft().then(async (draftId) => {
        await issue(draftId);
        return draftId;
      });
      await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(director))
        .send({ reason: 'No re-auth' })
        .expect(403);

      await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(director))
        .set(REAUTH_HEADER, await reauth(director))
        .send({ reason: 'With re-auth' })
        .expect(201);
    });

    it('#15: refuses to record a payment without a fresh password', async () => {
      await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `NO-REAUTH-${Date.now()}`,
          method: 'BANK_TRANSFER',
          paidAt: '2026-09-05',
          amount: '100.00',
          leaveUnallocated: true,
        })
        .expect(403);
    });

    it('#14: lets a project manager cancel a draft they raised', async () => {
      // The point of splitting the permission: withdrawing a draft nobody was sent is an ordinary
      // correction. Before this it needed an administrator.
      const id = await draft();
      await api()
        .post(`/api/v1/invoices/${id}/cancel`)
        .set('Authorization', bearer(pm))
        .send({ reason: 'Raised against the wrong client' })
        .expect(201);
    });

    it('#14: still keeps void away from a project manager', async () => {
      const id = await draft().then(async (draftId) => {
        await issue(draftId);
        return draftId;
      });
      await api()
        .post(`/api/v1/invoices/${id}/void`)
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({ reason: 'Should not be permitted' })
        .expect(403);
    });

    it('#12: refuses a bank-detail change to somebody who may only edit invoices', async () => {
      // `bankDetails` is the account every invoice tells a client to pay into. Changing it is a
      // payee change, and it used to need no more authority than editing a draft line item.
      await api()
        .put('/api/v1/settings/billing')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({ ...profile, bankDetails: 'Somebody else · A/C 999' })
        .expect(403);
    });

    it('#12: records an audit entry when a payment is allocated', async () => {
      const invoiceId = await draft().then(async (draftId) => {
        await issue(draftId);
        return draftId;
      });
      const payment = await api()
        .post('/api/v1/payments')
        .set('Authorization', bearer(pm))
        .set(REAUTH_HEADER, await reauth(pm))
        .send({
          clientOrganizationId: clientOrgId,
          reference: `ALLOC-AUDIT-${Date.now()}`,
          method: 'BANK_TRANSFER',
          paidAt: '2026-09-05',
          amount: '100.00',
          leaveUnallocated: true,
        })
        .expect(201);
      createdPayments.push(payment.body.id);

      await api()
        .post(`/api/v1/payments/${payment.body.id}/allocate`)
        .set('Authorization', bearer(pm))
        .send({ allocations: [{ invoiceId, amount: '100.00' }] })
        .expect(201);

      const entries = await prisma.auditLog.findMany({
        where: { organizationId: providerOrgId, entityId: payment.body.id },
      });
      // Every other money-moving path wrote one; this one wrote nothing, which left a payee
      // change and the allocation of whatever arrived with nothing tying them together.
      expect(entries.map((entry) => entry.action)).toContain('payment.allocated');
    });
  });

  /**
   * Who the invoice is *to*.
   *
   * The provider's record of a client's billing particulars, added because `buildInvoiceSnapshot`
   * read the client's own billing profile — a row the policy on that table can never hand to a
   * provider — so every B2B invoice went out with an empty "Bill to" block. What is proved here
   * is not only that it works, but that it is the provider's record and nobody else's.
   */
  describe('the client billing particulars', () => {
    const acmeBilling = {
      legalName: 'Acme Retail Private Limited',
      addressLine1: '12 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      postalCode: '400020',
      gstin: '27AABCU9603R1ZM',
    };

    const saveClient = async (
      session: Session,
      clientId: string,
      body: Record<string, unknown>,
      status = 200,
    ) =>
      api()
        .put(`/api/v1/settings/billing/clients/${clientId}`)
        .set('Authorization', bearer(session))
        .set(REAUTH_HEADER, await reauth(session))
        .send(body)
        .expect(status);

    const readClient = (session: Session, clientId: string, status = 200) =>
      api()
        .get(`/api/v1/settings/billing/clients/${clientId}`)
        .set('Authorization', bearer(session))
        .expect(status);

    it('saves and reads back, and lists what has been recorded', async () => {
      await saveClient(director, clientOrgId, acmeBilling);

      const read = await readClient(director, clientOrgId);
      expect(read.body).toMatchObject({
        clientOrganizationId: clientOrgId,
        legalName: acmeBilling.legalName,
        gstin: acmeBilling.gstin,
        stateCode: '27',
      });

      const list = await api()
        .get('/api/v1/settings/billing/clients')
        .set('Authorization', bearer(director))
        .expect(200);
      const ids = list.body.map(
        (row: { clientOrganizationId: string }) => row.clientOrganizationId,
      );
      expect(ids).toContain(clientOrgId);
    });

    it('asks for the password, and takes the same permission as the payee change', async () => {
      // Not a payee change, but it is the recipient name and GSTIN on a tax document, edited from
      // the same screen under the same permission. Both halves of that screen ask, or neither
      // should — and the client sends the header, which is the defect this branch exists to fix.
      await api()
        .put(`/api/v1/settings/billing/clients/${clientOrgId}`)
        .set('Authorization', bearer(director))
        .send(acmeBilling)
        .expect(403);

      // A manager may read it — they raise the invoices — and may never write it.
      await readClient(pm, clientOrgId);
      await saveClient(pm, clientOrgId, acmeBilling, 403);
    });

    it('refuses a record for the provider itself, or for an organization that does not exist', async () => {
      await saveClient(director, providerOrgId, acmeBilling, 404);
      await saveClient(director, '00000000-0000-4000-8000-000000000000', acmeBilling, 404);
    });

    it('validates the GSTIN and the state code', async () => {
      await saveClient(director, clientOrgId, { ...acmeBilling, gstin: 'NOT-A-GSTIN' }, 400);
      await saveClient(director, clientOrgId, { ...acmeBilling, stateCode: '277' }, 400);
    });

    it('records an audit entry naming what changed', async () => {
      await saveClient(director, clientOrgId, { ...acmeBilling, legalName: 'Acme Retail Pvt Ltd' });
      const entry = await prisma.auditLog.findFirst({
        where: { organizationId: providerOrgId, action: 'billing.client_profile_updated' },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry?.after).toMatchObject({
        legalName: 'Acme Retail Pvt Ltd',
        gstin: acmeBilling.gstin,
      });
      await saveClient(director, clientOrgId, acmeBilling);
    });

    // -----------------------------------------------------------------------------------------
    // Access. The whole reason this row sits on the provider rather than on the client.
    // -----------------------------------------------------------------------------------------

    it('keeps a client out of its own record, on the read and on the write', async () => {
      await api()
        .get('/api/v1/settings/billing/clients')
        .set('Authorization', bearer(clientAdmin))
        .expect(403);
      await readClient(clientAdmin, clientOrgId, 403);
      await api()
        .put(`/api/v1/settings/billing/clients/${clientOrgId}`)
        .set('Authorization', bearer(clientAdmin))
        .send({ ...acmeBilling, gstin: '27ZZZZZ0000Z1ZZ' })
        .expect(403);

      // And what the provider wrote is what is still there.
      const read = await readClient(director, clientOrgId);
      expect(read.body.gstin).toBe(acmeBilling.gstin);
    });

    it('exposes no route for it through the portal', async () => {
      // A client signing in to the portal has no path to how it is billed, by any spelling.
      for (const path of [
        '/api/v1/portal/settings/billing/clients',
        `/api/v1/portal/settings/billing/clients/${clientOrgId}`,
        `/api/v1/portal/billing/clients/${clientOrgId}`,
      ]) {
        const response = await api().get(path).set('Authorization', bearer(clientAdmin));
        expect(response.status).toBe(404);
      }
    });

    /**
     * One provider must not reach another provider's records.
     *
     * The first attempt at this test made a second provider organization so the property could be
     * exercised head-on. The database refused: `ux_organizations_service_provider` is a partial
     * unique index that permits exactly one row with `is_service_provider = true`, so a second
     * provider cannot exist in this schema at all. That is worth knowing and worth pinning, and
     * it is asserted below rather than assumed.
     *
     * What remains testable is the clause that would do the work if one ever did: the policy is
     * `app_tenant_is_provider() AND organization_id = app_tenant_id()`, and the second half is
     * proved by a row owned by a different organization staying invisible to the provider — even
     * to a raw query with no WHERE clause. The row is inserted with no tenant stamped, which the
     * policy admits for the reason migrations and seeds run that way.
     */
    it('keeps the provider out of records owned by any other organization', async () => {
      const [index] = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM pg_indexes
         WHERE indexname = 'ux_organizations_service_provider'`;
      // If this ever goes away, a second provider becomes possible and the clause below stops
      // being belt-and-braces and starts being the only thing separating two providers.
      expect(Number(index?.n)).toBe(1);

      const tenants = app.get(TenantContextService);
      const asTenant = <T>(organizationId: string | undefined, fn: () => Promise<T>) =>
        tenants.run({ organizationId }, async () => await fn());

      const foreignId = randomUUID();
      const FOREIGN_NAME = 'A record owned by somebody else';
      const ours = await prisma.clientBillingProfile.findFirstOrThrow({
        where: { organizationId: providerOrgId, clientOrganizationId: clientOrgId },
        select: { id: true },
      });

      await asTenant(
        undefined,
        () => prisma.$executeRaw`
          INSERT INTO client_billing_profiles
            (id, organization_id, client_organization_id, legal_name, address_line1, city, state,
             state_code, postal_code, country, created_at, updated_at)
          VALUES (${foreignId}::uuid, ${zenithOrgId}::uuid, ${clientOrgId}::uuid,
                  ${FOREIGN_NAME}, '1 Nowhere', 'Nowhere', 'Nowhere', '99', '000000', 'India',
                  now(), now())`,
      );

      try {
        const seen = await asTenant(
          providerOrgId,
          () => prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM client_billing_profiles`,
        );
        expect(seen.map((row) => row.id)).toContain(ours.id);
        expect(seen.map((row) => row.id)).not.toContain(foreignId);

        // The same fact one layer up: it does not reach the provider's own API either.
        const list = await api()
          .get('/api/v1/settings/billing/clients')
          .set('Authorization', bearer(director))
          .expect(200);
        expect(list.body.map((row: { legalName: string }) => row.legalName)).not.toContain(
          FOREIGN_NAME,
        );
      } finally {
        await asTenant(
          undefined,
          () =>
            prisma.$executeRaw`DELETE FROM client_billing_profiles WHERE id = ${foreignId}::uuid`,
        );
      }
    });

    /**
     * The migration adds a policy; it does not touch one.
     *
     * Widening `billing_profiles` was the alternative that was rejected — it would have handed one
     * tenant's banking details to another — so "no existing policy changed" is worth asserting
     * rather than remembering. Both halves are checked: the SQL that shipped, and what is live.
     */
    it('changed no existing row-level-security policy', async () => {
      const sql = await readFile(
        join(__dirname, '..', 'prisma', 'migrations', CLIENT_BILLING_MIGRATION, 'migration.sql'),
        'utf8',
      );
      expect(sql).not.toMatch(/DROP\s+POLICY/i);
      expect(sql).not.toMatch(/ALTER\s+POLICY/i);
      // Every table this migration touches, security or otherwise, is the new one.
      const touched = [...sql.matchAll(/(?:CREATE POLICY \w+ ON|ALTER TABLE)\s+"?(\w+)"?/gi)].map(
        (match) => match[1],
      );
      expect(touched.length).toBeGreaterThan(0);
      expect([...new Set(touched)]).toEqual(['client_billing_profiles']);

      const policies = await prisma.$queryRaw<Array<{ table: string; expression: string }>>`
        SELECT c.relname AS table, pg_get_expr(p.polqual, p.polrelid) AS expression
          FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
         WHERE c.relname IN ('billing_profiles', 'client_billing_profiles')`;
      const byTable = new Map(policies.map((row) => [row.table, row.expression]));
      // Unchanged, and meant to stay this strict: a provider, and only for its own row. This is
      // the policy that made the old client lookup impossible.
      expect(byTable.get('billing_profiles')).toBe(
        '((app_tenant_id() IS NULL) OR (app_tenant_is_provider() AND (organization_id = app_tenant_id())))',
      );
      // The new table is protected the same way, and forced so the table owner is bound too.
      expect(byTable.get('client_billing_profiles')).toBe(byTable.get('billing_profiles'));
      const [flags] = await prisma.$queryRaw<Array<{ enabled: boolean; forced: boolean }>>`
        SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
          FROM pg_class WHERE relname = 'client_billing_profiles'`;
      expect(flags).toEqual({ enabled: true, forced: true });
    });

    // -----------------------------------------------------------------------------------------
    // What ends up on the document.
    // -----------------------------------------------------------------------------------------

    it('freezes the client’s GSTIN and address into a new snapshot', async () => {
      const id = await draft();
      await issue(id);

      const row = await prisma.invoice.findUnique({ where: { id }, select: { snapshot: true } });
      const snapshot = row?.snapshot as {
        customer?: { name?: string; address?: string; gstin?: string; stateCode?: string };
      } | null;
      expect(snapshot?.customer).toMatchObject({
        name: acmeBilling.legalName,
        gstin: acmeBilling.gstin,
        stateCode: acmeBilling.stateCode,
      });
      expect(snapshot?.customer?.address).toContain('12 Marine Drive');
      expect(snapshot?.customer?.address).toContain('400020');
    });

    it('still issues and still renders for a client nobody has recorded', async () => {
      // The table is new, so on the day it ships every client is this case. An invoice must not
      // fail to issue because its recipient's particulars have not been filled in yet.
      const id = await draft({ clientOrganizationId: zenithOrgId, placeOfSupplyCode: '29' });
      const issued = await issue(id);
      expect(issued.body.status).toBe('ISSUED');
      expect(issued.body.pdfFileId).toBeTruthy();

      const row = await prisma.invoice.findUnique({ where: { id }, select: { snapshot: true } });
      const snapshot = row?.snapshot as {
        customer?: { name?: string; address?: string | null; gstin?: string | null };
      } | null;
      // It falls back to the organization's display name, exactly as before.
      expect(snapshot?.customer?.name).toBeTruthy();
      expect(snapshot?.customer?.address).toBeNull();
      expect(snapshot?.customer?.gstin).toBeNull();
    });
  });
});
