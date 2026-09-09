import { Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, type AuthenticatedUser } from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { BillingRepository, type BillingProfileRow } from './billing.repository';
import { parseScaled } from './money';
import type { SaveBillingProfileDto } from './dto/billing.dto';

/**
 * An optional free-text column across a full replace.
 *
 * Absent means "not mentioned", so the stored value stands; a value that is present but blank is
 * someone clearing the field, so it becomes null.
 */
function keptText(incoming: string | undefined, stored: string | null | undefined): string | null {
  if (incoming === undefined) {
    return stored ?? null;
  }
  return incoming.trim() || null;
}

/**
 * What the audit entry records, before and after.
 *
 * The narrow pair this used to log — legal name and GSTIN — left the one change the password
 * prompt exists to protect invisible: someone could redirect the payee bank account and the audit
 * would say the profile was updated and nothing more. Every field printed on an invoice or used
 * to compute one is included. `internalNotes` is left out: it is private working text, it changes
 * often, and it appears on no document. Nothing here is a credential — `bankDetails` is printed
 * on every invoice the client receives.
 */
function auditable(row: BillingProfileRow) {
  return {
    legalName: row.legalName,
    address: [row.addressLine1, row.addressLine2, row.city, row.state, row.postalCode, row.country]
      .filter(Boolean)
      .join(', '),
    stateCode: row.stateCode,
    gstin: row.gstin,
    pan: row.pan,
    email: row.email,
    phone: row.phone,
    // The payee. This is the field the re-authentication guard on the route is there for.
    bankDetails: row.bankDetails,
    currency: row.currency,
    paymentTermsDays: row.paymentTermsDays,
    defaultTaxRate: row.defaultTaxRate.toFixed(2),
    defaultTaxTreatment: row.defaultTaxTreatment,
    roundTotals: row.roundTotals,
    invoicePrefix: row.invoicePrefix,
    financialYearStartMonth: row.financialYearStartMonth,
    logoFileId: row.logoFileId,
    signatureFileId: row.signatureFileId,
    terms: row.terms,
  };
}

/**
 * The tenant's own billing identity.
 *
 * The numbering state lives on the same row but is never writable from here: a settings form
 * that could reset `nextSequence` is a settings form that can produce a duplicate invoice
 * number, and duplicates are exactly what an auditor looks for.
 */
@Injectable()
export class BillingProfileService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  get(actor: AuthenticatedUser): Promise<BillingProfileRow | null> {
    return this.repository.findProfile(actor.organizationId);
  }

  async require(actor: AuthenticatedUser): Promise<BillingProfileRow> {
    const profile = await this.get(actor);
    if (!profile) {
      throw new NotFoundException('No billing profile has been set up yet');
    }
    return profile;
  }

  /**
   * A full replace of the profile — but an absent optional keeps what is stored rather than
   * reverting to the type's default.
   *
   * The settings form does not carry every column: it has no logo, no signature and (before this
   * was fixed) no financial-year start. Coercing each absent key to a default meant one save from
   * that form silently deleted the logo and moved the invoice year label, which is the label
   * printed on every invoice number afterwards. Any client that sends a subset is now safe, and a
   * value is only cleared when it is sent as an explicit empty string.
   */
  async save(actor: AuthenticatedUser, input: SaveBillingProfileDto): Promise<BillingProfileRow> {
    const existing = await this.get(actor);

    const row = await this.repository.upsertProfile(actor.organizationId, {
      legalName: input.legalName.trim(),
      addressLine1: input.addressLine1.trim(),
      addressLine2: keptText(input.addressLine2, existing?.addressLine2),
      city: input.city.trim(),
      state: input.state.trim(),
      stateCode: input.stateCode,
      postalCode: input.postalCode.trim(),
      country: input.country?.trim() || existing?.country || 'India',
      gstin: keptText(input.gstin, existing?.gstin),
      pan: keptText(input.pan, existing?.pan),
      email: input.email.trim(),
      phone: keptText(input.phone, existing?.phone),
      currency: input.currency?.trim().toUpperCase() || existing?.currency || 'INR',
      paymentTermsDays: input.paymentTermsDays ?? existing?.paymentTermsDays ?? 30,
      // numeric(5,2): more precision than that would be stored rounded.
      defaultTaxRate:
        input.defaultTaxRate === undefined
          ? (existing?.defaultTaxRate ?? parseScaled('18', 2, 'The default tax rate'))
          : parseScaled(input.defaultTaxRate, 2, 'The default tax rate'),
      defaultTaxTreatment:
        input.defaultTaxTreatment ?? existing?.defaultTaxTreatment ?? 'EXCLUSIVE',
      roundTotals: input.roundTotals ?? existing?.roundTotals ?? true,
      invoicePrefix: input.invoicePrefix ?? existing?.invoicePrefix ?? 'INV',
      financialYearStartMonth:
        input.financialYearStartMonth ?? existing?.financialYearStartMonth ?? 4,
      // Stored but not yet printed — see the note on `logoFileId` in the DTO.
      logoFileId: input.logoFileId ?? existing?.logoFileId ?? null,
      signatureFileId: input.signatureFileId ?? existing?.signatureFileId ?? null,
      bankDetails: keptText(input.bankDetails, existing?.bankDetails),
      terms: keptText(input.terms, existing?.terms),
      internalNotes: keptText(input.internalNotes, existing?.internalNotes),
      // nextSequence and sequenceYear are absent by design: only `issue` advances them, inside
      // the transaction that uses the number.
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.BILLING_PROFILE_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.INVOICE,
      entityId: row.id,
      organizationId: actor.organizationId,
      before: existing ? auditable(existing) : undefined,
      after: auditable(row),
    });

    return row;
  }
}
