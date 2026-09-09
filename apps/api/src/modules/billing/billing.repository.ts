import { Injectable } from '@nestjs/common';
import { CLIENT_VISIBLE_INVOICE_STATUSES, type InvoiceStatus } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const detailInclude = {
  clientOrganization: { select: { id: true, name: true } },
  lineItems: { orderBy: { position: 'asc' } },
  taxBreakdown: { orderBy: { taxRate: 'desc' } },
  allocations: {
    include: {
      payment: { select: { id: true, reference: true, method: true, paidAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  history: {
    include: { changedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.InvoiceInclude;

const summaryInclude = {
  clientOrganization: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceInclude;

/** The client's display name travels with the record, so a screen can name who it is about. */
const clientProfileInclude = {
  clientOrganization: { select: { id: true, name: true } },
} satisfies Prisma.ClientBillingProfileInclude;

export type InvoiceDetailRow = Prisma.InvoiceGetPayload<{ include: typeof detailInclude }>;
export type InvoiceSummaryRow = Prisma.InvoiceGetPayload<{ include: typeof summaryInclude }>;
export type BillingProfileRow = Prisma.BillingProfileGetPayload<object>;
export type ClientBillingProfileRow = Prisma.ClientBillingProfileGetPayload<{
  include: typeof clientProfileInclude;
}>;
export type PaymentRow = Prisma.PaymentGetPayload<{
  include: {
    clientOrganization: { select: { id: true; name: true } };
    recordedBy: { select: { name: true } };
  };
}>;

export interface InvoiceListFilter {
  organizationId: string;
  status?: InvoiceStatus[];
  clientOrganizationId?: string;
  projectId?: string;
  /** Matches the invoice number label or the client name. */
  search?: string;
  issuedFrom?: Date;
  issuedTo?: Date;
  limit: number;
  cursor?: string;
}

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------------------------
  // Billing profile
  // -------------------------------------------------------------------------------------------

  findProfile(organizationId: string): Promise<BillingProfileRow | null> {
    return this.prisma.billingProfile.findUnique({ where: { organizationId } });
  }

  upsertProfile(
    organizationId: string,
    data: Omit<Prisma.BillingProfileUncheckedCreateInput, 'organizationId'>,
  ): Promise<BillingProfileRow> {
    return this.prisma.billingProfile.upsert({
      where: { organizationId },
      create: { ...data, organizationId },
      update: data,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Client billing profiles — the provider's record of how each client is invoiced
  //
  // Every method is keyed on the *provider's* organizationId as well as the client's. The row
  // belongs to the provider, so that pair is the identity; passing only a client id is how the
  // old `findProfile(clientOrganizationId)` call came to ask a question with no answer.
  // -------------------------------------------------------------------------------------------

  findClientProfile(
    organizationId: string,
    clientOrganizationId: string,
  ): Promise<ClientBillingProfileRow | null> {
    return this.prisma.clientBillingProfile.findUnique({
      where: { organizationId_clientOrganizationId: { organizationId, clientOrganizationId } },
      include: clientProfileInclude,
    });
  }

  listClientProfiles(organizationId: string): Promise<ClientBillingProfileRow[]> {
    return this.prisma.clientBillingProfile.findMany({
      where: { organizationId },
      include: clientProfileInclude,
      orderBy: { legalName: 'asc' },
    });
  }

  upsertClientProfile(
    organizationId: string,
    clientOrganizationId: string,
    data: Omit<
      Prisma.ClientBillingProfileUncheckedCreateInput,
      'organizationId' | 'clientOrganizationId'
    >,
  ): Promise<ClientBillingProfileRow> {
    return this.prisma.clientBillingProfile.upsert({
      where: { organizationId_clientOrganizationId: { organizationId, clientOrganizationId } },
      create: { ...data, organizationId, clientOrganizationId },
      update: data,
      include: clientProfileInclude,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------------------------

  async list(
    filter: InvoiceListFilter,
  ): Promise<{ items: InvoiceSummaryRow[]; nextCursor: string | null; total: number }> {
    const where = this.whereFor(filter);
    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  /**
   * Portal list. Separate from `list` rather than a flag on it, because the two differ in the
   * column they scope by *and* in the statuses they may return — and a status filter that can be
   * relaxed by a parameter is exactly the kind that gets relaxed.
   */
  async listForClient(filter: {
    clientOrganizationId: string;
    status?: InvoiceStatus[];
    limit: number;
    cursor?: string;
  }): Promise<{ items: InvoiceSummaryRow[]; nextCursor: string | null; total: number }> {
    const where: Prisma.InvoiceWhereInput = {
      clientOrganizationId: filter.clientOrganizationId,
      deletedAt: null,
      // Stated as the set that IS visible, never as the complement of the hidden one. Written as
      // `notIn: ['DRAFT','CANCELLED']` this widened itself: adding any member to `InvoiceStatus`
      // — a `DISPUTED`, say — would have made it client-visible here with no code change and no
      // review, while the PDF download stayed refused by both the service and the RLS policy.
      status: filter.status?.length
        ? { in: filter.status.filter((s) => CLIENT_VISIBLE_INVOICE_STATUSES.includes(s)) }
        : { in: [...CLIENT_VISIBLE_INVOICE_STATUSES] },
    };
    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  findDetail(organizationId: string, id: string): Promise<InvoiceDetailRow | null> {
    return this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: detailInclude,
    });
  }

  /** Portal read: the client's own organization, and only a status the client may see. */
  findForClient(clientOrganizationId: string, id: string): Promise<InvoiceDetailRow | null> {
    return this.prisma.invoice.findFirst({
      where: {
        id,
        clientOrganizationId,
        deletedAt: null,
        status: { in: [...CLIENT_VISIBLE_INVOICE_STATUSES] },
      },
      include: detailInclude,
    });
  }

  update(id: string, data: Prisma.InvoiceUncheckedUpdateInput): Promise<InvoiceDetailRow> {
    return this.prisma.invoice.update({ where: { id }, data, include: detailInclude });
  }

  /**
   * Moves an invoice from one status to another, and says whether it was still in the first one.
   *
   * For the background sweep, which reads a batch and then writes each row: a payment committing
   * between the two would otherwise be overwritten, leaving a settled invoice marked OVERDUE with
   * a zero balance.
   */
  async transitionStatus(id: string, from: InvoiceStatus, to: InvoiceStatus): Promise<boolean> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, status: from },
      data: { status: to },
    });
    return count > 0;
  }

  /** Invoices that are past due and still owe money, for the overdue sweep. */
  overdueCandidates(now: Date, limit = 500): Promise<{ id: string; organizationId: string }[]> {
    return this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueDate: { lt: now },
        balanceDue: { gt: 0 },
      },
      select: { id: true, organizationId: true },
      take: limit,
    });
  }

  /** Invoices due within the window, for the "payment due soon" reminder. */
  dueSoon(from: Date, to: Date, limit = 500): Promise<{ id: string; organizationId: string }[]> {
    return this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueDate: { gte: from, lte: to },
        balanceDue: { gt: 0 },
      },
      select: { id: true, organizationId: true },
      take: limit,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------------------------

  async listPayments(filter: {
    organizationId: string;
    clientOrganizationId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: PaymentRow[]; nextCursor: string | null; total: number }> {
    const where: Prisma.PaymentWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.clientOrganizationId ? { clientOrganizationId: filter.clientOrganizationId } : {}),
    };
    const include = {
      clientOrganization: { select: { id: true, name: true } },
      recordedBy: { select: { name: true } },
    } as const;

    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include,
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  findPayment(organizationId: string, id: string): Promise<PaymentRow | null> {
    return this.prisma.payment.findFirst({
      where: { id, organizationId },
      include: {
        clientOrganization: { select: { id: true, name: true } },
        recordedBy: { select: { name: true } },
      },
    });
  }

  /** Open invoices for a client, oldest first — the order auto-allocation applies them in. */
  openInvoicesFor(
    organizationId: string,
    clientOrganizationId: string,
  ): Promise<
    { id: string; status: string; balanceDue: Prisma.Decimal; dueDate: Date; currency: string }[]
  > {
    return this.prisma.invoice.findMany({
      where: {
        organizationId,
        clientOrganizationId,
        deletedAt: null,
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
        balanceDue: { gt: 0 },
      },
      // `currency` is selected because the allocator refuses to mix currencies, and it can only
      // do that if it is told what the invoice is denominated in.
      select: { id: true, status: true, balanceDue: true, dueDate: true, currency: true },
      orderBy: { issueDate: 'asc' },
    });
  }

  private whereFor(filter: InvoiceListFilter): Prisma.InvoiceWhereInput {
    return {
      organizationId: filter.organizationId,
      deletedAt: null,
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      ...(filter.clientOrganizationId ? { clientOrganizationId: filter.clientOrganizationId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.issuedFrom || filter.issuedTo
        ? {
            issueDate: {
              ...(filter.issuedFrom ? { gte: filter.issuedFrom } : {}),
              ...(filter.issuedTo ? { lte: filter.issuedTo } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { numberLabel: { contains: filter.search, mode: 'insensitive' } },
              { clientOrganization: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }
}
