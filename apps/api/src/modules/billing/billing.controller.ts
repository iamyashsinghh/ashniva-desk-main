import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type BillingProfile,
  type CalculationPreview,
  type InvoiceDetail,
  type InvoiceSummary,
  type PaginatedResponse,
  type PaymentSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireRecentAuth } from '../../common/decorators/require-recent-auth.decorator';
import { BillingNotificationsService } from './billing-notifications.service';
import { BillingProfileService } from './billing-profile.service';
import {
  toBillingProfile,
  toCalculationPreview,
  toInvoiceDetail,
  toInvoiceSummary,
  toPaymentSummary,
} from './billing.mapper';
import {
  AllocatePaymentDto,
  CalculatePreviewDto,
  CreateInvoiceDto,
  InvoiceReasonDto,
  ListInvoicesQueryDto,
  ListPaymentsQueryDto,
  RecordPaymentDto,
  SaveBillingProfileDto,
  UpdateInvoiceDto,
} from './dto/billing.dto';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';

/**
 * Invoicing, from the provider's side.
 *
 * No endpoint accepts a total. Every figure on every response was computed by the API from the
 * line items — see `InvoicesService`.
 */
@ApiTags('Billing')
@ApiBearerAuth()
@Controller()
export class BillingController {
  constructor(
    private readonly profiles: BillingProfileService,
    private readonly invoices: InvoicesService,
    private readonly lifecycle: InvoiceLifecycleService,
    private readonly payments: PaymentsService,
    private readonly pdf: InvoicePdfService,
    private readonly notifications: BillingNotificationsService,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Billing profile
  // -------------------------------------------------------------------------------------------

  @Get('settings/billing')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Your own billing details and invoice numbering' })
  async profile(@CurrentUser() actor: AuthenticatedUser): Promise<BillingProfile | null> {
    const row = await this.profiles.get(actor);
    return row ? toBillingProfile(row) : null;
  }

  /**
   * The billing profile carries `bankDetails` — the account every invoice tells a client to pay
   * into. Changing it is a payee change, so it is no longer reachable with the permission that
   * edits a draft line item, and it asks for the password again.
   */
  @Put('settings/billing')
  @RequirePermissions(PERMISSIONS.BILLING_PROFILE_MANAGE)
  @RequireRecentAuth()
  @ApiOperation({
    summary: 'Save the billing profile',
    description:
      'The invoice sequence is not writable here: a form that could reset it is a form that ' +
      'can produce a duplicate invoice number.',
  })
  async saveProfile(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveBillingProfileDto,
  ): Promise<BillingProfile> {
    return toBillingProfile(await this.profiles.save(actor, dto));
  }

  // -------------------------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------------------------

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Invoices for this organization, newest first' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListInvoicesQueryDto,
  ): Promise<PaginatedResponse<InvoiceSummary>> {
    const { items, nextCursor, total } = await this.invoices.list(actor, query);
    return { items: items.map(toInvoiceSummary), nextCursor, total };
  }

  @Get('invoices/:id')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'One invoice with its lines, tax breakdown, payments and history' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceDetail> {
    return toInvoiceDetail(await this.invoices.detail(actor, id));
  }

  @Post('invoices/calculate')
  @RequirePermissions(PERMISSIONS.INVOICE_WRITE)
  @ApiOperation({
    summary: 'What these lines would come to',
    description: 'Runs the same calculation the saved invoice uses, so the two cannot disagree.',
  })
  async calculate(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CalculatePreviewDto,
  ): Promise<CalculationPreview> {
    const { result, supplyType } = await this.invoices.preview(actor, dto);
    return toCalculationPreview(
      result,
      supplyType,
      dto.lines.map((line) => ({ unit: line.unit, discountPercent: line.discountPercent })),
    );
  }

  @Post('invoices')
  @RequirePermissions(PERMISSIONS.INVOICE_WRITE)
  @ApiOperation({ summary: 'Create a draft invoice' })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ): Promise<InvoiceDetail> {
    return toInvoiceDetail(await this.invoices.create(actor, dto));
  }

  @Patch('invoices/:id')
  @RequirePermissions(PERMISSIONS.INVOICE_WRITE)
  @ApiOperation({
    summary: 'Edit a draft invoice',
    description: 'Only a draft. An issued invoice is corrected with a credit note.',
  })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ): Promise<InvoiceDetail> {
    return toInvoiceDetail(await this.invoices.update(actor, id, dto));
  }

  @Post('invoices/:id/issue')
  @RequirePermissions(PERMISSIONS.INVOICE_ISSUE)
  @ApiOperation({
    summary: 'Issue the invoice',
    description:
      'Assigns the next number in the financial year, freezes a supplier/customer snapshot ' +
      'and closes the invoice to editing. The number is taken with the profile row locked, so ' +
      'two concurrent issues cannot be given the same one.',
  })
  async issue(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceDetail> {
    const issued = await this.lifecycle.issue(actor, id);
    await this.pdf.generate(issued, actor.userId);
    const withPdf = await this.invoices.detail(actor, id);
    await this.notifications.invoiceIssued(withPdf, actor.userId);
    return toInvoiceDetail(withPdf);
  }

  @Get('invoices/:id/pdf')
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'The stored PDF file id, for download through the files endpoint' })
  async pdfFile(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ fileId: string }> {
    const invoice = await this.invoices.detail(actor, id);
    if (!invoice.pdfFileId) {
      throw new NotFoundException('This invoice has no PDF yet; issue it first');
    }
    return { fileId: invoice.pdfFileId };
  }

  /**
   * Cancel and void are not the same act and no longer share a permission.
   *
   * Void keeps a spent number against a document a client relied on; cancel withdraws a draft
   * nobody was ever sent. Sharing `invoice:void` meant the ordinary correction — a manager
   * withdrawing their own wrong draft — was reachable only by an administrator.
   */
  @Post('invoices/:id/cancel')
  @RequirePermissions(PERMISSIONS.INVOICE_CANCEL)
  @ApiOperation({ summary: 'Withdraw an invoice nobody has relied on' })
  async cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceReasonDto,
  ): Promise<InvoiceDetail> {
    const cancelled = await this.lifecycle.close(actor, id, 'cancel', dto.reason);
    await this.notifications.invoiceCancelled(cancelled, dto.reason, actor.userId);
    return toInvoiceDetail(cancelled);
  }

  @Post('invoices/:id/void')
  @RequirePermissions(PERMISSIONS.INVOICE_VOID)
  // Irreversible, and it changes a document an auditor will read. The password prompt is the same
  // one that guards role changes and stored credentials.
  @RequireRecentAuth()
  @ApiOperation({
    summary: 'Void an issued invoice',
    description: 'The number stays in the sequence and is never reused.',
  })
  async void(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceReasonDto,
  ): Promise<InvoiceDetail> {
    const voided = await this.lifecycle.close(actor, id, 'void', dto.reason);
    await this.notifications.invoiceCancelled(voided, dto.reason, actor.userId);
    return toInvoiceDetail(voided);
  }

  @Post('invoices/:id/reminder')
  @RequirePermissions(PERMISSIONS.INVOICE_WRITE)
  @ApiOperation({ summary: 'Record that a payment reminder was sent' })
  async reminder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvoiceDetail> {
    return toInvoiceDetail(await this.lifecycle.markReminded(actor, id));
  }

  // -------------------------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------------------------

  @Get('payments')
  @RequirePermissions(PERMISSIONS.PAYMENT_READ)
  @ApiOperation({ summary: 'Payments received, newest first' })
  async listPayments(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaginatedResponse<PaymentSummary>> {
    const { items, nextCursor, total } = await this.payments.list(actor, query);
    return { items: items.map(toPaymentSummary), nextCursor, total };
  }

  @Post('payments')
  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  // Asserts that money arrived, and auto-allocation then settles invoices against it.
  @RequireRecentAuth()
  @ApiOperation({
    summary: 'Record a payment and apply it',
    description:
      'The reference is unique per organization, so the same transfer cannot be entered ' +
      'twice. Leave the allocations out to settle open invoices oldest first.',
  })
  async recordPayment(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RecordPaymentDto,
  ): Promise<PaymentSummary> {
    return toPaymentSummary(await this.payments.record(actor, dto));
  }

  @Post('payments/:id/allocate')
  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Apply more of an existing payment to invoices' })
  async allocatePayment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllocatePaymentDto,
  ): Promise<PaymentSummary> {
    return toPaymentSummary(await this.payments.allocate(actor, id, dto.allocations));
  }
}
