import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AuthenticatedUser,
  PaginatedResponse,
  PortalInvoiceDetail,
  PortalInvoiceSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BillingRepository } from './billing.repository';
import { ListPaymentsQueryDto } from './dto/billing.dto';
import { toPortalInvoiceDetail, toPortalInvoiceSummary } from './portal-billing.mapper';

/**
 * Invoices as a client sees them.
 *
 * Three things separate this from the internal controller, and none of them is a parameter that
 * could be flipped: the scope column is `clientOrganizationId`, drafts and cancelled invoices
 * are excluded at the repository, and the response types have no field for internal notes or
 * the document history to be mapped into.
 *
 * No `invoice:read` permission here, deliberately. That key guards the *internal* invoice and
 * billing-profile routes, so granting it to a client role to make the portal work would open
 * those routes to them as well. Portal membership plus the organization scope is the
 * authorisation, exactly as it is for portal release notes.
 */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal/invoices')
export class PortalBillingController {
  constructor(private readonly repository: BillingRepository) {}

  @Get()
  @ApiOperation({ summary: 'Your invoices, newest first' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaginatedResponse<PortalInvoiceSummary>> {
    const { items, nextCursor, total } = await this.repository.listForClient({
      clientOrganizationId: actor.organizationId,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });
    return { items: items.map(toPortalInvoiceSummary), nextCursor, total };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of your invoices, with its lines and tax breakdown' })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalInvoiceDetail> {
    const row = await this.repository.findForClient(actor.organizationId, id);
    if (!row) {
      // The same answer for "does not exist", "belongs to another client" and "is still a
      // draft": the caller learns nothing either way.
      throw new NotFoundException('Invoice not found');
    }
    return toPortalInvoiceDetail(row);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'The PDF file id for one of your invoices' })
  async pdf(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ fileId: string }> {
    const row = await this.repository.findForClient(actor.organizationId, id);
    if (!row?.pdfFileId) {
      throw new NotFoundException('Invoice not found');
    }
    return { fileId: row.pdfFileId };
  }
}
