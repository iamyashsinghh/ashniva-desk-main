import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  REAUTH_HEADER,
  type AuthenticatedUser,
  type ContractDetail,
  type ContractHourBalance,
  type ContractSummary,
  type HourLedgerEntry,
  type PaginatedResponse,
  type PaymentMilestoneSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireRecentAuth } from '../../common/decorators/require-recent-auth.decorator';
import { ContractsService } from './contracts.service';
import {
  HourMovementDto,
  LedgerQueryDto,
  PaymentMilestoneDto,
  UpdatePaymentMilestoneDto,
} from './dto/contract-extras.dto';
import { CreateContractDto, ListContractsQueryDto, UpdateContractDto } from './dto/contract.dto';
import { PaymentMilestonesService } from './payment-milestones.service';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly payments: PaymentMilestonesService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({
    summary: 'Contracts with status, dates and remaining hours (paginated, filterable)',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListContractsQueryDto,
  ): Promise<PaginatedResponse<ContractSummary>> {
    return this.contracts.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @ApiOperation({ summary: 'Create a contract (draft or active)' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateContractDto,
  ): Promise<ContractDetail> {
    return this.contracts.create(actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({
    summary: 'Contract detail: milestones, payment milestones, documents, recent ledger',
  })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContractDetail> {
    return this.contracts.get(actor, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @ApiOperation({ summary: 'Edit a contract' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ): Promise<ContractDetail> {
    return this.contracts.update(actor, id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @ApiOperation({ summary: 'Archive a contract (read-only afterwards)' })
  archive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContractDetail> {
    return this.contracts.archive(actor, id);
  }

  @Get(':id/ledger')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({ summary: 'Complete hour-ledger history (paginated)' })
  ledger(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LedgerQueryDto,
  ): Promise<PaginatedResponse<HourLedgerEntry>> {
    return this.contracts.ledgerPage(actor, id, query);
  }

  @Post(':id/hours')
  @RequirePermissions(PERMISSIONS.CONTRACT_ADJUST_HOURS)
  @RequireRecentAuth()
  @ApiHeader({ name: REAUTH_HEADER, description: 'Token from POST /auth/reauth', required: true })
  @ApiOperation({
    summary: 'Add purchased hours, reserve/release, or adjust with a mandatory reason (re-auth)',
  })
  moveHours(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HourMovementDto,
  ): Promise<ContractHourBalance> {
    return this.contracts.moveHours(actor, id, dto);
  }

  @Post(':id/payment-milestones')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @ApiOperation({ summary: 'Add a payment milestone' })
  addPayment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentMilestoneDto,
  ): Promise<PaymentMilestoneSummary> {
    return this.payments.add(actor, id, dto);
  }

  @Patch(':id/payment-milestones/:paymentId')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @ApiOperation({ summary: 'Edit a payment milestone (status, amount, invoice reference)' })
  updatePayment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdatePaymentMilestoneDto,
  ): Promise<PaymentMilestoneSummary> {
    return this.payments.update(actor, id, paymentId, dto);
  }

  @Delete(':id/payment-milestones/:paymentId')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a payment milestone' })
  removePayment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<void> {
    return this.payments.remove(actor, id, paymentId);
  }
}
