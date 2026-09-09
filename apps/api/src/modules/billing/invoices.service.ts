import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  isInvoiceEditable,
  type AuthenticatedUser,
  type InvoiceStatus,
  type TaxTreatment,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import { BillingRepository, type InvoiceDetailRow } from './billing.repository';
import { calculateInvoice, supplyTypeFor } from './invoice-calculator';
import { toLineInput } from './invoice-line-input';
import { financialYearOf } from './invoice-numbering';
import {
  addDays,
  breakdownFor,
  linesFor,
  toLineDto,
  totalsFor,
  type LineInputDto,
} from './invoice-rows';
import { amountInWords } from './money';

export type { LineInputDto } from './invoice-rows';

export interface CreateInvoiceInput {
  clientOrganizationId: string;
  projectId?: string;
  contractId?: string;
  milestoneId?: string;
  changeRequestId?: string;
  issueDate: string;
  dueDate?: string;
  placeOfSupplyState: string;
  placeOfSupplyCode: string;
  taxTreatment?: TaxTreatment;
  reverseCharge?: boolean;
  isExport?: boolean;
  isExempt?: boolean;
  notes?: string;
  internalNotes?: string;
  lines: LineInputDto[];
}

/**
 * Invoices.
 *
 * Two things this service will not do, and both are deliberate. It never accepts a total from
 * the caller — every figure is recomputed here from the line items, because a browser that
 * calculates its own tax is a browser that can be told to calculate less of it. And it never
 * edits an issued invoice: a tax document that changes after it has been sent is not a document
 * anyone can rely on.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  list(
    actor: AuthenticatedUser,
    query: {
      status?: InvoiceStatus[];
      clientOrganizationId?: string;
      projectId?: string;
      search?: string;
      issuedFrom?: string;
      issuedTo?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    return this.repository.list({
      organizationId: actor.organizationId,
      status: query.status,
      clientOrganizationId: query.clientOrganizationId,
      projectId: query.projectId,
      search: query.search?.trim() || undefined,
      issuedFrom: query.issuedFrom ? new Date(query.issuedFrom) : undefined,
      issuedTo: query.issuedTo ? new Date(query.issuedTo) : undefined,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<InvoiceDetailRow> {
    const row = await this.repository.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Invoice not found');
    }
    return row;
  }

  // -------------------------------------------------------------------------------------------
  // Calculation
  // -------------------------------------------------------------------------------------------

  /**
   * What an invoice would come to.
   *
   * The same function the real invoice uses, so a preview cannot disagree with what is saved.
   */
  async preview(
    actor: AuthenticatedUser,
    input: {
      lines: LineInputDto[];
      placeOfSupplyCode: string;
      taxTreatment?: TaxTreatment;
      reverseCharge?: boolean;
      isExport?: boolean;
      isExempt?: boolean;
    },
  ) {
    const profile = await this.requireProfile(actor.organizationId);
    const supplyType = supplyTypeFor(profile.stateCode, input.placeOfSupplyCode, {
      export: input.isExport,
      exempt: input.isExempt,
    });

    const result = calculateInvoice({
      lines: input.lines.map((line) => toLineInput(line, profile.defaultTaxRate)),
      supplyType,
      taxTreatment: input.taxTreatment ?? (profile.defaultTaxTreatment as TaxTreatment),
      reverseCharge: input.reverseCharge,
      roundTotal: profile.roundTotals,
    });

    return { result, supplyType, currency: profile.currency };
  }

  // -------------------------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------------------------

  async create(actor: AuthenticatedUser, input: CreateInvoiceInput): Promise<InvoiceDetailRow> {
    const profile = await this.requireProfile(actor.organizationId);
    await this.assertClient(actor.organizationId, input.clientOrganizationId);

    if (input.lines.length === 0) {
      throw new BadRequestException('An invoice needs at least one line');
    }

    const issueDate = new Date(input.issueDate);
    assertNotFutureDated(issueDate);
    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : addDays(issueDate, profile.paymentTermsDays);
    if (dueDate < issueDate) {
      throw new BadRequestException('The due date cannot be before the issue date');
    }

    const supplyType = supplyTypeFor(profile.stateCode, input.placeOfSupplyCode, {
      export: input.isExport,
      exempt: input.isExempt,
    });
    const taxTreatment = input.taxTreatment ?? (profile.defaultTaxTreatment as TaxTreatment);
    const calculation = calculateInvoice({
      lines: input.lines.map((line) => toLineInput(line, profile.defaultTaxRate)),
      supplyType,
      taxTreatment,
      reverseCharge: input.reverseCharge,
      roundTotal: profile.roundTotals,
    });

    // A draft carries no number: numbers are handed out at issue, so an abandoned draft does not
    // leave a hole in the sequence an auditor would ask about.
    const draftLabel = `DRAFT-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const row = await this.prisma.invoice.create({
      data: {
        organizationId: actor.organizationId,
        clientOrganizationId: input.clientOrganizationId,
        number: 0,
        numberLabel: draftLabel,
        financialYear: financialYearOf(issueDate, profile.financialYearStartMonth),
        status: 'DRAFT',
        projectId: input.projectId ?? null,
        contractId: input.contractId ?? null,
        milestoneId: input.milestoneId ?? null,
        changeRequestId: input.changeRequestId ?? null,
        issueDate,
        dueDate,
        currency: profile.currency,
        placeOfSupplyState: input.placeOfSupplyState,
        placeOfSupplyCode: input.placeOfSupplyCode,
        supplyType,
        taxTreatment,
        reverseCharge: input.reverseCharge ?? false,
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        createdById: actor.userId,
        ...totalsFor(calculation),
        amountInWords: amountInWords(calculation.total),
        lineItems: { create: linesFor(calculation, input.lines) },
        taxBreakdown: { create: breakdownFor(calculation) },
      },
      include: { lineItems: true },
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.INVOICE_CREATED,
      entityType: AUDIT_ENTITY_TYPE.INVOICE,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: { clientOrganizationId: input.clientOrganizationId, total: row.total.toFixed(2) },
    });

    return this.detail(actor, row.id);
  }

  /** Replaces a draft's contents. Everything is recalculated; nothing is patched in place. */
  async update(
    actor: AuthenticatedUser,
    id: string,
    input: Partial<CreateInvoiceInput>,
  ): Promise<InvoiceDetailRow> {
    const current = await this.detail(actor, id);
    this.assertEditable(current);

    const profile = await this.requireProfile(actor.organizationId);
    const lines = input.lines ?? current.lineItems.map(toLineDto);
    if (lines.length === 0) {
      throw new BadRequestException('An invoice needs at least one line');
    }

    const issueDate = input.issueDate ? new Date(input.issueDate) : current.issueDate;
    assertNotFutureDated(issueDate);
    const dueDate = input.dueDate ? new Date(input.dueDate) : current.dueDate;
    if (dueDate < issueDate) {
      throw new BadRequestException('The due date cannot be before the issue date');
    }

    const placeOfSupplyCode = input.placeOfSupplyCode ?? current.placeOfSupplyCode;
    // Export and exempt are not stored as their own columns — they are folded into `supplyType` —
    // so an omitted field has to fall back to what the invoice already is. Reading `input` alone
    // would turn an export draft back into a domestic one, with GST added, on a patch that only
    // changed the notes.
    const supplyType = supplyTypeFor(profile.stateCode, placeOfSupplyCode, {
      export: input.isExport ?? current.supplyType === 'EXPORT',
      exempt: input.isExempt ?? current.supplyType === 'EXEMPT',
    });
    const taxTreatment = input.taxTreatment ?? (current.taxTreatment as TaxTreatment);
    const reverseCharge = input.reverseCharge ?? current.reverseCharge;

    const calculation = calculateInvoice({
      lines: lines.map((line) => toLineInput(line, profile.defaultTaxRate)),
      supplyType,
      taxTreatment,
      reverseCharge,
      roundTotal: profile.roundTotals,
    });

    await this.prisma.$transaction(async (tx) => {
      // Still a draft, checked in the same transaction that rewrites it. `assertEditable` above
      // runs on a row read earlier, so a PATCH whose read lands just before a concurrent Issue
      // commits would otherwise rewrite an ISSUED invoice — new line items, new totals, and
      // `totalsFor` resetting `amountPaid` to zero — while it keeps its number, its frozen
      // snapshot and the PDF already sent to the client.
      const claimed = await tx.invoice.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          issueDate,
          dueDate,
          financialYear: financialYearOf(issueDate, profile.financialYearStartMonth),
          placeOfSupplyState: input.placeOfSupplyState ?? current.placeOfSupplyState,
          placeOfSupplyCode,
          supplyType,
          taxTreatment,
          reverseCharge,
          ...(input.projectId === undefined ? {} : { projectId: input.projectId || null }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          ...(input.internalNotes === undefined ? {} : { internalNotes: input.internalNotes }),
          ...totalsFor(calculation),
          amountInWords: amountInWords(calculation.total),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'This invoice is no longer a draft. Reload it before editing again.',
        );
      }

      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceTaxBreakdown.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLineItem.createMany({
        data: linesFor(calculation, lines).map((line) => ({ ...line, invoiceId: id })),
      });
      await tx.invoiceTaxBreakdown.createMany({
        data: breakdownFor(calculation).map((row) => ({ ...row, invoiceId: id })),
      });
    });

    return this.detail(actor, id);
  }

  // -------------------------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------------------------

  private assertEditable(row: InvoiceDetailRow): void {
    if (!isInvoiceEditable(row.status as InvoiceStatus)) {
      throw new ConflictException(
        `An invoice that is ${row.status} cannot be edited. Raise a credit note instead.`,
      );
    }
  }

  private async requireProfile(organizationId: string) {
    const profile = await this.repository.findProfile(organizationId);
    if (!profile) {
      throw new BadRequestException('Set up your billing profile before working with invoices');
    }
    return profile;
  }

  /** The client must belong to this provider, so an invoice cannot be addressed anywhere. */
  private async assertClient(organizationId: string, clientOrganizationId: string): Promise<void> {
    const client = await this.prisma.organization.findFirst({
      where: { id: clientOrganizationId, deletedAt: null, isServiceProvider: false },
      select: { id: true },
    });
    if (!client) {
      throw new BadRequestException('That client organization does not exist');
    }
    if (clientOrganizationId === organizationId) {
      throw new BadRequestException('An invoice cannot be addressed to your own organization');
    }
  }
}

/**
 * An invoice cannot be dated in the future.
 *
 * Not a formality. The financial year comes from the issue date, and issuing an invoice in a
 * later year moves the profile's whole numbering series into that year — a typo of 2030 in a date
 * picker labels every invoice for the next four real years `INV/2029-30/…` and stops the current
 * series dead, with `nextSequence` deliberately not writable through the API to put it back.
 *
 * A day of slack absorbs clock skew and the client's timezone; nothing legitimate needs more.
 */
function assertNotFutureDated(issueDate: Date): void {
  const limit = new Date();
  limit.setUTCDate(limit.getUTCDate() + 1);
  if (issueDate > limit) {
    throw new BadRequestException('An invoice cannot be dated in the future');
  }
}
