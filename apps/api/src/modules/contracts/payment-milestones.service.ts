import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type PaymentMilestoneSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { toDateOrNull } from './contract-patch';
import { toPaymentMilestone } from './contracts.mapper';
import { ContractsRepository, type ContractDetailRow } from './contracts.repository';
import type { PaymentMilestoneDto, UpdatePaymentMilestoneDto } from './dto/contract-extras.dto';

/** Payment milestones of a contract (pending → invoiced → paid), optionally tied to a delivery milestone. */
@Injectable()
export class PaymentMilestonesService {
  constructor(
    private readonly contracts: ContractsRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async add(
    actor: AuthenticatedUser,
    contractId: string,
    dto: PaymentMilestoneDto,
  ): Promise<PaymentMilestoneSummary> {
    const contract = await this.requireContract(actor, contractId);
    await this.assertMilestone(actor, dto.milestoneId ?? undefined);
    const row = await this.prisma.paymentMilestone.create({
      data: {
        contractId,
        milestoneId: dto.milestoneId ?? null,
        title: dto.title.trim(),
        amount: dto.amount,
        currency: dto.currency?.toUpperCase() ?? contract.currency,
        dueDate: toDateOrNull(dto.dueDate) ?? null,
        sortOrder: dto.sortOrder ?? contract.paymentMilestones.length,
      },
      include: { milestone: { select: { id: true, name: true } } },
    });
    await this.audit(contractId, row.id, null, row.status);
    return toPaymentMilestone(row);
  }

  async update(
    actor: AuthenticatedUser,
    contractId: string,
    paymentId: string,
    dto: UpdatePaymentMilestoneDto,
  ): Promise<PaymentMilestoneSummary> {
    const contract = await this.requireContract(actor, contractId);
    const before = contract.paymentMilestones.find((item) => item.id === paymentId);
    if (!before) {
      throw new NotFoundException('Payment milestone not found');
    }
    await this.assertMilestone(actor, dto.milestoneId ?? undefined);
    const row = await this.prisma.paymentMilestone.update({
      where: { id: paymentId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: toDateOrNull(dto.dueDate) } : {}),
        ...(dto.status !== undefined
          ? {
              status: dto.status,
              paidAt: dto.status === 'PAID' ? (before.paidAt ?? new Date()) : null,
            }
          : {}),
        ...(dto.invoiceReference !== undefined ? { invoiceReference: dto.invoiceReference } : {}),
        ...(dto.milestoneId !== undefined ? { milestoneId: dto.milestoneId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: { milestone: { select: { id: true, name: true } } },
    });
    await this.audit(contractId, paymentId, before.status, row.status);
    return toPaymentMilestone(row);
  }

  async remove(actor: AuthenticatedUser, contractId: string, paymentId: string): Promise<void> {
    const contract = await this.requireContract(actor, contractId);
    const before = contract.paymentMilestones.find((item) => item.id === paymentId);
    if (!before) {
      throw new NotFoundException('Payment milestone not found');
    }
    await this.prisma.paymentMilestone.update({
      where: { id: paymentId },
      data: { deletedAt: new Date() },
    });
    await this.audit(contractId, paymentId, before.status, 'DELETED');
  }

  private async requireContract(actor: AuthenticatedUser, id: string): Promise<ContractDetailRow> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Contracts are managed by the service provider');
    }
    const row = await this.contracts.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Contract not found');
    }
    return row;
  }

  private async assertMilestone(actor: AuthenticatedUser, milestoneId: string | undefined) {
    if (!milestoneId) {
      return;
    }
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }
  }

  private audit(contractId: string, paymentId: string, before: string | null, after: string) {
    return this.auditLog.record({
      action: AUDIT_ACTION.PAYMENT_MILESTONE_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.CONTRACT,
      entityId: contractId,
      before: before ? { paymentId, status: before } : undefined,
      after: { paymentId, status: after },
    });
  }
}
